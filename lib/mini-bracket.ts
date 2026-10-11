import { resolveBracket, seedOrder } from "./bracket.ts";

export type MiniBracketMatch = {
  id: string;
  round: number;
  slot: number;
  a: string | null;
  b: string | null;
  winner: string | null;
};

export function buildMiniBracket(players: string[]): MiniBracketMatch[] {
  const entrants = [...new Set(players.map((player) => player.trim()).filter(Boolean))];
  if (entrants.length < 2) return [];

  const size = 2 ** Math.ceil(Math.log2(entrants.length));
  const rounds = Math.log2(size);
  const matches: MiniBracketMatch[] = [];

  for (let round = 0; round < rounds; round++) {
    for (let slot = 0; slot < size / 2 ** (round + 1); slot++) {
      matches.push({ id: `r${round}s${slot}`, round, slot, a: null, b: null, winner: null });
    }
  }

  const order = seedOrder(size);
  for (let slot = 0; slot < size / 2; slot++) {
    const match = matches.find((m) => m.round === 0 && m.slot === slot);
    if (!match) continue;
    match.a = entrants[order[slot * 2] - 1] ?? null;
    match.b = entrants[order[slot * 2 + 1] - 1] ?? null;
  }

  return resolveBracket(matches);
}

export function validateFreeEntryCredits(players: string[], winners: string[]): {
  eligible: string[];
  invalid: string[];
  duplicates: string[];
  awarded: number;
} {
  const normalizedPlayers = new Set(players.map((player) => player.trim()).filter(Boolean));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const invalid: string[] = [];
  const eligible: string[] = [];

  for (const winner of winners) {
    const value = winner.trim();
    if (!value) continue;
    if (!normalizedPlayers.has(value)) {
      invalid.push(value);
      continue;
    }
    if (seen.has(value)) {
      duplicates.push(value);
      continue;
    }
    seen.add(value);
    eligible.push(value);
  }

  return {
    eligible: eligible.slice(0, 3),
    invalid,
    duplicates,
    awarded: Math.min(3, eligible.length),
  };
}
