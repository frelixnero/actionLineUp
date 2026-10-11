import { applyMatchResult, sanitizeTeams, DEFAULT_TEAMS, decideMatchResult, sameResult, countGameWinners } from "../lib/standings.ts";

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

// decideMatchResult derives the winner server-side from game winners
const dec1=decideMatchResult([{winner:'home'},{winner:'home'},{winner:'away'}],'Team X','Team Y');
eq('decide home wins',dec1?.winner,'Team X');
eq('decide loser',dec1?.loser,'Team Y');
const decTie=decideMatchResult({a:'home',b:'away'},'Team X','Team Y');
eq('tie returns null',decTie,null);
const decEmpty=decideMatchResult([],'Team X','Team Y');
eq('empty returns null',decEmpty,null);

// sameResult compares winner/loser pairs case-insensitively
const _s1=sameResult({winner:'Team X',loser:'Team Y'},{winner:' team x ','loser':'TEAM Y'});
eq('same result case-insensitive',_s1,true);
eq('different result',sameResult({winner:'Team X',loser:'Team Y'},{winner:'Team Y',loser:'Team X'}),false);

// countGameWinners handles both map and row shapes
eq('count map',countGameWinners({'0-0':'home','0-1':'away'}),{home:1,away:1});
eq('count rows',countGameWinners([{winner:'home'},{winner:'home'}]),{home:2,away:0});

console.log(`\\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
