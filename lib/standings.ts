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

export function sanitizeTeams(input: unknown) {
  if (!Array.isArray(input)) return [];
  return (input as any[]).map((row) => ({
    name: String(row?.name ?? "").trim().slice(0, 80),
    w: Math.max(0, Math.min(999, Number(row?.w) || 0)),
    l: Math.max(0, Math.min(999, Number(row?.l) || 0)),
    division: row?.division === "National" ? "National" : "American",
  })).filter((t) => t.name.length > 0);
}
