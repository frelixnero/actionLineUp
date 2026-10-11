import { getStandingsFromDb, saveStandingsToDb, recordMatchResultInDb, recordResultForLineupInDb } from "../app/api/standings/route.ts";

// Legacy fake for the pre-existing helpers (minimal supabase-like API).
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

// Richer fake modelling lineups + lineup_results + league_settings with the
// chaining shapes used by recordResultForLineupInDb:
//   select().eq().maybeSingle(), select().eq() (awaited), update().eq().is().select()
function makeFakeLineupDb() {
  const state = {
    settings: { league_key: 'seguin-8ball', standings: [{ name: 'Team X', w: 0, l: 0, division: 'American' }, { name: 'Team Y', w: 0, l: 0, division: 'American' }] },
    lineups: {},
    results: [],
    audit: [],
  };
  const api = {
    __state: state,
    addLineup(id, { home_team, away_team, home_confirmed, away_confirmed, results }) {
      state.lineups[id] = { id, home_team, away_team, home_confirmed: Boolean(home_confirmed), away_confirmed: Boolean(away_confirmed), result_winner: null, result_loser: null, standings_applied_at: null };
      for (const [i, winner] of (results ?? []).entries()) {
        state.results.push({ lineup_id: id, game_key: `0-${i}`, winner });
      }
    },
    from(table) {
      if (table === 'lineups') {
        return {
          select(cols) {
            return {
              eq(k, v) {
                return {
                  maybeSingle: async () => ({ data: state.lineups[v] ? { ...state.lineups[v] } : null, error: null }),
                };
              },
            };
          },
          update(payload) {
            const builder = {
              _payload: payload,
              _filters: {},
              eq(k, v) { this._filters[k] = v; return this; },
              is(k, val) { this._filters[k] = val; return this; },
              async select(col) {
                const row = state.lineups[this._filters.id];
                if (!row) return { data: [], error: null };
                if (this._filters.standings_applied_at === null && row.standings_applied_at !== null) {
                  return { data: [], error: null };
                }
                Object.assign(row, this._payload);
                return { data: [{ id: row.id }], error: null };
              },
              then(resolve, reject) {
                try {
                  const row = state.lineups[this._filters.id];
                  if (row) Object.assign(row, this._payload);
                  resolve({ error: null, data: null });
                } catch (e) { reject(e); }
              },
            };
            return builder;
          },
          insert: async (row) => ({ error: null, data: null }),
        };
      }
      if (table === 'lineup_results') {
        return {
          select(cols) {
            return {
              eq: (k, v) => Promise.resolve({ data: state.results.filter(r => r.lineup_id === v).map(r => ({ game_key: r.game_key, winner: r.winner })), error: null }),
            };
          },
        };
      }
      if (table === 'league_settings') {
        return {
          select(cols) {
            return {
              eq: (k, v) => ({ maybeSingle: async () => ({ data: { ...state.settings }, error: null }) }),
            };
          },
          update(payload) {
            const builder = {
              _payload: payload,
              eq(k, v) { return this; },
              then(resolve, reject) {
                try {
                  state.settings = { ...state.settings, standings: payload.standings };
                  resolve({ error: null });
                } catch (e) { reject(e); }
              },
            };
            // Support both direct-await and .update(payload) object shapes:
            // `await update(payload)` (legacy) and `await update(payload).eq(...)`.
            const direct = Promise.resolve({ error: null });
            state.settings = { ...state.settings, standings: payload.standings };
            direct.eq = builder.eq.bind(builder);
            return direct;
          },
        };
      }
      return {
        insert: async (row) => { state.audit.push(row); return { error: null }; },
      };
    },
  };
  return api;
}

let pass=0, fail=0;
const ok=(n,c)=>{ if(c)pass++; else {fail++; console.log('FAIL',n);} };
const throwsStatus = async (fn, status) => {
  try { await fn(); return false; }
  catch (e) { return e?.status === status; }
};

(async ()=>{
  const db = makeFakeDb();
  const s = await getStandingsFromDb(db);
  ok('getStandings returns array', Array.isArray(s));
  const updated = await saveStandingsToDb([{name:'X',w:1,l:0,division:'American'}], 'owner-id', db);
  ok('saveStandings returns saved array', Array.isArray(updated) && updated[0].name==='X');
  const after = await recordMatchResultInDb('X','Y','owner-id', db);
  ok('recordMatchResult returns array', Array.isArray(after));

  // Authoritative lineup path: first confirmed result increments exactly once.
  const ldb = makeFakeLineupDb();
  ldb.addLineup('match-1', { home_team: 'Team X', away_team: 'Team Y', home_confirmed: true, away_confirmed: true, results: ['home', 'home', 'away'] });
  const first = await recordResultForLineupInDb('match-1', 'owner-id', ldb);
  ok('first apply increments winner', ldb.__state.settings.standings.find(t => t.name === 'Team X').w === 1);
  ok('first apply increments loser', ldb.__state.settings.standings.find(t => t.name === 'Team Y').l === 1);
  ok('first apply not alreadyApplied', first.alreadyApplied === false);

  // Duplicate retry for the same winner/loser pair must not increment again.
  const second = await recordResultForLineupInDb('match-1', 'owner-id', ldb);
  ok('duplicate retry is alreadyApplied', second.alreadyApplied === true);
  ok('duplicate retry does not double-count wins', ldb.__state.settings.standings.find(t => t.name === 'Team X').w === 1);
  ok('duplicate retry does not double-count losses', ldb.__state.settings.standings.find(t => t.name === 'Team Y').l === 1);

  // Unconfirmed lineups are rejected before any standings change.
  ldb.addLineup('match-2', { home_team: 'Team X', away_team: 'Team Y', home_confirmed: true, away_confirmed: false, results: ['home', 'home'] });
  ok('unconfirmed rejected with 409', await throwsStatus(() => recordResultForLineupInDb('match-2', 'owner-id', ldb), 409));
  ok('unconfirmed leaves standings alone', ldb.__state.settings.standings.find(t => t.name === 'Team X').w === 1);

  // A distinct match between the same two teams still counts.
  ldb.addLineup('match-3', { home_team: 'Team X', away_team: 'Team Y', home_confirmed: true, away_confirmed: true, results: ['away', 'away'] });
  const third = await recordResultForLineupInDb('match-3', 'owner-id', ldb);
  ok('second match applies', third.alreadyApplied === false);
  ok('second match increments new winner', ldb.__state.settings.standings.find(t => t.name === 'Team Y').w === 1);

  // Tied results cannot be applied.
  ldb.addLineup('match-4', { home_team: 'Team X', away_team: 'Team Y', home_confirmed: true, away_confirmed: true, results: ['home', 'away'] });
  ok('tie rejected with 409', await throwsStatus(() => recordResultForLineupInDb('match-4', 'owner-id', ldb), 409));

  console.log('\n',pass,'passed,',fail,'failed');
  process.exit(fail?1:0);
})();
