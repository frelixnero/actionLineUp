import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY } from "@/lib/league";
import { FORMATS } from "@/lib/formats";

const FORMAT_KEYS = new Set(FORMATS.map(f => f.key));

export async function GET() {
  try {
    const { data, error } = await adminSupabase()
      .from("tournaments")
      .select("id, name, format, race_to, status, prize_note, rounds, chips, advancers, created_at")
      .eq("league_key", LEAGUE_KEY)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const tournaments = (data ?? []).map(t => ({
      id: t.id, name: t.name, format: t.format, raceTo: t.race_to, status: t.status, prizeNote: t.prize_note ?? "", createdAt: t.created_at,
    }));
    return NextResponse.json({ tournaments });
  } catch {
    // Same shape as the announcements route: an unreachable backend reads as empty,
    // so the client can fall back to local storage instead of showing an error page.
    return NextResponse.json({ tournaments: [], offline: true });
  }
}

export async function POST(request: Request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Only the league owner can create a tournament." }, { status: 403 });
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    const format = typeof body?.format === "string" && FORMAT_KEYS.has(body.format) ? body.format : "single";
    const raceToRaw = Number(body?.raceTo);
    const raceTo = Number.isFinite(raceToRaw) ? Math.min(50, Math.max(1, Math.trunc(raceToRaw))) : 5;
    // Venue-entered prize wording. Free text only; never a computed amount.
    const prizeNote = typeof body?.prizeNote === "string" ? body.prizeNote.trim().slice(0, 280) : "";
    const clamp = (v: unknown, lo: number, hi: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : null;
    };
    const rounds = body?.rounds == null ? null : clamp(body.rounds, 1, 20);
    const chips = body?.chips == null ? null : clamp(body.chips, 1, 20);
    const advancers = body?.advancers == null ? null : clamp(body.advancers, 2, 64);

    const db = adminSupabase();

    // Publishing twice should adopt the board that is already running, not start
    // a second one. Without this every click created another tournament and the
    // client loaded whichever happened to be newest.
    const { data: running } = await db
      .from("tournaments")
      .select("id, name, format, race_to, status, prize_note, rounds, chips, advancers, created_at")
      .eq("league_key", LEAGUE_KEY)
      .neq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (running) {
      return NextResponse.json({
        tournament: { id: running.id, name: running.name, format: running.format, raceTo: running.race_to, status: running.status, prizeNote: running.prize_note ?? "", createdAt: running.created_at },
        reused: true,
      });
    }

    const { data, error } = await db
      .from("tournaments")
      .insert({ league_key: LEAGUE_KEY, name, format, race_to: raceTo, status: "setup", created_by: owner.id, prize_note: prizeNote || null, rounds, chips, advancers })
      .select("id, name, format, race_to, status, prize_note, rounds, chips, advancers, created_at")
      .single();
    if (error) throw error;
    return NextResponse.json({
      tournament: { id: data.id, name: data.name, format: data.format, raceTo: data.race_to, status: data.status, prizeNote: data.prize_note ?? "", createdAt: data.created_at },
    });
  } catch {
    return NextResponse.json({ error: "Could not create the tournament." }, { status: 503 });
  }
}
