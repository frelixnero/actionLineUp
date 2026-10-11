export type PointOutcome = "win" | "runner_up" | "champion" | "finalist" | "placement" | "other";

export type DayTwoEvent = {
  playerId: string;
  playerName: string;
  result: PointOutcome | string;
  tournamentDay?: number;
  matchCount?: number;
  entryCount?: number;
  totalPoints?: number;
};

export type DayTwoLeaderboardRow = {
  playerId: string;
  playerName: string;
  wins: number;
  entriesCount: number;
  firstPlaceCount: number;
  secondPlaceCount: number;
  totalPoints: number;
};

export type FreeEntryCreditRow = {
  playerId: string;
  playerName: string;
  totalPoints: number;
  creditAmount: number;
};

const normalizeResult = (result: string): PointOutcome => {
  const value = result.trim().toLowerCase();
  if (value === "win") return "win";
  if (value === "runner_up" || value === "runner-up" || value === "second") return "runner_up";
  if (value === "champion" || value === "winner") return "champion";
  if (value === "finalist") return "finalist";
  if (value === "placement") return "placement";
  return "other";
};

const pointsForResult = (result: string): number => {
  const normalized = normalizeResult(result);
  switch (normalized) {
    case "win":
      return 1;
    case "finalist":
      return 5;
    case "runner_up":
      return 5;
    case "champion":
      return 10;
    case "placement":
      return 5;
    default:
      return 0;
  }
};

export function awardPointsForMatch(event: DayTwoEvent): {
  playerId: string;
  playerName: string;
  totalPoints: number;
  reason: string;
  reward: number;
  tournamentDay: number;
  matchCount: number;
  entryCount: number;
} {
  const reward = pointsForResult(event.result ?? "other");
  const tournamentDay = event.tournamentDay ?? 2;
  const matchCount = event.matchCount ?? 0;
  const entryCount = event.entryCount ?? 1;

  return {
    playerId: event.playerId,
    playerName: event.playerName,
    totalPoints: reward,
    reason: normalizeResult(event.result ?? "other") === "win" ? "match_win" : normalizeResult(event.result ?? "other") === "runner_up" ? "runner_up" : normalizeResult(event.result ?? "other") === "champion" ? "champion" : "placement",
    reward,
    tournamentDay,
    matchCount,
    entryCount,
  };
}

export function buildDayTwoLeaderboard(events: DayTwoEvent[]): DayTwoLeaderboardRow[] {
  const byPlayer = new Map<string, DayTwoLeaderboardRow>();

  for (const event of events) {
    const playerId = event.playerId.trim();
    const playerName = event.playerName.trim() || "Unknown player";
    const result = normalizeResult(event.result ?? "other");
    const entry = byPlayer.get(playerId) ?? {
      playerId,
      playerName,
      wins: 0,
      entriesCount: 0,
      firstPlaceCount: 0,
      secondPlaceCount: 0,
      totalPoints: 0,
    };

    entry.entriesCount += Math.max(1, event.entryCount ?? 1);
    if (result === "win") entry.wins += 1;
    if (result === "champion") entry.firstPlaceCount += 1;
    if (result === "runner_up") entry.secondPlaceCount += 1;
    entry.totalPoints += pointsForResult(event.result ?? "other");

    if (playerName) entry.playerName = playerName;
    byPlayer.set(playerId, entry);
  }

  return [...byPlayer.values()].sort((a, b) => b.totalPoints - a.totalPoints || a.playerName.localeCompare(b.playerName));
}

export function generateFreeEntryCredits(rows: Array<Pick<DayTwoLeaderboardRow, "playerId" | "playerName" | "totalPoints">>): FreeEntryCreditRow[] {
  return [...rows]
    .sort((a, b) => b.totalPoints - a.totalPoints || a.playerName.localeCompare(b.playerName))
    .slice(0, 3)
    .map((row) => ({
      playerId: row.playerId,
      playerName: row.playerName,
      totalPoints: row.totalPoints,
      creditAmount: 1,
    }));
}
