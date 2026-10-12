import { matchPlayerToRoster, matchRosterNames, normalizeName, levenshtein } from "../lib/roster-matcher.ts";
import { coerceScorecard, validateScorecard, mapScannedToWinners } from "../lib/scorecard-validate.ts";
import { classifyVisionError, extractResponseText, extractJsonSpan, parseModelCascade } from "../lib/gemini-scan.ts";

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

// ------------------------------------------------------- vision error paths
{
  eq("503 classifies as rate_limited", classifyVisionError(new Error("[503 Service Unavailable] overloaded")).kind, "rate_limited");
  eq("429 classifies as rate_limited", classifyVisionError(new Error("[429 Too Many Requests] quota exceeded")).kind, "rate_limited");
  eq("404 classifies as model_not_found", classifyVisionError(new Error("[404 Not Found] model is no longer available")).kind, "model_not_found");
  eq("safety text classifies as blocked", classifyVisionError(new Error("response blocked due to safety")).kind, "blocked");
  eq("mystery error is unknown", classifyVisionError(new Error("socket hangup")).kind, "unknown");

  const blocked = extractResponseText({ candidates: [{ finishReason: "SAFETY" }], promptFeedback: undefined, text: () => { throw new Error("No text part"); } });
  eq("safety finish never throws", blocked.blocked, true);
  eq("safety finish reports reason", blocked.blockReason, "SAFETY");

  const promptBlocked = extractResponseText({ promptFeedback: { blockReason: "SAFETY" } });
  eq("prompt block reported", promptBlocked.blocked, true);

  const good = extractResponseText({ candidates: [{ finishReason: "STOP" }], text: () => '{"a":1}' });
  eq("clean response passes through", good, { text: '{"a":1}', blocked: false });

  const empty = extractResponseText({ candidates: [] });
  eq("no candidates is not blocked", empty, { text: null, blocked: false });

  eq("json span skips prose", extractJsonSpan('Sure! ```json\n{"a": 1}\n``` done'), '{"a": 1}');
  eq("json span handles nesting", extractJsonSpan('x {"a": {"b": 2}} y'), '{"a": {"b": 2}}');

  eq("env cascade wins", parseModelCascade("gemini-x, gemini-y", ["gemini-2.0-flash"]), ["gemini-x", "gemini-y"]);
  eq("empty env falls back", parseModelCascade("", ["gemini-2.0-flash"]), ["gemini-2.0-flash"]);
  eq("cascade dedupes and caps", parseModelCascade("a,a,b,c,d", ["z"]), ["a", "b", "c"]);
}

// ------------------------------------------------- unplayed + raw notes
{
  const card = coerceScorecard({
    homeTeam: "H", awayTeam: "V", homeTotal: 2, visitorTotal: 0, raceTarget: 2,
    rawNotes: "$60 dues via Cash App",
    games: [
      { gameNumber: 1, homePlayer: "A", visitorPlayer: "B", winner: "home" },
      { gameNumber: 2, homePlayer: "A", visitorPlayer: "C", winner: "home" },
      { gameNumber: 3, homePlayer: "A", visitorPlayer: "D", winner: "unplayed" },
    ],
  });
  eq("raw notes coerce through", card.rawNotes, "$60 dues via Cash App");
  eq("unplayed survives coerce", card.games[2].winner, "unplayed");
  const res = validateScorecard(card);
  eq("explicit unplayed needs no review flag", res.warnings.some(w => w.code === "UNKNOWN_WINNER"), false);
  eq("post-race unplayed raises no warning", res.warnings.some(w => w.code === "GAMES_AFTER_RACE"), false);
  eq("unplayed sheet validates", res.valid, true);

  const mapped = mapScannedToWinners(
    card.games.map(g => ({ gameNumber: g.gameNumber, homePlayerRaw: g.homePlayerRaw, visitorPlayerRaw: g.visitorPlayerRaw, winner: g.winner })),
    [{ id: "0-0", homeName: "A", awayName: "B" }],
  );
  eq("played game maps", mapped.winners, { "0-0": "home" });
  eq("unplayed reported as skipped", mapped.skipped, [3]);
  eq("nothing left unmatched", mapped.unmatched, [2]);
}

console.log(`\nscorecard: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
