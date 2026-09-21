import { seedOrder, buildSingleElimination, buildRoundRobin, resolveBracket, championOf, statusOf } from "../lib/bracket.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`); }
};
const ok = (name, cond, detail = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${detail}`); } };

const ents = n => Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `P${i + 1}` }));

// --- seeding -----------------------------------------------------------
eq("seedOrder(2)", seedOrder(2), [1, 2]);
eq("seedOrder(4)", seedOrder(4), [1, 4, 2, 3]);
eq("seedOrder(8)", seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
ok("seedOrder(16) is a permutation", (() => {
  const o = seedOrder(16); return o.length === 16 && new Set(o).size === 16 && Math.min(...o) === 1 && Math.max(...o) === 16;
})());

// seeds 1 and 2 must land in opposite halves of every bracket size
for (const size of [4, 8, 16, 32]) {
  const o = seedOrder(size);
  const half = size / 2;
  ok(`seeds 1 & 2 in opposite halves (size ${size})`, (o.indexOf(1) < half) !== (o.indexOf(2) < half));
}

// --- no premature champion (the bug that shipped) -----------------------
for (const n of [2, 3, 5, 6, 7, 9, 12, 15, 16, 17]) {
  const m = buildSingleElimination(ents(n));
  ok(`n=${n}: no champion before any real match is played`, championOf("single", m) === null,
     `-> champion was ${championOf("single", m)}`);
  ok(`n=${n}: status is live, not complete`, statusOf("single", m) === "live");
}

// --- byes go to top seeds, and only in round 0 -------------------------
{
  const m = buildSingleElimination(ents(5));
  const r0 = m.filter(x => x.round === 0);
  eq("n=5: round 0 has 4 matches", r0.length, 4);
  const byeWinners = r0.filter(x => x.a && !x.b).map(x => x.a);
  eq("n=5: three byes, to seeds 1,2,3", byeWinners.sort(), ["e1", "e2", "e3"]);
  ok("n=5: no later-round match has a winner yet", m.filter(x => x.round > 0).every(x => x.winner === null));
}

// --- full playthrough decides exactly one champion ----------------------
{
  let m = buildSingleElimination(ents(5));
  let guard = 0;
  while (championOf("single", m) === null && guard++ < 50) {
    const next = m.find(x => x.a && x.b && !x.winner);
    if (!next) break;
    m = resolveBracket(m.map(x => (x.id === next.id ? { ...x, winner: x.a } : x)));
  }
  ok("n=5: playthrough reaches a champion", championOf("single", m) !== null);
  eq("n=5: champion is top seed when higher seed always wins", championOf("single", m), "e1");
  eq("n=5: status complete", statusOf("single", m), "complete");
}

// --- changing an early result clears stale downstream winners -----------
{
  let m = buildSingleElimination(ents(4));       // r0s0: e1 v e4, r0s1: e2 v e3
  m = resolveBracket(m.map(x => x.id === "r0s0" ? { ...x, winner: "e1" } : x));
  m = resolveBracket(m.map(x => x.id === "r0s1" ? { ...x, winner: "e2" } : x));
  m = resolveBracket(m.map(x => x.id === "r1s0" ? { ...x, winner: "e1" } : x));
  eq("final decided", championOf("single", m), "e1");
  // Now correct the first result: e4 actually won. e1 is no longer in the final.
  m = resolveBracket(m.map(x => x.id === "r0s0" ? { ...x, winner: "e4" } : x));
  eq("stale champion cleared after correction", championOf("single", m), null);
  const final = m.find(x => x.id === "r1s0");
  eq("final now shows the corrected entrant", [final.a, final.b], ["e4", "e2"]);
}

// --- undoing a result cannot strand a later winner ----------------------
{
  let m = buildSingleElimination(ents(4));
  m = resolveBracket(m.map(x => x.id === "r0s0" ? { ...x, winner: "e1" } : x));
  m = resolveBracket(m.map(x => x.id === "r0s1" ? { ...x, winner: "e2" } : x));
  m = resolveBracket(m.map(x => x.id === "r1s0" ? { ...x, winner: "e2" } : x));
  m = resolveBracket(m.map(x => x.id === "r0s1" ? { ...x, winner: null } : x));
  const final = m.find(x => x.id === "r1s0");
  eq("final winner cleared when its feeder was undone", final.winner, null);
  eq("final slot b emptied", final.b, null);
}

// --- round robin --------------------------------------------------------
{
  const m = buildRoundRobin(ents(4));
  eq("round robin match count for 4", m.length, 6);
  ok("round robin has no self-matches", m.every(x => x.a !== x.b));
  const seen = new Set(m.map(x => [x.a, x.b].sort().join("|")));
  eq("round robin pairs are unique", seen.size, 6);
  eq("round robin incomplete has no champion", championOf("roundrobin", m), null);
  const all = m.map(x => ({ ...x, winner: x.a }));
  ok("round robin champion once every match is in", championOf("roundrobin", all) !== null);
}

// --- degenerate input ---------------------------------------------------
eq("0 entrants -> no matches", buildSingleElimination([]), []);
eq("1 entrant -> no matches", buildSingleElimination(ents(1)), []);
eq("empty bracket has no champion", championOf("single", []), null);
eq("empty bracket status is setup", statusOf("single", []), "setup");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
