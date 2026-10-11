export type MiniMatchSide = "home" | "away";

export type MiniMatchRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  match_number: number;
  home_player_id: string | null;
  away_player_id: string | null;
  home_player_name: string | null;
  away_player_name: string | null;
  home_score: number;
  away_score: number;
  home_confirmed: boolean;
  away_confirmed: boolean;
  winner_id: string | null;
  status: "pending" | "in_progress" | "completed";
  table_number?: number | null;
  updated_at?: string | null;
};

export function normalizeScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Math.max(0, Number.parseInt(value.trim(), 10));
  return 0;
}

export function winnerOf(homeScore: number, awayScore: number): MiniMatchSide | null {
  if (homeScore === awayScore) return null;
  return homeScore > awayScore ? "home" : "away";
}

export function canConfirmMatch(user: { id: string; role?: string } | null, match: Pick<MiniMatchRow, "home_player_id" | "away_player_id" | "winner_id">): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return user.id === match.home_player_id || user.id === match.away_player_id;
}

export function syncMatchState(match: MiniMatchRow): MiniMatchRow {
  const winner = winnerOf(match.home_score, match.away_score);
  const homeConfirmed = Boolean(match.home_confirmed);
  const awayConfirmed = Boolean(match.away_confirmed);

  const nextStatus = winner && homeConfirmed && awayConfirmed ? "completed" : homeConfirmed || awayConfirmed ? "in_progress" : "pending";
  const nextWinner = homeConfirmed && awayConfirmed && winner ? (winner === "home" ? match.home_player_id : match.away_player_id) : match.winner_id;

  return {
    ...match,
    status: nextStatus,
    winner_id: nextWinner,
  };
}
