/**
 * Fuzzy roster matching for scanned score sheets.
 *
 * Handwritten names ("Gorgie", "Moe", "ME") rarely match the registered
 * roster exactly, so the scan pipeline resolves raw OCR/vision text against
 * known rosters with Levenshtein distance instead of writing raw text to
 * the database. Dependency-free on purpose: rosters are 5-8 names, and a
 * 30-line distance function beats a new npm dependency here.
 */

export type MatchConfidence = "high" | "medium" | "low";

export type RosterEntry = { id?: string; name: string };

export type RosterMatch = {
  rawScanned: string;
  matchedName: string | null;
  matchedIndex: number;
  distance: number;
  similarity: number;
  confidence: MatchConfidence;
};

/** Lowercase, strip punctuation, collapse whitespace: "  Gorgie!" -> "gorgie". */
export function normalizeName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classic DP Levenshtein distance over two normalized strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Keep the shorter string on the inner axis to bound memory.
  if (a.length > b.length) [a, b] = [b, a];
  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    const next = [j];
    for (let i = 1; i <= a.length; i++) {
      next[i] = Math.min(
        prev[i] + 1,
        next[i - 1] + 1,
        prev[i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = next;
  }
  return prev[a.length];
}

export function similarityOf(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(x, y) / longest;
}

function confidenceFor(distance: number, similarity: number): MatchConfidence {
  if (distance <= 2 && similarity >= 0.6) return "high";
  if (distance <= 4 && similarity >= 0.5) return "medium";
  return "low";
}

/** Resolve one scanned name against a roster. Never throws on empty input. */
export function matchPlayerToRoster(
  scannedName: string,
  roster: (string | RosterEntry)[],
): RosterMatch {
  const raw = typeof scannedName === "string" ? scannedName.trim() : "";
  const names = roster.map((r) => (typeof r === "string" ? r : r?.name ?? ""));
  if (!normalizeName(raw) || names.length === 0) {
    return { rawScanned: raw, matchedName: null, matchedIndex: -1, distance: Infinity, similarity: 0, confidence: "low" };
  }
  const target = normalizeName(raw);
  let best = -1;
  let bestDistance = Infinity;
  names.forEach((name, i) => {
    const d = levenshtein(target, normalizeName(name));
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  const matchedName = best >= 0 ? names[best] : null;
  const similarity = matchedName == null ? 0 : 1 - bestDistance / Math.max(target.length, normalizeName(matchedName).length, 1);
  return {
    rawScanned: raw,
    matchedName,
    matchedIndex: best,
    distance: bestDistance,
    similarity,
    confidence: confidenceFor(bestDistance, similarity),
  };
}

/** Resolve a batch of scanned names against one roster side. */
export function matchRosterNames(
  scannedNames: string[],
  roster: (string | RosterEntry)[],
): RosterMatch[] {
  return (scannedNames ?? []).map((name) => matchPlayerToRoster(name, roster));
}
