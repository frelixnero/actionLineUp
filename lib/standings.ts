export const DEFAULT_TEAMS = [
  { name: "Seguin Cue Club", w: 14, l: 4, division: "American" },
  { name: "Guadalupe Break", w: 12, l: 6, division: "American" },
  { name: "8-Ball Assassins", w: 11, l: 7, division: "American" },
  { name: "Corner Pocket Crew", w: 9, l: 9, division: "American" },
  { name: "Rack 'Em Rollers", w: 13, l: 5, division: "National" },
  { name: "Billiards & Brews", w: 10, l: 8, division: "National" },
  { name: "Diamond Cutters", w: 8, l: 10, division: "National" },
  { name: "Rail Masters", w: 5, l: 13, division: "National" },
];

export function applyMatchResult(teams: any[], winnerName: string, loserName: string) {
  const win = winnerName.trim().toLowerCase();
  const lose = loserName.trim().toLowerCase();
  return teams.map((t: any) => {
    const name = String(t.name || "").trim().toLowerCase();
    if (name === win) return { ...t, w: Number(t.w || 0) + 1 };
    if (name === lose) return { ...t, l: Number(t.l || 0) + 1 };
    return { ...t };
  });
}

export function normalizeTeamName(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function sameResult(
  a: { winner: string; loser: string } | null | undefined,
  b: { winner: string; loser: string } | null | undefined,
) {
  if (!a || !b) return false;
  return (
    normalizeTeamName(a.winner) === normalizeTeamName(b.winner) &&
    normalizeTeamName(a.loser) === normalizeTeamName(b.loser)
  );
}

export type GameWinnersInput =
  | Record<string, unknown>
  | Array<{ winner?: unknown } | string>
  | null
  | undefined;

export function countGameWinners(input: GameWinnersInput) {
  let home = 0;
  let away = 0;
  if (Array.isArray(input)) {
    for (const row of input) {
      const w = typeof row === "string" ? row : (row as { winner?: unknown })?.winner;
      if (w === "home") home += 1;
      else if (w === "away") away += 1;
    }
  } else if (input && typeof input === "object") {
    for (const v of Object.values(input)) {
      if (v === "home") home += 1;
      else if (v === "away") away += 1;
    }
  }
  return { home, away };
}

/**
 * Derive the decisive match result from recorded game winners.
 * Returns null when there is no winner (empty or tied).
 */
export function decideMatchResult(
  winners: GameWinnersInput,
  homeTeam: string,
  awayTeam: string,
) {
  const { home, away } = countGameWinners(winners);
  if (home === away) return null;
  const h = String(homeTeam ?? "").trim().slice(0, 80);
  const a = String(awayTeam ?? "").trim().slice(0, 80);
  if (!h || !a) return null;
  return home > away
    ? { winner: h, loser: a, homeWins: home, awayWins: away, side: "home" as const }
    : { winner: a, loser: h, homeWins: home, awayWins: away, side: "away" as const };
}

export function sanitizeTeams(input: unknown) {
  if (!Array.isArray(input)) return [];
  return (input as any[]).map((row) => ({
    name: String(row?.name ?? "").trim().slice(0, 80),
    w: Math.max(0, Math.min(999, Number(row?.w) || 0)),
    l: Math.max(0, Math.min(999, Number(row?.l) || 0)),
    division: row?.division === "National" ? "National" : "American",
  })).filter((t) => t.name.length > 0);
}
