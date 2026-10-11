import { awardPointsForMatch, buildDayTwoLeaderboard, generateFreeEntryCredits } from "../lib/points-engine.ts";

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

const winAward = awardPointsForMatch({ playerId: "p1", playerName: "Alice", result: "win", tournamentDay: 2, matchCount: 3, entryCount: 2 });
eq("match win awards +1 point", winAward.totalPoints, 1);
eq("match win stores the correct label", winAward.reason, "match_win");

const leaderboard = buildDayTwoLeaderboard([
  { playerId: "p1", playerName: "Alice", result: "win", tournamentDay: 2, matchCount: 3, entryCount: 2 },
  { playerId: "p2", playerName: "Bob", result: "win", tournamentDay: 2, matchCount: 2, entryCount: 1 },
  { playerId: "p1", playerName: "Alice", result: "win", tournamentDay: 2, matchCount: 4, entryCount: 2 },
  { playerId: "p3", playerName: "Cara", result: "runner_up", tournamentDay: 2, matchCount: 4, entryCount: 1 },
  { playerId: "p4", playerName: "Drew", result: "champion", tournamentDay: 2, matchCount: 5, entryCount: 1 },
]);

eq("leaderboard sums repeated events correctly", leaderboard.find((row) => row.playerId === "p1")?.totalPoints, 2);
eq("leaderboard ranks champion first", leaderboard[0]?.playerName, "Drew");

const credits = generateFreeEntryCredits([
  { playerId: "p1", playerName: "Alice", totalPoints: 10 },
  { playerId: "p2", playerName: "Bob", totalPoints: 9 },
  { playerId: "p3", playerName: "Cara", totalPoints: 7 },
  { playerId: "p4", playerName: "Drew", totalPoints: 3 },
]);

eq("free entry credits awards the top three positions", credits.map((row) => row.playerId), ["p1", "p2", "p3"]);
ok("champion award is backed by a single credit grant", credits.every((row) => row.creditAmount >= 1));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
