import { matchPlayerToRoster, matchRosterNames, normalizeName, levenshtein } from "../lib/roster-matcher.ts";
import { coerceScorecard, validateScorecard, mapScannedToWinners } from "../lib/scorecard-validate.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`); }
};
const ok = (name, cond, detail = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${detail}`); } };

// ---------------------------------------------------------- roster matcher
eq("normalize strips punctuation", normalizeName("  Gorgie! "), "gorgie");
eq("levenshtein identity", levenshtein("moe", "moe"), 0);
ok("levenshtein near-miss is small", levenshtein("gorgie", "georgie") <= 2);

{
  const roster = ["Claudio", "Manuel", "Eric", "Georgie", "Ralph"];
  const hit = matchPlayerToRoster("Gorgie", roster);
  eq("fuzzy Gorgie resolves to Georgie", hit.matchedName, "Georgie");
  eq("fuzzy Gorgie is high confidence", hit.confidence, "high");

  const exact = matchPlayerToRoster("Moe", ["Darrell", "James", "Henry", "Moe"]);
  eq("exact Moe matches", exact.matchedName, "Moe");

  const far = matchPlayerToRoster("Xqzt", roster);
  eq("far miss is low confidence", far.confidence, "low");

  const empty = matchPlayerToRoster("", roster);
  eq("empty scan matches nothing", empty.matchedName, null);

  const batch = matchRosterNames(["Claudio", "Gorgie"], roster);
  eq("batch resolves both", batch.map(m => m.matchedName), ["Claudio", "Georgie"]);
}

// -------------------------------------------------------- coerce + validate
{
  const card = coerceScorecard({ nonsense: true });
  eq("coerce garbage yields empty card", card.games, []);
  eq("coerce garbage totals are zero", [card.homeTotal, card.visitorTotal], [0, 0]);
}

{
  // Clean Tri-City style sheet: home reaches race to 3 at game 4.
  const card = {
    homeTeam: "The Outsiders", awayTeam: "Sharp Shooters",
    homeTotal: 3, visitorTotal: 1, raceTarget: 3,
    games: [
      { gameNumber: 1, homePlayerRaw: "Claudio", visitorPlayerRaw: "Darrell", winner: "home", homeRunningScore: 1, visitorRunningScore: 0 },
      { gameNumber: 2, homePlayerRaw: "Manuel", visitorPlayerRaw: "James", winner: "visitor", homeRunningScore: 1, visitorRunningScore: 1 },
      { gameNumber: 3, homePlayerRaw: "Eric", visitorPlayerRaw: "Henry", winner: "home", homeRunningScore: 2, visitorRunningScore: 1 },
      { gameNumber: 4, homePlayerRaw: "Georgie", visitorPlayerRaw: "Moe", winner: "home", homeRunningScore: 3, visitorRunningScore: 1 },
    ],
  };
  const res = validateScorecard(card);
  eq("clean sheet validates", res.valid, true);
  eq("clean sheet has no warnings", res.warnings, []);
}

{
  // Declared totals disagree with counted winners.
  const res = validateScorecard({
    homeTeam: "H", awayTeam: "V", homeTotal: 9, visitorTotal: 0, raceTarget: null,
    games: [{ gameNumber: 1, homePlayerRaw: "A", visitorPlayerRaw: "B", winner: "home" }],
  });
  ok("total mismatch flagged", res.warnings.some(w => w.code === "TOTAL_MISMATCH"));
}

{
  // Running score drops mid-sheet.
  const res = validateScorecard({
    homeTeam: "H", awayTeam: "V", homeTotal: 2, visitorTotal: 0, raceTarget: null,
    games: [
      { gameNumber: 1, homePlayerRaw: "A", visitorPlayerRaw: "B", winner: "home", homeRunningScore: 1, visitorRunningScore: 0 },
      { gameNumber: 2, homePlayerRaw: "A", visitorPlayerRaw: "C", winner: "home", homeRunningScore: 0, visitorRunningScore: 0 },
    ],
  });
  ok("non-monotonic flagged", res.warnings.some(w => w.code === "SCORE_NOT_MONOTONIC"));
}

{
  // Games played after the race was decided.
  const res = validateScorecard({
    homeTeam: "H", awayTeam: "V", homeTotal: 3, visitorTotal: 1, raceTarget: 2,
    games: [
      { gameNumber: 1, homePlayerRaw: "A", visitorPlayerRaw: "B", winner: "home" },
      { gameNumber: 2, homePlayerRaw: "A", visitorPlayerRaw: "C", winner: "home" },
      { gameNumber: 3, homePlayerRaw: "A", visitorPlayerRaw: "D", winner: "visitor" },
    ],
  });
  ok("post-race game flagged", res.warnings.some(w => w.code === "GAMES_AFTER_RACE"));
}

{
  // Unknown winner + duplicate game number.
  const res = validateScorecard({
    homeTeam: "H", awayTeam: "V", homeTotal: 1, visitorTotal: 0, raceTarget: null,
    games: [
      { gameNumber: 1, homePlayerRaw: "A", visitorPlayerRaw: "B", winner: "unknown" },
      { gameNumber: 1, homePlayerRaw: "A", visitorPlayerRaw: "C", winner: "home" },
    ],
  });
  ok("unknown winner flagged", res.warnings.some(w => w.code === "UNKNOWN_WINNER"));
  ok("duplicate game flagged", res.warnings.some(w => w.code === "DUPLICATE_GAME"));
}

// ------------------------------------------------------------- board mapping
{
  const matchups = [
    { id: "0-0", homeName: "Marcus Ray", awayName: "Jake Torres" },
    { id: "0-1", homeName: "Carlos Vance", awayName: "Elena Ramos" },
  ];
  const { winners, unmatched } = mapScannedToWinners([
    { gameNumber: 1, homePlayerRaw: "marcus ray", visitorPlayerRaw: "jake torres", winner: "home" },
    { gameNumber: 2, homePlayerRaw: "Nobody", visitorPlayerRaw: "Nowhere", winner: "visitor" },
    { gameNumber: 3, homePlayerRaw: "A", visitorPlayerRaw: "B", winner: "unknown" },
  ], matchups);
  eq("name-pair maps to matchup id", winners, { "0-0": "home" });
  eq("unmatched games reported", unmatched, [2, 3]);
}

console.log(`\nscorecard: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
