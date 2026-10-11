import { getOwnerEmails, isOwnerEmail, resolveRole } from "../lib/owner.ts";

let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.log(`FAIL ${n}\n got: ${a}\n want: ${b}`); } };

const prev = process.env.OWNER_EMAIL;

// parsing: comma-separated, trimmed, lowercased
process.env.OWNER_EMAIL = "a@x.com, B@y.com ";
eq('parses owner list', getOwnerEmails(), ["a@x.com", "b@y.com"]);

// matching is case-insensitive
eq('matches case-insensitively', isOwnerEmail("B@Y.COM"), true);
eq('rejects unlisted', isOwnerEmail("other@z.com"), false);
eq('rejects null', isOwnerEmail(null), false);
eq('rejects empty', isOwnerEmail("  "), false);

// env is authoritative: listed emails are owners regardless of DB role
eq('listed email overrides player row', resolveRole("b@y.com", "player"), "owner");
eq('listed email stays owner', resolveRole("a@x.com", "owner"), "owner");
// strict: DB owner rows NOT in env are players
eq('unlisted DB owner is player', resolveRole("other@z.com", "owner"), "player");
eq('unlisted player is player', resolveRole("other@z.com", "player"), "player");
eq('null email is player', resolveRole(null, "owner"), "player");

// empty env: nobody is owner
process.env.OWNER_EMAIL = "";
eq('empty env parses empty', getOwnerEmails(), []);
eq('empty env grants nothing', resolveRole("a@x.com", "owner"), "player");

process.env.OWNER_EMAIL = prev;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
