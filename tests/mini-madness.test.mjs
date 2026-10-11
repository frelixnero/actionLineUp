import { normalizeScore, syncMatchState, winnerOf } from "../lib/mini-madness.ts";

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`);
  }
};

const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL ${name} ${detail}`);
  }
};

eq("normalizeScore handles numeric and string inputs", [normalizeScore(3), normalizeScore("11"), normalizeScore("oops")], [3, 11, 0]);
eq("winnerOf picks the higher score", [winnerOf(2, 1), winnerOf(1, 2), winnerOf(3, 3)], ["home", "away", null]);

const progressed = syncMatchState({
  id: "m-1",
  tournament_id: "t-1",
  round_number: 1,
  match_number: 1,
  home_player_id: "u-1",
  away_player_id: "u-2",
  home_player_name: "Alice",
  away_player_name: "Bob",
  home_score: 2,
  away_score: 1,
  home_confirmed: true,
  away_confirmed: true,
  winner_id: null,
  status: "pending",
});

eq("syncMatchState resolves completed match state", [progressed.status, progressed.winner_id], ["completed", "u-1"]);
ok("syncMatchState leaves a pending match in progress when only one side confirms", syncMatchState({
  id: "m-2",
  tournament_id: "t-1",
  round_number: 1,
  match_number: 2,
  home_player_id: "u-3",
  away_player_id: "u-4",
  home_player_name: "Chris",
  away_player_name: "Drew",
  home_score: 2,
  away_score: 1,
  home_confirmed: true,
  away_confirmed: false,
  winner_id: null,
  status: "pending",
}).status === "in_progress");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
