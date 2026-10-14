/**
 * Live player statistics derived from stored lineups.
 *
 * Pure aggregation: given lineups with rosters + recorded game winners,
 * reconstruct the same rotation the board builds (buildRotation in
 * app/page.tsx) and tally per-player wins/losses. This replaces the
 * hardcoded statPlayers table with numbers that move when score sheets
 * are confirmed. Break-and-run / table-run counts are not recorded in
 * lineup_results, so eight/TR stay zero until the schema grows them.
 */

export type StatsLineup = {
  homeTeam: string;
  awayTeam: string;
  home: { name: string; active?: boolean }[];
  away: { name: string; active?: boolean }[];
  winners: Record<string, "home" | "away">;
};

export type PlayerStat = { name: string; team: string; w: number; l: number; eight: number; tr: number };

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** Mirrors buildRotation(size) in app/page.tsx — keep the two in sync. */
export function rotationOrder(size: number): number[][] {
  if (size <= 0) return [];
  return Array.from({ length: Math.min(4, size) }, (_, r) =>
    Array.from({ length: size }, (_, h) => (h + r) % size),
  );
}

export function aggregatePlayerStats(lineups: StatsLineup[]): PlayerStat[] {
  const byKey = new Map<string, PlayerStat>();
  const touch = (name: string, team: string) => {
    const clean = String(name ?? "").trim();
    if (!clean) return null;
    const key = `${norm(clean)}|${norm(team)}`;
    let row = byKey.get(key);
    if (!row) {
      row = { name: clean, team: String(team ?? "").trim(), w: 0, l: 0, eight: 0, tr: 0 };
      byKey.set(key, row);
    }
    return row;
  };

  for (const lineup of lineups ?? []) {
    const home = (lineup.home ?? []).filter((p) => p?.active !== false);
    const away = (lineup.away ?? []).filter((p) => p?.active !== false);
    const size = Math.min(home.length, away.length);
    if (size === 0) continue;
    for (const [r, order] of rotationOrder(size).entries()) {
      order.forEach((a, h) => {
        const homePlayer = home[h];
        const awayPlayer = away[a];
        if (!homePlayer || !awayPlayer) return;
        const winner = (lineup.winners ?? {})[`${r}-${h}`];
        if (winner !== "home" && winner !== "away") return;
        const homeRow = touch(homePlayer.name, lineup.homeTeam);
        const awayRow = touch(awayPlayer.name, lineup.awayTeam);
        if (!homeRow || !awayRow) return;
        if (winner === "home") {
          homeRow.w++;
          awayRow.l++;
        } else {
          awayRow.w++;
          homeRow.l++;
        }
      });
    }
  }

  return [...byKey.values()].sort((a, b) => b.w - a.w || a.l - b.l || a.name.localeCompare(b.name));
}
