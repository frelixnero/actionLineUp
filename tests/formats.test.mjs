import {
  FORMATS, formatByKey, buildSides, buildSingle, buildDouble, buildRoundRobin, resolveDouble,
  swissPairRound, swissRoundCount, chipCounts, chipPairRound, recordsOf,
  initialMatches, resolve, nextRound, standings, champion, statusOf, roundComplete,
} from "../lib/formats.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`); }
};
const ok = (name, cond, detail = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${detail}`); } };

const ents = n => Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `P${i + 1}` }));
const sidesOf = n => ents(n).map(e => ({ id: e.id, name: e.name, memberIds: [e.id] }));
// Deterministic RNG so shuffles are reproducible in tests.
const seededRng = (seed = 1) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// Play a format to completion, higher seed always winning, and report what happened.
function playOut(config, sides, rng = seededRng(7)) {
  let matches = initialMatches(config, sides, rng);
  let guard = 0;
  while (guard++ < 400) {
    matches = resolve(config, matches);
    const open = matches.find(m => m.a && m.b && !m.winner);
    if (open) {
      const rank = id => sides.findIndex(s => s.id === id);
      const winner = rank(open.a) <= rank(open.b) ? open.a : open.b;
      matches = resolve(config, matches.map(m => (m.id === open.id ? { ...m, winner } : m)));
      continue;
    }
    const added = nextRound(config, sides, matches, rng);
    if (added.length === 0) break;
    matches = [...matches, ...added];
  }
  return { matches, champion: champion(config, sides, matches), guard };
}

// ---------------------------------------------------------------- registry
eq("six-plus formats registered", FORMATS.length >= 6, true);
ok("every format key is unique", new Set(FORMATS.map(f => f.key)).size === FORMATS.length);
ok("unknown key falls back", formatByKey("nope").key === FORMATS[0].key);
for (const f of FORMATS) {
  ok(`${f.key} has a bar-facing name`, typeof f.barName === "string" && f.barName.length > 0);
  ok(`${f.key} declares whether it eliminates`, typeof f.eliminates === "boolean");
}
// The whole commercial argument: some formats keep the room in the building.
ok("at least two formats eliminate nobody", FORMATS.filter(f => !f.eliminates).length >= 2);

// COMPLIANCE: no money anywhere in the format configs.
const moneyish = /fee|price|cent|payout|prize|pot|buyin|buy_in|wager|cash|entry|dollar|amount/i;
for (const f of FORMATS) {
  const keys = Object.keys(f).join(",");
  ok(`${f.key} config has no money field`, !moneyish.test(keys), `keys: ${keys}`);
}

// ------------------------------------------------------------------- sides
{
  const s = buildSides(formatByKey("single"), ents(5));
  eq("singles: one side per entrant", s.length, 5);
  ok("singles: each side has one member", s.every(x => x.memberIds.length === 1));
}
{
  const cfg = formatByKey("blind-draw");
  const s = buildSides(cfg, ents(8), seededRng(3));
  eq("blind draw: 8 players -> 4 teams", s.length, 4);
  ok("blind draw: every team has 2", s.every(x => x.memberIds.length === 2));
  const members = s.flatMap(x => x.memberIds);
  eq("blind draw: nobody duplicated", new Set(members).size, 8);
  eq("blind draw: nobody dropped", members.length, 8);
}
{
  const s = buildSides(formatByKey("blind-draw"), ents(7), seededRng(5));
  eq("blind draw: odd field -> 4 sides", s.length, 4);
  eq("blind draw: odd player still in the draw", new Set(s.flatMap(x => x.memberIds)).size, 7);
  ok("blind draw: odd player flagged, not dropped", s.some(x => x.memberIds.length === 1));
}

// ---------------------------------------------------- single elim (regression)
for (const n of [2, 3, 5, 6, 7, 9, 15, 16]) {
  const cfg = formatByKey("single");
  const s = sidesOf(n);
  const m = buildSingle(s);
  ok(`single n=${n}: no champion before play`, champion(cfg, s, m) === null);
  const r = playOut(cfg, s);
  ok(`single n=${n}: reaches a champion`, r.champion !== null);
  eq(`single n=${n}: top seed wins when higher seed always wins`, r.champion, "e1");
}

// ------------------------------------------------------------- double elim
for (const n of [4, 8, 16]) {
  const cfg = formatByKey("double");
  const s = sidesOf(n);
  const m = buildDouble(s);
  ok(`double n=${n}: no champion before play`, champion(cfg, s, m) === null);
  ok(`double n=${n}: has a grand final`, m.some(x => x.bracket === "gf"));
  ok(`double n=${n}: has a losers bracket`, m.some(x => x.bracket === "l"));
  const r = playOut(cfg, s);
  eq(`double n=${n}: champion is top seed`, r.champion, "e1");
  eq(`double n=${n}: status complete`, statusOf(cfg, s, r.matches), "complete");
  // Everyone except the champion must lose at least twice, or it isn't double elimination.
  const losses = new Map(s.map(x => [x.id, 0]));
  for (const mm of r.matches) {
    if (!mm.winner || !mm.a || !mm.b) continue;
    const l = mm.winner === mm.a ? mm.b : mm.a;
    losses.set(l, (losses.get(l) ?? 0) + 1);
  }
  eq(`double n=${n}: champion never lost twice`, (losses.get("e1") ?? 0) < 2, true);
  const runnerUpLosses = [...losses.entries()].filter(([id]) => id !== "e1").map(([, v]) => v);
  ok(`double n=${n}: nobody eliminated on one loss`, runnerUpLosses.every(v => v === 0 || v >= 2),
     `losses: ${JSON.stringify([...losses])}`);
}
{
  // Double elim must survive a corrected early result without stranding anyone.
  const s = sidesOf(4);
  let m = buildDouble(s);
  m = resolveDouble(m.map(x => x.id === "w0s0" ? { ...x, winner: "e1" } : x));
  m = resolveDouble(m.map(x => x.id === "w0s1" ? { ...x, winner: "e2" } : x));
  const lb0 = m.find(x => x.id === "l0s0");
  eq("double: losers round 1 gets both first-round losers", [lb0.a, lb0.b].sort(), ["e3", "e4"]);
  m = resolveDouble(m.map(x => x.id === "w0s0" ? { ...x, winner: "e4" } : x));
  const lb0b = m.find(x => x.id === "l0s0");
  ok("double: corrected result reroutes the losers bracket", lb0b.a === "e1" || lb0b.b === "e1");
}

// ------------------------------------------------------------- round robin
{
  const cfg = formatByKey("roundrobin");
  const s = sidesOf(5);
  const m = buildRoundRobin(s);
  eq("round robin: 5 players -> 10 matches", m.length, 10);
  ok("round robin: no self matches", m.every(x => x.a !== x.b));
  eq("round robin: pairs unique", new Set(m.map(x => [x.a, x.b].sort().join("|"))).size, 10);
  ok("round robin: nobody eliminated", cfg.eliminates === false);
  const r = playOut(cfg, s);
  eq("round robin: champion after all played", r.champion, "e1");
}

// ------------------------------------------------------------------- swiss
{
  const cfg = formatByKey("swiss");
  eq("swiss rounds for 8", swissRoundCount(cfg, 8), 3);
  eq("swiss rounds for 16", swissRoundCount(cfg, 16), 4);
  eq("swiss rounds for 5", swissRoundCount(cfg, 5), 3);

  for (const n of [4, 6, 8, 11, 16]) {
    const s = sidesOf(n);
    const r = playOut(cfg, s);
    const rounds = swissRoundCount(cfg, n);
    const played = new Set(r.matches.map(m => m.round));
    eq(`swiss n=${n}: runs exactly ${rounds} rounds`, played.size, rounds);

    // Nobody is eliminated: everyone appears in every round (bye counts as appearing).
    for (let round = 0; round < rounds; round++) {
      const inRound = new Set(r.matches.filter(m => m.round === round).flatMap(m => [m.a, m.b]).filter(Boolean));
      eq(`swiss n=${n} r${round}: whole field still in the building`, inRound.size, n);
    }

    // No rematches.
    const seen = new Set();
    let repeats = 0;
    for (const m of r.matches) {
      if (!m.a || !m.b) continue;
      const key = [m.a, m.b].sort().join("|");
      if (seen.has(key)) repeats++;
      seen.add(key);
    }
    eq(`swiss n=${n}: no rematches`, repeats, 0);

    // At most one bye per player.
    const byes = {};
    for (const m of r.matches) if (m.a && !m.b) byes[m.a] = (byes[m.a] ?? 0) + 1;
    ok(`swiss n=${n}: nobody gets two byes`, Object.values(byes).every(v => v <= 1), JSON.stringify(byes));
    ok(`swiss n=${n}: odd field gets exactly one bye per round`, n % 2 === 0 || Object.keys(byes).length === rounds);

    ok(`swiss n=${n}: ends with a champion`, r.champion !== null);
  }
}
{
  // A Swiss round must not be pairable until the previous one is finished.
  const cfg = formatByKey("swiss");
  const s = sidesOf(8);
  const first = initialMatches(cfg, s);
  eq("swiss: round 1 has 4 matches", first.length, 4);
  eq("swiss: no round 2 while round 1 is open", nextRound(cfg, s, first).length, 0);
  const done = first.map(m => ({ ...m, winner: m.a }));
  ok("swiss: round 2 appears once round 1 is complete", nextRound(cfg, s, done).length > 0);
}

// -------------------------------------------------------------------- chip
{
  const cfg = formatByKey("chip");
  eq("chip: starting chips", cfg.chips, 3);
  const s = sidesOf(4);
  const counts0 = chipCounts(cfg, s, []);
  ok("chip: everyone starts equal", [...counts0.values()].every(v => v === 3));

  const m = [{ id: "c0s0", round: 0, slot: 0, a: "e1", b: "e2", winner: "e1" }];
  const counts1 = chipCounts(cfg, s, m);
  eq("chip: winner keeps their chips, gains none", counts1.get("e1"), 3);
  eq("chip: loser burns a chip", counts1.get("e2"), 2);
  eq("chip: total falls by one per game", [...counts1.values()].reduce((a, b) => a + b, 0), 11);

  const r = playOut(cfg, sidesOf(4), seededRng(11));
  ok("chip: ends with one player holding chips", r.champion !== null);
  const finalCounts = chipCounts(cfg, sidesOf(4), r.matches);
  ok("chip: no negative chip counts", [...finalCounts.values()].every(v => v >= 0), JSON.stringify([...finalCounts]));
  eq("chip: exactly one player left with chips", [...finalCounts.values()].filter(v => v > 0).length, 1);
  // A bar night has to end. Burning a chip per loss bounds the match count.
  ok("chip: 4 players x 3 chips finishes inside 12 games", r.matches.filter(x => x.winner && x.a && x.b).length <= 12,
     "games: " + r.matches.filter(x => x.winner && x.a && x.b).length);

  for (const n of [4, 6, 8]) {
    const rr = playOut(cfg, sidesOf(n), seededRng(n * 13));
    const games = rr.matches.filter(x => x.winner && x.a && x.b).length;
    const cap = (cfg.chips ?? 3) * n;
    ok("chip n=" + n + ": terminates within " + cap + " games", rr.champion !== null && games <= cap, "games: " + games);
  }
}
{
  // Busted players must not be paired again.
  const cfg = formatByKey("chip");
  const s = sidesOf(4);
  const m = [
    { id: "c0s0", round: 0, slot: 0, a: "e1", b: "e2", winner: "e1" },
    { id: "c0s1", round: 0, slot: 1, a: "e3", b: "e4", winner: "e3" },
    { id: "c1s0", round: 1, slot: 0, a: "e1", b: "e2", winner: "e1" },
    { id: "c1s1", round: 1, slot: 1, a: "e3", b: "e2", winner: "e3" },
  ];
  const counts = chipCounts(cfg, s, m);
  eq("chip: e2 is out of chips", counts.get("e2"), 0);
  const next = chipPairRound(cfg, s, m, 2, seededRng(2));
  const inNext = new Set(next.flatMap(x => [x.a, x.b]).filter(Boolean));
  ok("chip: busted player is not paired again", !inNext.has("e2"));
}

// ------------------------------------------------------ round robin -> playoff
{
  const cfg = formatByKey("rr-playoff");
  const s = sidesOf(6);
  let m = initialMatches(cfg, s);
  eq("rr-playoff: group stage is a full round robin", m.length, 15);
  eq("rr-playoff: no playoff while groups are open", nextRound(cfg, s, m).length, 0);
  m = m.map(x => ({ ...x, winner: x.a }));
  const playoff = nextRound(cfg, s, m);
  ok("rr-playoff: playoff appears once groups finish", playoff.length > 0);
  ok("rr-playoff: playoff matches are tagged", playoff.every(x => x.phase === "playoff"));
  const r = playOut(cfg, s);
  ok("rr-playoff: reaches a champion", r.champion !== null);
}

// ------------------------------------------------------------ bye accounting
{
  const s = sidesOf(3);
  const m = [{ id: "x", round: 0, slot: 0, a: "e1", b: null, winner: "e1" }];
  const recs = recordsOf(s, m);
  const e1 = recs.find(r => r.id === "e1");
  eq("bye counts as a win", e1.wins, 1);
  eq("bye is not a game played", e1.played.length, 0);
  eq("bye is remembered", e1.hadBye, true);
}

// ------------------------------------------------------------------ degenerate
for (const f of FORMATS) {
  eq(`${f.key}: 0 entrants -> no matches`, initialMatches(f, []), []);
  eq(`${f.key}: 1 entrant -> no matches`, initialMatches(f, sidesOf(1)), []);
  eq(`${f.key}: empty is setup`, statusOf(f, [], []), "setup");
  eq(`${f.key}: empty has no champion`, champion(f, [], []), null);
}
ok("roundComplete is false for an empty round", roundComplete([], 0) === false);
eq("standings of nothing is empty", standings(formatByKey("swiss"), [], []), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
