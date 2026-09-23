import { applyMatchResult, sanitizeTeams, DEFAULT_TEAMS } from "../lib/standings.ts";

let pass=0, fail=0;
const eq=(n,g,w)=>{const a=JSON.stringify(g),b=JSON.stringify(w);if(a===b)pass++;else{fail++;console.log(`FAIL ${n}\n got: ${a}\n want: ${b}`)}};

// sanitize
const raw=[{name:"A",w:1,l:2,division:"American"},{name:"",w:0,l:0}];
const s=sanitizeTeams(raw);
eq('sanitize keeps one team',s.length,1);

// applyMatchResult
const teams=[{name:"Team X",w:2,l:3,division:"American"},{name:"Team Y",w:1,l:4,division:"American"}];
const out=applyMatchResult(teams,'Team X','Team Y');
eq('win increments',out[0].w,3);
eq('loss increments',out[1].l,5);

// default behaviour
const out2=applyMatchResult(DEFAULT_TEAMS,'Seguin Cue Club','Guadalupe Break');
eq('default match update',out2.find(t=>t.name==='Seguin Cue Club').w,15);

console.log(`\\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
