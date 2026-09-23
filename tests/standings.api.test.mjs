import { getStandingsFromDb, saveStandingsToDb, recordMatchResultInDb } from "../app/api/standings/route.ts";

// Fake in-memory DB client implementing minimal supabase-like API used by helpers
function makeFakeDb() {
  let settings = { league_key: 'seguin-8ball', standings: null };
  const rows = [];
  return {
    from(table) {
      return {
        select: (cols) => ({ eq: (k,v) => ({ maybeSingle: async () => ({ data: settings, error: null }) }) }),
        update: async (payload) => { settings = { ...settings, standings: payload.standings }; return { error: null }; },
        insert: async (row) => { rows.push(row); return { error: null }; }
      };
    }
  };
}

let pass=0, fail=0;
const ok=(n,c)=>{ if(c)pass++; else {fail++; console.log('FAIL',n);} };

(async ()=>{
  const db = makeFakeDb();
  const s = await getStandingsFromDb(db);
  ok('getStandings returns array', Array.isArray(s));
  const updated = await saveStandingsToDb([{name:'X',w:1,l:0,division:'American'}], 'owner-id', db);
  ok('saveStandings returns saved array', Array.isArray(updated) && updated[0].name==='X');
  const after = await recordMatchResultInDb('X','Y','owner-id', db);
  ok('recordMatchResult returns array', Array.isArray(after));
  console.log('\n',pass,'passed,',fail,'failed');
  process.exit(fail?1:0);
})();
