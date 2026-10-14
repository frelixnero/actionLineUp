import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY } from "@/lib/league";
import { aggregatePlayerStats } from "@/lib/player-stats";

/**
 * Live player records aggregated from every stored lineup: rosters plus
 * recorded game winners, mapped through the board rotation. Feeds the
 * leaderboards, rivalry intel, and the forecast engine — replacing the
 * hardcoded stat table. Eight-ball breaks and table runs are not recorded
 * per game yet, so eight/TR stay zero until the schema grows them.
 */
export async function GET() {
  try {
    const db = adminSupabase();
    const { data: lineups, error } = await db
      .from("lineups")
      .select("id, home_team, away_team")
      .eq("league_key", LEAGUE_KEY)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    if (!lineups || lineups.length === 0) return NextResponse.json({ players: [] });

    const ids = lineups.map((l) => l.id);
    const [{ data: players }, { data: results }] = await Promise.all([
      db.from("lineup_players").select("lineup_id, side, position, name, active").in("lineup_id", ids).order("position"),
      db.from("lineup_results").select("lineup_id, game_key, winner").in("lineup_id", ids),
    ]);

    const forLineup = (id: string, side: "home" | "away") =>
      (players ?? [])
        .filter((p) => p.lineup_id === id && p.side === side)
        .sort((a, b) => a.position - b.position)
        .map((p) => ({ name: p.name, active: p.active !== false }));
    const winnersOf = (id: string): Record<string, "home" | "away"> => {
      const out: Record<string, "home" | "away"> = {};
      for (const r of results ?? []) {
        if (r.lineup_id === id && (r.winner === "home" || r.winner === "away")) out[r.game_key] = r.winner;
      }
      return out;
    };

    const stats = aggregatePlayerStats(
      lineups.map((l) => ({
        homeTeam: l.home_team,
        awayTeam: l.away_team,
        home: forLineup(l.id, "home"),
        away: forLineup(l.id, "away"),
        winners: winnersOf(l.id),
      })),
    );
    return NextResponse.json({ players: stats });
  } catch {
    return NextResponse.json({ players: [], offline: true });
  }
}
