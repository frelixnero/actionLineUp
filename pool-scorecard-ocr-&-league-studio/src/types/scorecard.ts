export interface PlayerScore {
  name: string;
  gamesPlayed: number;
  gamesWon: number;
}

export interface MatchGame {
  round: number; // 1 to 5
  gameNumber: number; // 1 to 25
  homePlayer: string;
  awayPlayer: string;
  winner: 'home' | 'away' | 'unplayed' | null;
  homeCumulativeScore: number | null;
  awayCumulativeScore: number | null;
  notes?: string;
}

export interface ScorecardData {
  leagueName: string;
  division?: string;
  matchDate?: string;
  tableNumber?: string;
  raceTo: number; // e.g., 13
  homeTeam: {
    name: string;
    players: string[];
    totalScore: number;
    duesPaid?: boolean;
    captainSignature?: string;
  };
  awayTeam: {
    name: string;
    players: string[];
    totalScore: number;
    duesPaid?: boolean;
    captainSignature?: string;
  };
  winnerTeam?: string;
  games: MatchGame[];
  handwritingReadability: 'HIGH' | 'MEDIUM' | 'LOW';
  rawNotes?: string;
  confidenceScore: number; // 0 to 100
}

export interface OcrAttemptLog {
  model: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  durationMs: number;
  error?: string;
  httpStatus?: number;
}

export interface OcrResponsePayload {
  ok: boolean;
  scanPath?: string;
  imageUrl?: string;
  modelUsed?: string;
  totalDurationMs?: number;
  data?: ScorecardData;
  attempts?: OcrAttemptLog[];
  diagnostics?: {
    fetchedImageBytes?: number;
    imageMimeType?: string;
    geminiApiKeyPresent?: boolean;
    reasonForPreviousAppFailure?: string;
  };
  error?: string;
}
