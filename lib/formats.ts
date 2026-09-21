/**
 * Tournament format engine.
 *
 * A format is a config row, not a bespoke screen. The config selects a pairing
 * strategy, and the strategies live here so every format shares one match model,
 * one standings calculation and one champion rule.
 *
 * Honest limit on "formats are config, not code": the *selection* is config, but
 * Swiss pairing, chip elimination and losers-bracket routing are real algorithms.
 * Adding a seventh format that reuses an existing pairing rule is a config row.
 * Adding one with a new pairing rule is code plus tests, every time.
 *
 * MONEY: nothing in this engine models entry fees, pots, buy-ins or payouts, and
 * nothing should. Chips are a scoring unit with no cash value. Prize wording is a
 * free-text field the venue owns. Keep it that way.
 */

import { resolveBracket, seedOrder, type TournamentMatch } from "./bracket.ts";

export type PairingRule = "single" | "double" | "roundrobin" | "rr-playoff" | "swiss" | "chip";
export type SeedingRule = "as-entered" | "random";
export type EndsOn = "one-left" | "rounds-complete" | "all-played";

export type FormatConfig = {
  key: string;
  /** What the format is called in the software. */
  label: string;
  /** What players call it at the bar. This is the one shown in the UI. */
  barName: string;
  pairing: PairingRule;
  seeding: SeedingRule;
  /** Players per side. 2 builds doubles teams from the entrant pool. */
  teamSize: 1 | 2;
  /** Losses before elimination. 0 means nobody is eliminated. */
  lives: number;
  /** Swiss round count. "auto" = ceil(log2(field)). */
  rounds?: number | "auto";
  /** Chip tournament starting chips. */
  chips?: number;
  /** How many advance from the group stage in rr-playoff. */
  advancers?: number;
  endsOn: EndsOn;
  /** True if players go home early. Bars care about this more than anything else. */
  eliminates: boolean;
  blurb: string;
};

export const FORMATS: FormatConfig[] = [
  {
    key: "single", label: "Single elimination", barName: "Single Elimination",
    pairing: "single", seeding: "as-entered", teamSize: 1, lives: 1,
    endsOn: "one-left", eliminates: true,
    blurb: "Fastest to run. Half the room is out after one round.",
  },
  {
    key: "double", label: "Double elimination", barName: "Double Elimination",
    pairing: "double", seeding: "as-entered", teamSize: 1, lives: 2,
    endsOn: "one-left", eliminates: true,
    blurb: "One loss doesn't send you home. Roughly twice the matches.",
  },
  {
    key: "roundrobin", label: "Round robin", barName: "Round Robin",
    pairing: "roundrobin", seeding: "as-entered", teamSize: 1, lives: 0,
    endsOn: "all-played", eliminates: false,
    blurb: "Everyone plays everyone. Nobody is eliminated.",
  },
  {
    key: "rr-playoff", label: "Round robin into a playoff", barName: "Groups + Playoff",
    pairing: "rr-playoff", seeding: "as-entered", teamSize: 1, lives: 1, advancers: 4,
    endsOn: "one-left", eliminates: true,
    blurb: "Group stage first, then the top finishers play a bracket.",
  },
  {
    key: "swiss", label: "Swiss system", barName: "Swiss (Nobody Out)",
    pairing: "swiss", seeding: "as-entered", teamSize: 1, lives: 0, rounds: "auto",
    endsOn: "rounds-complete", eliminates: false,
    blurb: "Fixed number of rounds, nobody eliminated, ends on time. Built for a three-hour bar night.",
  },
  {
    key: "chip", label: "Chip tournament", barName: "Chip Night",
    pairing: "chip", seeding: "random", teamSize: 1, lives: 0, chips: 3,
    endsOn: "one-left", eliminates: true,
    blurb: "Everyone starts with chips. Lose a game, lose a chip. Chips are a score only — they carry no cash value.",
  },
  {
    key: "blind-draw", label: "Blind draw doubles", barName: "Blind Draw Doubles",
    pairing: "single", seeding: "random", teamSize: 2, lives: 1,
    endsOn: "one-left", eliminates: true,
    blurb: "Random partners drawn from the room. Puts weaker players on strong teams.",
  },
];

export const formatByKey = (key: string): FormatConfig =>
  FORMATS.find(f => f.key === key) ?? FORMATS[0];

export type Entrant = { id: string; name: string };
/** A side is whoever stands at the table: one player, or a drawn doubles team. */
export type Side = { id: string; name: string; memberIds: string[] };
export type EngineMatch = TournamentMatch & { phase?: "group" | "playoff"; bracket?: "w" | "l" | "gf" };

export type Rng = () => number;
const defaultRng: Rng = Math.random;

export function shuffled<T>(list: T[], rng: Rng = defaultRng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Turn the entrant list into sides. Doubles formats draw partners here. */
export function buildSides(config: FormatConfig, entrants: Entrant[], rng: Rng = defaultRng): Side[] {
  const ordered = config.seeding === "random" ? shuffled(entrants, rng) : entrants;
  if (config.teamSize === 1) {
    return ordered.map(e => ({ id: e.id, name: e.name, memberIds: [e.id] }));
  }
  const sides: Side[] = [];
  for (let i = 0; i < ordered.length; i += 2) {
    const a = ordered[i];
    const b = ordered[i + 1];
    sides.push(b
      ? { id: `t-${a.id}-${b.id}`, name: `${a.name} + ${b.name}`, memberIds: [a.id, b.id] }
      // Odd player out still gets a side so the draw is visible rather than silently dropping them.
      : { id: `t-${a.id}`, name: `${a.name} (no partner drawn)`, memberIds: [a.id] });
  }
  return sides;
}

export const swissRoundCount = (config: FormatConfig, fieldSize: number): number => {
  if (fieldSize < 2) return 0;
  const auto = Math.ceil(Math.log2(fieldSize));
  return config.rounds === "auto" || config.rounds === undefined ? auto : Math.max(1, config.rounds);
};

// ------------------------------------------------------------------ brackets

export function buildSingle(sides: Side[]): EngineMatch[] {
  if (sides.length < 2) return [];
  const size = 2 ** Math.ceil(Math.log2(sides.length));
  const matches: EngineMatch[] = [];
  const rounds = Math.log2(size);
  for (let r = 0; r < rounds; r++) {
    for (let s = 0; s < size / 2 ** (r + 1); s++) {
      matches.push({ id: `r${r}s${s}`, round: r, slot: s, a: null, b: null, winner: null });
    }
  }
  const order = seedOrder(size);
  for (let s = 0; s < size / 2; s++) {
    const m = matches.find(x => x.round === 0 && x.slot === s);
    if (!m) continue;
    m.a = sides[order[s * 2] - 1]?.id ?? null;
    m.b = sides[order[s * 2 + 1] - 1]?.id ?? null;
  }
  return resolveBracket(matches) as EngineMatch[];
}

/**
 * Double elimination.
 *
 * Winners bracket is a normal bracket. The losers bracket alternates between
 * "survivors play each other" and "survivors meet the players who just dropped
 * out of the winners bracket", which is the standard construction.
 */
export function buildDouble(sides: Side[]): EngineMatch[] {
  if (sides.length < 2) return [];
  const size = 2 ** Math.ceil(Math.log2(sides.length));
  const k = Math.log2(size);
  const matches: EngineMatch[] = [];

  for (let r = 0; r < k; r++) {
    for (let s = 0; s < size / 2 ** (r + 1); s++) {
      matches.push({ id: `w${r}s${s}`, round: r, slot: s, a: null, b: null, winner: null, bracket: "w" });
    }
  }
  const lbRounds = Math.max(0, 2 * k - 2);
  for (let j = 0; j < lbRounds; j++) {
    const m = Math.floor(j / 2);
    const count = Math.max(1, size / 2 ** (m + 2));
    for (let s = 0; s < count; s++) {
      matches.push({ id: `l${j}s${s}`, round: j, slot: s, a: null, b: null, winner: null, bracket: "l" });
    }
  }
  matches.push({ id: "gf", round: 0, slot: 0, a: null, b: null, winner: null, bracket: "gf" });

  const order = seedOrder(size);
  for (let s = 0; s < size / 2; s++) {
    const m = matches.find(x => x.id === `w0s${s}`);
    if (!m) continue;
    m.a = sides[order[s * 2] - 1]?.id ?? null;
    m.b = sides[order[s * 2 + 1] - 1]?.id ?? null;
  }
  return resolveDouble(matches, size);
}

const loserOf = (m: EngineMatch): string | null =>
  m.winner && m.a && m.b ? (m.winner === m.a ? m.b : m.a) : null;

/** Recompute every derived seat in a double-elimination bracket from round-zero pairings and winners. */
export function resolveDouble(matches: EngineMatch[], size?: number): EngineMatch[] {
  const next = matches.map(m => ({ ...m }));
  const wb = next.filter(m => m.bracket === "w");
  const lb = next.filter(m => m.bracket === "l");
  const gf = next.find(m => m.bracket === "gf");
  if (wb.length === 0) return next;
  const k = Math.round(Math.log2((size ?? (wb.filter(m => m.round === 0).length * 2))));

  const at = (b: "w" | "l", r: number, s: number) => next.find(m => m.bracket === b && m.round === r && m.slot === s);
  const clear = (m: EngineMatch) => { m.a = null; m.b = null; };
  for (const m of next) if (!(m.bracket === "w" && m.round === 0)) clear(m);

  const settle = (m: EngineMatch, isRoundZero: boolean) => {
    if (isRoundZero) {
      if (m.a && !m.b) m.winner = m.a;
      else if (!m.a && m.b) m.winner = m.b;
      else if (!m.a && !m.b) m.winner = null;
      else if (m.winner && m.winner !== m.a && m.winner !== m.b) m.winner = null;
    } else if (!m.a || !m.b) {
      m.winner = null;
    } else if (m.winner && m.winner !== m.a && m.winner !== m.b) {
      m.winner = null;
    }
  };

  // Winners bracket, feeding losers down as it goes.
  for (let r = 0; r < k; r++) {
    for (const m of wb.filter(x => x.round === r)) {
      settle(m, r === 0);
      if (m.winner && r < k - 1) {
        const parent = at("w", r + 1, Math.floor(m.slot / 2));
        if (parent) { if (m.slot % 2 === 0) parent.a = m.winner; else parent.b = m.winner; }
      }
    }
  }

  const lbRounds = Math.max(0, 2 * k - 2);
  for (let j = 0; j < lbRounds; j++) {
    const m2 = Math.floor(j / 2);
    for (const m of lb.filter(x => x.round === j)) {
      if (j === 0) {
        // First losers round pairs the players knocked out in winners round one.
        const a = wb.find(x => x.round === 0 && x.slot === m.slot * 2);
        const b = wb.find(x => x.round === 0 && x.slot === m.slot * 2 + 1);
        m.a = a ? loserOf(a) : null;
        m.b = b ? loserOf(b) : null;
      } else if (j % 2 === 1) {
        // Odd rounds: losers-bracket survivor meets a fresh drop-out from the winners bracket.
        const prev = at("l", j - 1, m.slot);
        const drop = wb.find(x => x.round === m2 + 1 && x.slot === m.slot);
        m.a = prev?.winner ?? null;
        m.b = drop ? loserOf(drop) : null;
      } else {
        // Even rounds: survivors play each other.
        const p1 = at("l", j - 1, m.slot * 2);
        const p2 = at("l", j - 1, m.slot * 2 + 1);
        m.a = p1?.winner ?? null;
        m.b = p2?.winner ?? null;
      }
      settle(m, false);
    }
  }

  if (gf) {
    const wbFinal = at("w", k - 1, 0);
    const lbFinal = lbRounds > 0 ? lb.filter(x => x.round === lbRounds - 1)[0] : undefined;
    gf.a = wbFinal?.winner ?? null;
    gf.b = lbFinal ? lbFinal.winner : null;
    settle(gf, false);
  }
  return next;
}

// -------------------------------------------------------------- round robin

export function buildRoundRobin(sides: Side[]): EngineMatch[] {
  const matches: EngineMatch[] = [];
  for (let i = 0; i < sides.length; i++) {
    for (let j = i + 1; j < sides.length; j++) {
      matches.push({ id: `rr-${i}-${j}`, round: 0, slot: matches.length, a: sides[i].id, b: sides[j].id, winner: null, phase: "group" });
    }
  }
  return matches;
}

// -------------------------------------------------------------------- swiss

export type Record_ = { id: string; wins: number; losses: number; played: string[]; hadBye: boolean };

export function recordsOf(sides: Side[], matches: EngineMatch[]): Record_[] {
  const byId = new Map<string, Record_>(sides.map(s => [s.id, { id: s.id, wins: 0, losses: 0, played: [], hadBye: false }]));
  for (const m of matches) {
    if (!m.winner) continue;
    const a = m.a ? byId.get(m.a) : undefined;
    const b = m.b ? byId.get(m.b) : undefined;
    if (m.a && m.b) {
      if (a && b) { a.played.push(b.id); b.played.push(a.id); }
      const w = byId.get(m.winner);
      const l = m.winner === m.a ? b : a;
      if (w) w.wins++;
      if (l) l.losses++;
    } else {
      // A lone side in a round is a bye: it counts as a win but not as a game played.
      const solo = a ?? b;
      if (solo) { solo.wins++; solo.hadBye = true; }
    }
  }
  return [...byId.values()];
}

/**
 * Pair one Swiss round: sort by score, pair inside score groups, never repeat a
 * pairing, and give any odd player a bye they have not had before.
 */
export function swissPairRound(sides: Side[], matches: EngineMatch[], round: number): EngineMatch[] {
  const records = recordsOf(sides, matches);
  const order = new Map(sides.map((s, i) => [s.id, i]));
  const ranked = [...records].sort((a, b) =>
    b.wins - a.wins || a.losses - b.losses || (order.get(a.id)! - order.get(b.id)!));

  let pool = ranked;
  let byeId: string | null = null;
  if (pool.length % 2 === 1) {
    // Bye goes to the lowest-ranked player who has not had one yet.
    for (let i = pool.length - 1; i >= 0; i--) {
      if (!pool[i].hadBye) { byeId = pool[i].id; break; }
    }
    if (!byeId) byeId = pool[pool.length - 1].id;
    pool = pool.filter(p => p.id !== byeId);
  }

  const used = new Set<string>();
  const pairs: [string, string][] = [];
  const backtrack = (index: number): boolean => {
    while (index < pool.length && used.has(pool[index].id)) index++;
    if (index >= pool.length) return true;
    const me = pool[index];
    used.add(me.id);
    for (let j = index + 1; j < pool.length; j++) {
      const other = pool[j];
      if (used.has(other.id)) continue;
      if (me.played.includes(other.id)) continue;   // no rematches
      used.add(other.id);
      pairs.push([me.id, other.id]);
      if (backtrack(index + 1)) return true;
      pairs.pop();
      used.delete(other.id);
    }
    used.delete(me.id);
    return false;
  };

  if (!backtrack(0)) {
    // Everyone left has already played everyone left. Fall back to adjacent
    // pairing rather than refusing to start the round.
    used.clear(); pairs.length = 0;
    for (let i = 0; i + 1 < pool.length; i += 2) pairs.push([pool[i].id, pool[i + 1].id]);
  }

  const out: EngineMatch[] = pairs.map(([a, b], slot) => ({ id: `s${round}s${slot}`, round, slot, a, b, winner: null }));
  if (byeId) out.push({ id: `s${round}s${out.length}`, round, slot: out.length, a: byeId, b: null, winner: byeId });
  return out;
}

// --------------------------------------------------------------------- chip

/**
 * Chips are a scoring unit. They are never money, never purchased, never paid out.
 * A chip is burned on a loss, not handed to the winner.
 */
export function chipCounts(config: FormatConfig, sides: Side[], matches: EngineMatch[]): Map<string, number> {
  const start = config.chips ?? 3;
  const counts = new Map(sides.map(s => [s.id, start]));
  for (const m of matches) {
    if (!m.winner || !m.a || !m.b) continue;
    // The loser burns a chip; the winner gains nothing. Two reasons this beats
    // transferring a chip: the total falls every game so the night ends on a
    // bounded number of matches instead of a random walk, and nothing in the
    // model ever looks like a stake changing hands.
    const loser = m.winner === m.a ? m.b : m.a;
    counts.set(loser, Math.max(0, (counts.get(loser) ?? start) - 1));
  }
  return counts;
}

export function chipPairRound(config: FormatConfig, sides: Side[], matches: EngineMatch[], round: number, rng: Rng = defaultRng): EngineMatch[] {
  const counts = chipCounts(config, sides, matches);
  const alive = shuffled(sides.filter(s => (counts.get(s.id) ?? 0) > 0), rng);
  if (alive.length < 2) return [];
  const out: EngineMatch[] = [];
  for (let i = 0; i + 1 < alive.length; i += 2) {
    out.push({ id: `c${round}s${out.length}`, round, slot: out.length, a: alive[i].id, b: alive[i + 1].id, winner: null });
  }
  // An odd player sits the round out with chips intact rather than being given a free chip.
  return out;
}

// ---------------------------------------------------------------- the engine

export type EngineState = { config: FormatConfig; sides: Side[]; matches: EngineMatch[] };

export function initialMatches(config: FormatConfig, sides: Side[], rng: Rng = defaultRng): EngineMatch[] {
  switch (config.pairing) {
    case "single": return buildSingle(sides);
    case "double": return buildDouble(sides);
    case "roundrobin":
    case "rr-playoff": return buildRoundRobin(sides);
    case "swiss": return sides.length < 2 ? [] : swissPairRound(sides, [], 0);
    case "chip": return sides.length < 2 ? [] : chipPairRound(config, sides, [], 0, rng);
  }
}

/** Re-derive everything downstream of the recorded winners. */
export function resolve(config: FormatConfig, matches: EngineMatch[]): EngineMatch[] {
  if (config.pairing === "single" || (config.pairing === "rr-playoff")) {
    const playoff = matches.filter(m => m.phase === "playoff");
    if (config.pairing === "rr-playoff" && playoff.length > 0) {
      return [...matches.filter(m => m.phase !== "playoff"), ...(resolveBracket(playoff) as EngineMatch[])];
    }
    return config.pairing === "single" ? (resolveBracket(matches) as EngineMatch[]) : matches;
  }
  if (config.pairing === "double") return resolveDouble(matches);
  return matches;
}

export const roundComplete = (matches: EngineMatch[], round: number): boolean => {
  const inRound = matches.filter(m => m.round === round);
  return inRound.length > 0 && inRound.every(m => m.winner);
};

/**
 * Formats that discover their next round only once the current one is done.
 * Returns the matches to append, or an empty list when there is nothing to add.
 */
export function nextRound(config: FormatConfig, sides: Side[], matches: EngineMatch[], rng: Rng = defaultRng): EngineMatch[] {
  if (config.pairing === "swiss") {
    const played = matches.length === 0 ? -1 : Math.max(...matches.map(m => m.round));
    if (played < 0) return swissPairRound(sides, [], 0);
    if (!roundComplete(matches, played)) return [];
    if (played + 1 >= swissRoundCount(config, sides.length)) return [];
    return swissPairRound(sides, matches, played + 1);
  }
  if (config.pairing === "chip") {
    const played = matches.length === 0 ? -1 : Math.max(...matches.map(m => m.round));
    if (played >= 0 && !roundComplete(matches, played)) return [];
    return chipPairRound(config, sides, matches, played + 1, rng);
  }
  if (config.pairing === "rr-playoff") {
    const groups = matches.filter(m => m.phase !== "playoff");
    if (groups.length === 0 || !groups.every(m => m.winner)) return [];
    if (matches.some(m => m.phase === "playoff")) return [];
    const advancers = Math.max(2, config.advancers ?? 4);
    const qualified = standings(config, sides, groups).slice(0, advancers)
      .map(s => sides.find(x => x.id === s.id))
      .filter((s): s is Side => Boolean(s));
    return buildSingle(qualified).map(m => ({ ...m, phase: "playoff" as const }));
  }
  return [];
}

export type StandingRow = { id: string; name: string; wins: number; losses: number; chips?: number };

export function standings(config: FormatConfig, sides: Side[], matches: EngineMatch[]): StandingRow[] {
  const records = recordsOf(sides, matches);
  const chips = config.pairing === "chip" ? chipCounts(config, sides, matches) : null;
  const nameOf = new Map(sides.map(s => [s.id, s.name]));
  const order = new Map(sides.map((s, i) => [s.id, i]));
  return records
    .map(r => ({ id: r.id, name: nameOf.get(r.id) ?? "—", wins: r.wins, losses: r.losses, ...(chips ? { chips: chips.get(r.id) ?? 0 } : {}) }))
    .sort((a, b) => (chips ? (b.chips ?? 0) - (a.chips ?? 0) : 0) || b.wins - a.wins || a.losses - b.losses || (order.get(a.id)! - order.get(b.id)!));
}

export function champion(config: FormatConfig, sides: Side[], matches: EngineMatch[]): string | null {
  if (matches.length === 0 || sides.length === 0) return null;
  switch (config.pairing) {
    case "single": {
      const max = Math.max(...matches.map(m => m.round));
      return matches.find(m => m.round === max)?.winner ?? null;
    }
    case "double":
      return matches.find(m => m.bracket === "gf")?.winner ?? null;
    case "roundrobin":
      return matches.every(m => m.winner) ? standings(config, sides, matches)[0]?.id ?? null : null;
    case "rr-playoff": {
      const playoff = matches.filter(m => m.phase === "playoff");
      if (playoff.length === 0) return null;
      const max = Math.max(...playoff.map(m => m.round));
      return playoff.find(m => m.round === max)?.winner ?? null;
    }
    case "swiss": {
      const total = swissRoundCount(config, sides.length);
      const done = Array.from({ length: total }, (_, r) => roundComplete(matches, r)).every(Boolean);
      return done ? standings(config, sides, matches)[0]?.id ?? null : null;
    }
    case "chip": {
      const counts = chipCounts(config, sides, matches);
      const alive = sides.filter(s => (counts.get(s.id) ?? 0) > 0);
      return alive.length === 1 ? alive[0].id : null;
    }
  }
}

export function statusOf(config: FormatConfig, sides: Side[], matches: EngineMatch[]): "setup" | "live" | "complete" {
  if (matches.length === 0) return "setup";
  return champion(config, sides, matches) ? "complete" : "live";
}
