/**
 * Bracket logic shared by the client editor and the API routes, so a bracket
 * resolves identically no matter which side computed it.
 *
 * Stored truth is only the round-zero pairings plus each recorded winner.
 * Every later round is derived from those, which keeps the database from
 * holding a stale copy of a bracket position that a corrected result moved.
 */

export type TournamentFormat = "single" | "roundrobin";
export type Entrant = { id: string; name: string };
export type TournamentMatch = {
  id: string;
  round: number;
  slot: number;
  a: string | null;
  b: string | null;
  winner: string | null;
};

/** Bracket seed order for a size, e.g. 8 -> [1,8,4,5,2,7,3,6]. Keeps seeds 1 and 2 apart until the final. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const paired = order.length * 2;
    const next: number[] = [];
    for (const seed of order) next.push(seed, paired + 1 - seed);
    order = next;
  }
  return order;
}

export function resolveBracket(matches: TournamentMatch[]): TournamentMatch[] {
  if (matches.length === 0) return [];
  const next = matches.map(m => ({ ...m }));
  const maxRound = Math.max(...next.map(m => m.round));
  for (const m of next) if (m.round > 0) { m.a = null; m.b = null; }
  for (let r = 0; r <= maxRound; r++) {
    for (const m of next.filter(x => x.round === r)) {
      if (r === 0) {
        // Only round one can hold a true bye: an empty slot there means nobody entered.
        if (m.a && !m.b) m.winner = m.a;
        else if (!m.a && m.b) m.winner = m.b;
        else if (!m.a && !m.b) m.winner = null;
        else if (m.winner && m.winner !== m.a && m.winner !== m.b) m.winner = null;
      } else if (!m.a || !m.b) {
        // Later rounds: an empty slot means the feeding match is undecided, not a bye.
        m.winner = null;
      } else if (m.winner && m.winner !== m.a && m.winner !== m.b) {
        m.winner = null;
      }
      if (m.winner && r < maxRound) {
        const parent = next.find(x => x.round === r + 1 && x.slot === Math.floor(m.slot / 2));
        if (parent) { if (m.slot % 2 === 0) parent.a = m.winner; else parent.b = m.winner; }
      }
    }
  }
  return next;
}

export function buildSingleElimination(entrants: Entrant[]): TournamentMatch[] {
  if (entrants.length < 2) return [];
  const size = 2 ** Math.ceil(Math.log2(entrants.length));
  const rounds = Math.log2(size);
  const matches: TournamentMatch[] = [];
  for (let r = 0; r < rounds; r++) {
    for (let s = 0; s < size / 2 ** (r + 1); s++) {
      matches.push({ id: `r${r}s${s}`, round: r, slot: s, a: null, b: null, winner: null });
    }
  }
  const order = seedOrder(size);
  for (let s = 0; s < size / 2; s++) {
    const match = matches.find(m => m.round === 0 && m.slot === s);
    if (!match) continue;
    match.a = entrants[order[s * 2] - 1]?.id ?? null;
    match.b = entrants[order[s * 2 + 1] - 1]?.id ?? null;
  }
  return resolveBracket(matches);
}

export function buildRoundRobin(entrants: Entrant[]): TournamentMatch[] {
  const matches: TournamentMatch[] = [];
  for (let i = 0; i < entrants.length; i++) {
    for (let j = i + 1; j < entrants.length; j++) {
      matches.push({ id: `rr-${i}-${j}`, round: 0, slot: matches.length, a: entrants[i].id, b: entrants[j].id, winner: null });
    }
  }
  return matches;
}

export function buildMatches(format: TournamentFormat, entrants: Entrant[]): TournamentMatch[] {
  return format === "single" ? buildSingleElimination(entrants) : buildRoundRobin(entrants);
}

/** Champion id, or null while the event is still running. */
export function championOf(format: TournamentFormat, matches: TournamentMatch[]): string | null {
  if (matches.length === 0) return null;
  if (format === "roundrobin") {
    if (!matches.every(m => m.winner)) return null;
    const tally = new Map<string, number>();
    for (const m of matches) if (m.winner) tally.set(m.winner, (tally.get(m.winner) ?? 0) + 1);
    let best: string | null = null;
    for (const [id, wins] of tally) if (best === null || wins > (tally.get(best) ?? 0)) best = id;
    return best;
  }
  const maxRound = Math.max(...matches.map(m => m.round));
  return matches.find(m => m.round === maxRound)?.winner ?? null;
}

export function statusOf(format: TournamentFormat, matches: TournamentMatch[]): "setup" | "live" | "complete" {
  if (matches.length === 0) return "setup";
  return championOf(format, matches) ? "complete" : "live";
}
