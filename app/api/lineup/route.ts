import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY, canEditLineup } from "@/lib/league";

type Side = "home" | "away";
type Payment = "paid" | "due" | "pending";
const PAYMENTS: Payment[] = ["paid", "due", "pending"];

type PlayerRow = { side: Side; position: number; name: string; role: string; payment: Payment; active: boolean };

const cleanPayment = (v: unknown): Payment => (PAYMENTS.includes(v as Payment) ? (v as Payment) : "due");
const cleanText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function parseRoster(raw: unknown, side: Side): PlayerRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((p, position) => ({
    side,
    position,
    name: cleanText((p as { name?: unknown })?.name, 80),
    role: cleanText((p as { position?: unknown })?.position, 40) || "Player",
    payment: cleanPayment((p as { payment?: unknown })?.payment),
    active: (p as { active?: unknown })?.active !== false,
  }));
}

/** Latest lineup for the league, with both rosters and any recorded game winners. */
export async function GET() {
  try {
    const db = adminSupabase();
    const { data: lineup, error } = await db
      .from("lineups")
      .select("id, home_team, away_team, match_date, match_time, venue, scoring, updated_at")
      .eq("league_key", LEAGUE_KEY)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!lineup) return NextResponse.json({ lineup: null });

    const [{ data: players }, { data: results }] = await Promise.all([
      db.from("lineup_players").select("side, position, name, role, payment, active").eq("lineup_id", lineup.id).order("position"),
      db.from("lineup_results").select("game_key, winner").eq("lineup_id", lineup.id),
    ]);

    const bySide = (side: Side) => (players ?? [])
      .filter(p => p.side === side)
      .sort((a, b) => a.position - b.position)
      .map(p => ({ name: p.name, position: p.role, payment: p.payment as Payment, active: p.active }));

    const winners: Record<string, "home" | "away"> = {};
    for (const r of results ?? []) winners[r.game_key as string] = r.winner as "home" | "away";

    return NextResponse.json({
      lineup: {
        id: lineup.id,
        homeTeam: lineup.home_team,
        awayTeam: lineup.away_team,
        home: bySide("home"),
        away: bySide("away"),
        matchInfo: { date: lineup.match_date ?? "", time: lineup.match_time ?? "", venue: lineup.venue ?? "" },
        scoring: lineup.scoring ?? {},
        winners,
        updatedAt: lineup.updated_at,
      },
    });
  } catch {
    // Unreachable backend reads as "nothing shared yet" so the client keeps its local copy.
    return NextResponse.json({ lineup: null, offline: true });
  }
}

/** Publish the lineup so both teams see the same thing. Owner or a captain of either team. */
export async function PUT(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Could not read the lineup." }, { status: 400 });
  }

  const homeTeam = cleanText(body?.homeTeam, 80);
  const awayTeam = cleanText(body?.awayTeam, 80);

  const permission = await canEditLineup(homeTeam, awayTeam);
  if (!permission.ok) return NextResponse.json({ error: permission.error }, { status: permission.status });

  try {
    const db = adminSupabase();
    const info = (body?.matchInfo ?? {}) as { date?: unknown; time?: unknown; venue?: unknown };
    const matchDate = cleanText(info.date, 10);

    const payload = {
      league_key: LEAGUE_KEY,
      home_team: homeTeam,
      away_team: awayTeam,
      // An empty date string is not a valid date; store nothing rather than failing the write.
      match_date: /^\d{4}-\d{2}-\d{2}$/.test(matchDate) ? matchDate : null,
      match_time: cleanText(info.time, 40) || null,
      venue: cleanText(info.venue, 160) || null,
      scoring: (body?.scoring && typeof body.scoring === "object") ? body.scoring : {},
      updated_by: permission.user.id,
    };

    const existingId = typeof body?.id === "string" ? body.id : null;
    let lineupId: string;
    if (existingId) {
      const { data, error } = await db.from("lineups").update(payload).eq("id", existingId).eq("league_key", LEAGUE_KEY).select("id").single();
      if (error) throw error;
      lineupId = data.id;
    } else {
      const { data, error } = await db.from("lineups").insert(payload).select("id").single();
      if (error) throw error;
      lineupId = data.id;
    }

    const roster = [...parseRoster(body?.home, "home"), ...parseRoster(body?.away, "away")];
    await db.from("lineup_players").delete().eq("lineup_id", lineupId);
    if (roster.length > 0) {
      const { error } = await db.from("lineup_players").insert(roster.map(p => ({ lineup_id: lineupId, ...p })));
      if (error) throw error;
    }

    const winners = (body?.winners && typeof body.winners === "object") ? body.winners as Record<string, unknown> : {};
    const resultRows = Object.entries(winners)
      .filter(([key, value]) => key.length <= 20 && (value === "home" || value === "away"))
      .map(([game_key, winner]) => ({ lineup_id: lineupId, game_key, winner: winner as Side, recorded_by: permission.user.id }));
    await db.from("lineup_results").delete().eq("lineup_id", lineupId);
    if (resultRows.length > 0) {
      const { error } = await db.from("lineup_results").insert(resultRows);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, id: lineupId });
  } catch {
    return NextResponse.json({ error: "Could not publish the lineup." }, { status: 503 });
  }
}
