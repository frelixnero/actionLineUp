import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { currentUser } from "@/lib/auth";
import { canEditLineup, LEAGUE_KEY } from "@/lib/league";
import { adminSupabase } from "@/lib/supabase";
import { coerceScorecard, validateScorecard } from "@/lib/scorecard-validate";
import { matchPlayerToRoster } from "@/lib/roster-matcher";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "scorecard-scans";
const FOLDER = LEAGUE_KEY;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const HOURLY_CAP = 10;
const DAILY_CAP = 30;

const safeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "scoresheet";

async function ensureBucket() {
  const { error } = await adminSupabase().storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: "10MB",
    allowedMimeTypes: [...ALLOWED_MIME],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
}

/** Count this uploader's scans since `sinceIso`. Missing table => no limit. */
async function scanCountSince(uploaderId: string, sinceIso: string): Promise<number | null> {
  try {
    const { count, error } = await adminSupabase()
      .from("scorecard_scans")
      .select("id", { count: "exact", head: true })
      .eq("uploader_id", uploaderId)
      .gte("created_at", sinceIso);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

const SCAN_PROMPT = `You read handwritten pool league score sheets. Extract every game into JSON — no prose, JSON only.

Schema:
{
  "leagueName": "string",
  "homeTeam": "string",
  "awayTeam": "string",
  "homeTotal": number,
  "visitorTotal": number,
  "raceTarget": number | null,
  "games": [
    {
      "gameNumber": number,
      "roundNumber": number | null,
      "homePlayer": "string (transcribe exactly as written)",
      "visitorPlayer": "string (transcribe exactly as written)",
      "winner": "home" | "visitor" | "unknown",
      "homeBreak": boolean,
      "visitorBreak": boolean,
      "homeRunningScore": number | null,
      "visitorRunningScore": number | null
    }
  ]
}

Rules:
- gameNumber follows the sheet's printed game order (1..N across rounds).
- winner is "unknown" when the W/L mark is illegible or crossed out — never guess.
- raceTarget is the printed race-to number (e.g. 13) or null if the sheet shows none.
- Transcribe names exactly as written; roster matching happens downstream.
- If the layout is not a recognizable score matrix, return {"unknownLayout": true} plus whatever partial games you found.`;

function stripFences(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return t;
  return t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "").trim();
}

/**
 * Scan a paper score sheet: authenticated upload -> private Supabase
 * storage -> Gemini vision extraction -> fuzzy roster match -> validation.
 * Nothing is written to lineups here; the captain reviews and approves
 * in the verification modal, which commits via PUT /api/lineup.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in before scanning a score sheet." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a photo of the score sheet." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Use an image under 10 MB." }, { status: 400 });
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: "Use a JPG, PNG, or WebP photo. HEIC is not supported — retake as JPG." },
      { status: 400 },
    );
  }

  const homeTeam = typeof form.get("homeTeam") === "string" ? (form.get("homeTeam") as string).trim().slice(0, 80) : "";
  const awayTeam = typeof form.get("awayTeam") === "string" ? (form.get("awayTeam") as string).trim().slice(0, 80) : "";
  const lineupId = typeof form.get("lineupId") === "string" ? (form.get("lineupId") as string).trim() : "";
  const raceTargetHint =
    typeof form.get("raceTarget") === "string" ? Number(form.get("raceTarget")) : NaN;

  // Permission mirrors the lineup write path: owner or a captain of either
  // team when teams are known; any signed-in user otherwise (scan commits
  // nothing, approval still goes through PUT /api/lineup).
  if (homeTeam && awayTeam) {
    const permission = await canEditLineup(homeTeam, awayTeam);
    if (!permission.ok) return NextResponse.json({ error: permission.error }, { status: permission.status });
  }

  // Abuse control before any paid vision call.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [lastHour, lastDay] = await Promise.all([
    scanCountSince(user.id, hourAgo),
    scanCountSince(user.id, dayAgo),
  ]);
  if (lastHour !== null && lastHour >= HOURLY_CAP) {
    return NextResponse.json({ error: "Scan limit reached (10 per hour). Try again shortly." }, { status: 429 });
  }
  if (lastDay !== null && lastDay >= DAILY_CAP) {
    return NextResponse.json({ error: "Daily scan limit reached (30). Try again tomorrow." }, { status: 429 });
  }

  // Persist the image first so every vision call has an audit trail.
  let storagePath: string;
  try {
    await ensureBucket();
    storagePath = `${FOLDER}/${lineupId || "unlinked"}/${Date.now()}-${user.id.slice(0, 8)}-${safeName(file.name || "scoresheet.jpg")}`;
    const { error } = await adminSupabase().storage.from(BUCKET).upload(storagePath, file, {
      contentType: mime,
      upsert: false,
    });
    if (error) throw error;
  } catch {
    return NextResponse.json({ error: "The photo could not be stored. Try again." }, { status: 503 });
  }

  try {
    await adminSupabase().from("scorecard_scans").insert({
      league_key: LEAGUE_KEY,
      lineup_id: lineupId || null,
      uploader_id: user.id,
      storage_path: storagePath,
    });
  } catch {
    // Audit write is best-effort; the scan itself can proceed.
  }

  const { data: signed } = await adminSupabase().storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60);

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    // Image is safely stored; the captain can still score manually from it.
    return NextResponse.json({
      ok: true,
      visionAvailable: false,
      scanPath: storagePath,
      imageUrl: signed?.signedUrl ?? null,
      parsed: null,
      matches: [],
      warnings: [{ code: "UNKNOWN_LAYOUT", message: "Automatic reading is not configured. Score from the photo manually." }],
    });
  }

  // Roster context for fuzzy matching: prefer the linked lineup's players.
  let homeRoster: string[] = [];
  let awayRoster: string[] = [];
  if (lineupId) {
    try {
      const { data: players } = await adminSupabase()
        .from("lineup_players")
        .select("side, name")
        .eq("lineup_id", lineupId)
        .order("position");
      homeRoster = (players ?? []).filter((p) => p.side === "home").map((p) => p.name);
      awayRoster = (players ?? []).filter((p) => p.side === "away").map((p) => p.name);
    } catch {
      // Roster context is optional; raw names still return.
    }
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
    });
    const result = await model.generateContent([
      { text: SCAN_PROMPT },
      { inlineData: { data: bytes, mimeType: mime } },
    ]);
    const parsed = JSON.parse(stripFences(result.response.text() ?? "{}")) as Record<string, unknown>;
    const games = Array.isArray(parsed.games) ? parsed.games : [];

    const card = coerceScorecard({
      ...parsed,
      homeTeam: (parsed.homeTeam as string) || homeTeam,
      awayTeam: ((parsed.awayTeam ?? parsed.visitorTeam) as string) || awayTeam,
      raceTarget: (parsed.raceTarget as number) ?? (Number.isFinite(raceTargetHint) ? raceTargetHint : null),
    });
    const { warnings } = validateScorecard(card);
    if (parsed.unknownLayout === true && games.length === 0) {
      warnings.unshift({ code: "UNKNOWN_LAYOUT", message: "This page was not recognized as a score matrix — review every row." });
    }

    const matches = card.games.map((g) => ({
      gameNumber: g.gameNumber,
      home: homeRoster.length > 0 ? matchPlayerToRoster(g.homePlayerRaw, homeRoster) : null,
      visitor: awayRoster.length > 0 ? matchPlayerToRoster(g.visitorPlayerRaw, awayRoster) : null,
    }));

    return NextResponse.json({
      ok: true,
      visionAvailable: true,
      scanPath: storagePath,
      imageUrl: signed?.signedUrl ?? null,
      parsed: card,
      matches,
      warnings,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        scanPath: storagePath,
        imageUrl: signed?.signedUrl ?? null,
        error: "The sheet could not be read automatically. Score from the photo manually.",
      },
      { status: 502 },
    );
  }
}
