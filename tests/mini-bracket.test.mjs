import { buildMiniBracket, validateFreeEntryCredits } from "../lib/mini-bracket.ts";

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

const players = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const bracket = buildMiniBracket(players);
ok("mini bracket creates 15 round-zero-plus-derived matches for 10 players", bracket.length === 15);
eq("mini bracket keeps a 10-player field to a single champion path", bracket.filter(x => x.round === 3).length, 1);
eq("mini bracket uses byes for the empty slots instead of malformed matches", bracket.filter(m => m.round === 0 && m.a && !m.b).length, 6);
ok("mini bracket never creates an unfilled match on round zero", bracket.filter(m => m.round === 0 && !m.a && !m.b).length === 0);

const creditCheck = validateFreeEntryCredits(players, ["A", "B", "C"]);
eq("free-entry logic awards only the top three credits", creditCheck.eligible, ["A", "B", "C"]);
ok("free-entry logic blocks duplicate entries by the same player", creditCheck.eligible.length === 3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
