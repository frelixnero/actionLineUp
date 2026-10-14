import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY } from "@/lib/league";

/**
 * Recent league lineups: the backing list for the matchup dropdown, the
 * team-name datalist, and "last roster for team" lookups. Read-only and
 * public, like the lineups themselves — writes stay behind PUT /api/lineup.
 */
export async function GET(request: Request) {
  const limit = Math.min(
    50,
    Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? 30) || 30),
  );
  try {
    const db = adminSupabase();
    const { data: lineups, error } = await db
      .from("lineups")
      .select("id, home_team, away_team, match_date, match_time, venue, submitted_at, updated_at")
      .eq("league_key", LEAGUE_KEY)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    if (!lineups || lineups.length === 0) return NextResponse.json({ lineups: [] });

    const ids = lineups.map((l) => l.id);
    const [{ data: players }, { data: results }] = await Promise.all([
      db.from("lineup_players").select("lineup_id, side, position, name").in("lineup_id", ids).order("position"),
      db.from("lineup_results").select("lineup_id, winner").in("lineup_id", ids),
    ]);

    const byLineup = (id: string, side: "home" | "away") =>
      (players ?? [])
        .filter((p) => p.lineup_id === id && p.side === side)
        .sort((a, b) => a.position - b.position)
        .map((p) => p.name);
    const scoreOf = (id: string) => {
      const rows = (results ?? []).filter((r) => r.lineup_id === id);
      return {
        homeWins: rows.filter((r) => r.winner === "home").length,
        awayWins: rows.filter((r) => r.winner === "away").length,
      };
    };

    return NextResponse.json({
      lineups: lineups.map((l) => ({
        id: l.id,
        homeTeam: l.home_team,
        awayTeam: l.away_team,
        matchDate: l.match_date,
        venue: l.venue,
        submittedAt: l.submitted_at,
        ...scoreOf(l.id),
        home: byLineup(l.id, "home"),
        away: byLineup(l.id, "away"),
      })),
    });
  } catch {
    return NextResponse.json({ lineups: [], offline: true });
  }
}
