/**
 * Score-sheet validation and scanned-to-board mapping.
 *
 * Pure functions, no I/O: the scan API parses with vision, then runs
 * everything here before the verification modal ever shows a row. The
 * rules are format-generic (race target is an input, not a constant) so
 * a Tri-City race-to-13 sheet and a Seguin race-to-11 sheet share one
 * code path.
 */

import { normalizeName } from "./roster-matcher.ts";

export type GameWinner = "home" | "visitor" | "unplayed" | "unknown";

export type ScannedGame = {
  gameNumber: number;
  roundNumber?: number;
  homePlayerRaw: string;
  visitorPlayerRaw: string;
  winner: GameWinner;
  homeBreak?: boolean;
  visitorBreak?: boolean;
  homeRunningScore?: number;
  visitorRunningScore?: number;
  needsReview?: boolean;
};

export type ParsedScorecard = {
  leagueName?: string;
  homeTeam: string;
  awayTeam: string;
  homeTotal: number;
  visitorTotal: number;
  raceTarget?: number | null;
  rawNotes?: string;
  games: ScannedGame[];
};

export type ScorecardWarning = {
  code:
    | "TOTAL_MISMATCH"
    | "SCORE_NOT_MONOTONIC"
    | "SCORE_STEP_INVALID"
    | "GAMES_AFTER_RACE"
    | "UNKNOWN_WINNER"
    | "DUPLICATE_GAME"
    | "MISSING_NAMES"
    | "UNKNOWN_LAYOUT";
  message: string;
  gameNumber?: number;
};

export type ValidationResult = { valid: boolean; warnings: ScorecardWarning[] };

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Coerce loose vision JSON into a ParsedScorecard. Never throws. */
export function coerceScorecard(raw: unknown): ParsedScorecard {
  const fallback: ParsedScorecard = {
    homeTeam: "", awayTeam: "", homeTotal: 0, visitorTotal: 0, raceTarget: null, rawNotes: undefined, games: [],
  };
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
  const homeTeam = str(r.homeTeam) || str((r.home as Record<string, unknown> | undefined)?.name);
  const awayTeam =
    str(r.awayTeam) || str(r.visitorTeam) || str((r.visitor as Record<string, unknown> | undefined)?.name);
  const home = r.home as Record<string, unknown> | undefined;
  const visitor = r.visitor as Record<string, unknown> | undefined;
  const homeTotal = num(r.homeTotal) ?? num(home?.totalScore) ?? 0;
  const visitorTotal = num(r.visitorTotal) ?? num(visitor?.totalScore) ?? 0;
  const raceTarget = num(r.raceTarget) ?? null;
  const list = Array.isArray(r.games) ? r.games : [];
  const games: ScannedGame[] = list.slice(0, 100).map((g, i) => {
    const game = (g ?? {}) as Record<string, unknown>;
    const winnerRaw = typeof game.winner === "string" ? game.winner.toLowerCase() : "";
    const winner: GameWinner =
      winnerRaw === "home" || winnerRaw === "visitor" || winnerRaw === "unplayed" ? winnerRaw : "unknown";
    return {
      gameNumber: num(game.gameNumber) ?? i + 1,
      roundNumber: num(game.roundNumber),
      homePlayerRaw: str(game.homePlayer) || str(game.homePlayerRaw),
      visitorPlayerRaw: str(game.visitorPlayer) || str(game.visitorPlayerRaw),
      winner,
      homeBreak: game.homeBreak === true,
      visitorBreak: game.visitorBreak === true,
      homeRunningScore: num(game.homeRunningScore),
      visitorRunningScore: num(game.visitorRunningScore),
      needsReview: winner === "unknown",
    };
  });
  return {
    leagueName: str(r.leagueName) || undefined,
    homeTeam, awayTeam, homeTotal, visitorTotal, raceTarget, games,
    rawNotes: str(r.rawNotes) || undefined,
  };
}

/**
 * Enforce game-logic invariants: monotonic running scores that step by at
 * most 1, declared totals that equal counted winners, no games after the
 * race is decided, no duplicate game numbers. Returns warnings; the caller
 * decides whether to block (we never block — the captain reviews).
 */
export function validateScorecard(
  card: ParsedScorecard,
  opts?: { raceTarget?: number | null },
): ValidationResult {
  const warnings: ScorecardWarning[] = [];
  const games = [...(card?.games ?? [])].sort((a, b) => a.gameNumber - b.gameNumber);

  const seen = new Set<number>();
  for (const g of games) {
    if (seen.has(g.gameNumber)) {
      warnings.push({ code: "DUPLICATE_GAME", message: `Game ${g.gameNumber} appears twice.`, gameNumber: g.gameNumber });
    }
    seen.add(g.gameNumber);
    if (!normalizeName(g.homePlayerRaw) || !normalizeName(g.visitorPlayerRaw)) {
      warnings.push({ code: "MISSING_NAMES", message: `Game ${g.gameNumber} is missing a player name.`, gameNumber: g.gameNumber });
    }
    // "unplayed" is an explicit verdict (post-race games), not a gap.
    if (g.winner === "unknown") {
      warnings.push({ code: "UNKNOWN_WINNER", message: `Game ${g.gameNumber} has no clear winner — needs review.`, gameNumber: g.gameNumber });
    }
  }

  const homeWins = games.filter((g) => g.winner === "home").length;
  const visitorWins = games.filter((g) => g.winner === "visitor").length;
  if (homeWins !== card.homeTotal || visitorWins !== card.visitorTotal) {
    warnings.push({
      code: "TOTAL_MISMATCH",
      message: `Declared total ${card.homeTotal}–${card.visitorTotal} does not match counted winners ${homeWins}–${visitorWins}.`,
    });
  }

  // Running-score track must never go backwards and may only step by 0/1.
  let prevH: number | undefined;
  let prevV: number | undefined;
  for (const g of games) {
    if (g.homeRunningScore !== undefined && prevH !== undefined) {
      const step = g.homeRunningScore - prevH;
      if (step < 0) warnings.push({ code: "SCORE_NOT_MONOTONIC", message: `Home running score drops at game ${g.gameNumber}.`, gameNumber: g.gameNumber });
      else if (step > 1) warnings.push({ code: "SCORE_STEP_INVALID", message: `Home running score jumps by ${step} at game ${g.gameNumber}.`, gameNumber: g.gameNumber });
    }
    if (g.visitorRunningScore !== undefined && prevV !== undefined) {
      const step = g.visitorRunningScore - prevV;
      if (step < 0) warnings.push({ code: "SCORE_NOT_MONOTONIC", message: `Visitor running score drops at game ${g.gameNumber}.`, gameNumber: g.gameNumber });
      else if (step > 1) warnings.push({ code: "SCORE_STEP_INVALID", message: `Visitor running score jumps by ${step} at game ${g.gameNumber}.`, gameNumber: g.gameNumber });
    }
    if (g.homeRunningScore !== undefined) prevH = g.homeRunningScore;
    if (g.visitorRunningScore !== undefined) prevV = g.visitorRunningScore;
  }

  const race = opts?.raceTarget ?? card.raceTarget ?? null;
  if (race && race > 0) {
    let h = 0;
    let v = 0;
    let decidedAt: number | null = null;
    for (const g of games) {
      if (g.winner === "home") h++;
      if (g.winner === "visitor") v++;
      if (decidedAt === null && (h >= race || v >= race)) decidedAt = g.gameNumber;
      else if (decidedAt !== null && (g.winner === "home" || g.winner === "visitor")) {
        warnings.push({ code: "GAMES_AFTER_RACE", message: `Game ${g.gameNumber} was played after the race to ${race} was decided at game ${decidedAt}.`, gameNumber: g.gameNumber });
        break;
      }
    }
  }

  return { valid: warnings.length === 0, warnings };
}

export type BoardMatchup = { id: string; homeName: string; awayName: string };

/**
 * Map scanned games onto the board's matchup ids (`${round}-${slot}`) by
 * normalized name pairs. Returns winners for matched pairings plus the
 * list of game numbers that need manual scoring. First match wins; a
 * scanned pairing already consumed cannot match twice.
 */
export function mapScannedToWinners(
  games: ScannedGame[],
  matchups: BoardMatchup[],
): { winners: Record<string, "home" | "away">; unmatched: number[]; skipped: number[] } {
  const winners: Record<string, "home" | "away"> = {};
  const unmatched: number[] = [];
  const skipped: number[] = [];
  const used = new Set<string>();
  for (const g of games) {
    if (g.winner === "unplayed") {
      skipped.push(g.gameNumber);
      continue;
    }
    const hn = normalizeName(g.homePlayerRaw);
    const vn = normalizeName(g.visitorPlayerRaw);
    const hit = matchups.find(
      (m) => !used.has(m.id) && normalizeName(m.homeName) === hn && normalizeName(m.awayName) === vn,
    );
    if (!hit) {
      unmatched.push(g.gameNumber);
      continue;
    }
    used.add(hit.id);
    winners[hit.id] = g.winner === "home" ? "home" : "away";
  }
  return { winners, unmatched, skipped };
}
