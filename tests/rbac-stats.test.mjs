import { canEditSide, canEditLineupSide, rostersEqual, isOwner } from "../lib/permissions.ts";
import { aggregatePlayerStats, rotationOrder } from "../lib/player-stats.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`); }
};
const ok = (name, cond, detail = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${detail}`); } };

// ------------------------------------------------------------------ gates
eq("owner edits any side", canEditSide("owner", [], "Random Team"), true);
eq("captain edits own side", canEditSide("player", ["Seguin Cue Club"], "seguin cue club"), true);
eq("captain blocked from other side", canEditSide("player", ["Seguin Cue Club"], "Guadalupe Break"), false);
eq("plain player edits nothing", canEditSide("player", [], "Seguin Cue Club"), false);
eq("signed-out edits nothing", canEditSide(null, [], "Seguin Cue Club"), false);
eq("empty team name never editable", canEditSide("player", ["X"], "  "), false);
ok("owner helper", isOwner("owner") && !isOwner("player"));
eq("lineup editable via either side", canEditLineupSide("player", ["Guadalupe Break"], "Seguin Cue Club", "Guadalupe Break"), true);
eq("lineup locked for outsiders", canEditLineupSide("player", ["Third Team"], "Seguin Cue Club", "Guadalupe Break"), false);

eq("identical rosters equal", rostersEqual(
  [{ name: "A", role: "Captain", payment: "paid", active: true }],
  [{ name: "A", role: "Captain", payment: "paid" }],
), true);
eq("payment flip detected", rostersEqual(
  [{ name: "A", payment: "due" }],
  [{ name: "A", payment: "paid" }],
), false);
eq("rename detected", rostersEqual([{ name: "A" }], [{ name: "B" }]), false);
eq("length change detected", rostersEqual([{ name: "A" }], [{ name: "A" }, { name: "B" }]), false);

// ------------------------------------------------------------ aggregation
eq("rotation mirrors board (3)", rotationOrder(3), [[0, 1, 2], [1, 2, 0], [2, 0, 1]]);
eq("rotation caps at 4 rounds", rotationOrder(6).length, 4);

{
  const stats = aggregatePlayerStats([{
    homeTeam: "Seguin Cue Club",
    awayTeam: "Guadalupe Break",
    home: [{ name: "Marcus Ray" }, { name: "Carlos Vance" }],
    away: [{ name: "Jake Torres" }, { name: "Elena Ramos" }],
    // Round 0: Marcus vs Jake (home win), Carlos vs Elena (away win).
    winners: { "0-0": "home", "0-1": "away" },
  }]);
  const byName = Object.fromEntries(stats.map(s => [s.name, s]));
  eq("home winner tallied", [byName["Marcus Ray"].w, byName["Marcus Ray"].l], [1, 0]);
  eq("home loser tallied", [byName["Jake Torres"].w, byName["Jake Torres"].l], [0, 1]);
  eq("away winner tallied", [byName["Elena Ramos"].w, byName["Elena Ramos"].l], [1, 0]);
  eq("teams attached", [byName["Marcus Ray"].team, byName["Elena Ramos"].team], ["Seguin Cue Club", "Guadalupe Break"]);
}

{
  // Benched players sit out; unknown game keys are ignored.
  const stats = aggregatePlayerStats([{
    homeTeam: "H", awayTeam: "V",
    home: [{ name: "A" }, { name: "Benched", active: false }],
    away: [{ name: "C" }],
    winners: { "0-0": "home", "9-9": "away" },
  }]);
  eq("only real games counted", stats.map(s => [s.name, s.w, s.l]), [["A", 1, 0], ["C", 0, 1]]);
}

{
  eq("empty input aggregates nothing", aggregatePlayerStats([]), []);
  eq("scoreless lineup aggregates nothing", aggregatePlayerStats([
    { homeTeam: "H", awayTeam: "V", home: [{ name: "A" }], away: [{ name: "B" }], winners: {} },
  ]), []);
}

console.log(`\nrbac-stats: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
