// Load config (supabase client and league key) dynamically so tests can import
// this module without Node resolving TypeScript path aliases.
let _config: any = null;
async function loadConfig() {
  if (_config) return _config;
  try {
    const sup = await import("@/lib/supabase");
    const league = await import("@/lib/league");
    _config = { adminSupabase: sup.adminSupabase, LEAGUE_KEY: league.LEAGUE_KEY };
  } catch {
    const sup = await import("../../../lib/supabase");
    const league = await import("../../../lib/league");
    _config = { adminSupabase: sup.adminSupabase, LEAGUE_KEY: league.LEAGUE_KEY };
  }
  return _config;
}

// Load the standings helper library dynamically so tests can import this module
// without Node needing to resolve Next/tsconfig path aliases.
let _standingsLib: any = null;
async function loadStandingsLib() {
  if (_standingsLib) return _standingsLib;
  try {
    _standingsLib = await import("@/lib/standings");
  } catch {
    try {
      _standingsLib = await import("../../../lib/standings");
    } catch {
      _standingsLib = await import("../../../lib/standings.ts");
    }
  }
  return _standingsLib;
}

// Helper: obtain a DB client, allowing tests to inject a test DB via
// `globalThis.__TEST_DB__` when `NODE_ENV === 'test'`.
async function getDb() {
  if (process.env.NODE_ENV === "test" && (globalThis as any).__TEST_DB__) return (globalThis as any).__TEST_DB__;
  const cfg = await loadConfig();
  return cfg.adminSupabase();
}

// Exposed helpers for easier testing.
export async function getStandingsFromDb(db?: any) {
  const client = db ?? await getDb();
  let dataResult: any;
  if (db) {
    const { data, error } = await client.from("league_settings").select("standings").eq("league_key", null).maybeSingle();
    dataResult = { data, error };
  } else {
    const cfg = await loadConfig();
    const { data, error } = await client.from("league_settings").select("standings").eq("league_key", cfg.LEAGUE_KEY).maybeSingle();
    dataResult = { data, error };
  }
  const { data, error } = dataResult;
  if (error) throw error;
  const lib = await loadStandingsLib();
  return (data as Record<string, unknown> | null)?.standings ?? lib.DEFAULT_TEAMS;
}

export async function saveStandingsToDb(teams: unknown[], actor?: string, db?: any) {
  const client = db ?? await getDb();
  const lib = await loadStandingsLib();
  const sanitized = lib.sanitizeTeams(teams);
  let errResult: any;
  if (db) {
    const { error } = await client.from("league_settings").update({ standings: sanitized });
    errResult = error;
  } else {
    const cfg = await loadConfig();
    const { error } = await client.from("league_settings").update({ standings: sanitized }).eq("league_key", cfg.LEAGUE_KEY);
    errResult = error;
  }
  const error = errResult;
  if (error) throw error;
  // record audit
  try {
    const leagueKey = db ? null : (await loadConfig()).LEAGUE_KEY;
    await client.from("league_standings_audit").insert({ league_key: leagueKey, action: "manual_update", payload: { teams: sanitized }, performed_by: actor ?? null, created_at: new Date().toISOString() });
  } catch {}
  return sanitized;
}

export async function recordMatchResultInDb(winner: string, loser: string, actor?: string, db?: any) {
  const client = db ?? await getDb();
  let dataResult: any;
  if (db) {
    const { data, error } = await client.from("league_settings").select("id, standings").eq("league_key", null).maybeSingle();
    dataResult = { data, error };
  } else {
    const cfg = await loadConfig();
    const { data, error } = await client.from("league_settings").select("id, standings").eq("league_key", cfg.LEAGUE_KEY).maybeSingle();
    dataResult = { data, error };
  }
  const { data, error } = dataResult;
  if (error) throw error;
  const lib = await loadStandingsLib();
  const teams = (data as Record<string, any> | null)?.standings ?? lib.DEFAULT_TEAMS;
  const next = lib.applyMatchResult(teams, winner, loser);
  let upErr;
  if (db) {
    const r = await client.from("league_settings").update({ standings: next });
    upErr = r.error;
  } else {
    const cfg = await loadConfig();
    const r = await client.from("league_settings").update({ standings: next }).eq("league_key", cfg.LEAGUE_KEY);
    upErr = r.error;
  }
  if (upErr) throw upErr;
  try {
    const leagueKey = db ? null : (await loadConfig()).LEAGUE_KEY;
    await client.from("league_standings_audit").insert({ league_key: leagueKey, action: "auto_increment", payload: { winner, loser }, performed_by: actor ?? null, created_at: new Date().toISOString() });
  } catch {}
  return next;
}

// Default seed data — used when no custom standings have been saved yet
// DEFAULT_TEAMS is provided by `lib/standings` (imported at top).

/** GET /api/standings — returns current team standings */
export async function GET() {
  const { NextResponse } = await import("next/server");
  try {
    const db = await getDb();
    const cfg = await loadConfig();
    const { data, error } = await db
      .from("league_settings")
      .select("standings")
      .eq("league_key", cfg.LEAGUE_KEY)
      .maybeSingle();

    if (error) throw error;

    // standings column may not exist yet on older DB — fall back to defaults
    const lib = await loadStandingsLib();
    const teams = (data as Record<string, unknown> | null)?.standings ?? lib.DEFAULT_TEAMS;
    return NextResponse.json({ teams });
  } catch {
    const { NextResponse } = await import("next/server");
    const lib = await loadStandingsLib();
    return NextResponse.json({ teams: lib.DEFAULT_TEAMS });
  }
}

/** PUT /api/standings — owner-only update of team standings */
export async function PUT(request: Request) {
  const { NextResponse } = await import("next/server");
  // Only the league owner may edit the persisted standings.
  try {
    const { requireOwner } = await import("@/lib/auth");
    const owner = await requireOwner();
    if (!owner) return NextResponse.json({ error: "Only the league owner can change standings." }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { teams?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const lib = await loadStandingsLib();
  const teams = lib.sanitizeTeams(body.teams);

  try {
    const db = await getDb();
    // Update the standings JSONB column on the existing league_settings row.
    // If the column doesn't exist yet, this will surface an error — run the migration below.
    const { error } = await db
      .from("league_settings")
      .update({ standings: teams })
      .eq("league_key", (await loadConfig()).LEAGUE_KEY);

    if (error) throw error;
    return NextResponse.json({ ok: true, teams });
  } catch {
    return NextResponse.json({ error: "Could not save standings." }, { status: 503 });
  }
}

/** PATCH /api/standings — record a single match result (increment W/L) */
export async function PATCH(request: Request) {
  const { NextResponse } = await import("next/server");
  let body: { winner?: unknown; loser?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const winnerName = typeof body.winner === "string" ? body.winner.trim().slice(0, 80) : "";
  const loserName = typeof body.loser === "string" ? body.loser.trim().slice(0, 80) : "";
  if (!winnerName || !loserName) return NextResponse.json({ error: "winner and loser required." }, { status: 400 });

  try {
    const db = await getDb();
    const cfg = await loadConfig();
    const { data, error } = await db
      .from("league_settings")
      .select("id, standings")
      .eq("league_key", cfg.LEAGUE_KEY)
      .maybeSingle();
    if (error) throw error;

    const lib = await loadStandingsLib();
    const teams = (data as Record<string, any> | null)?.standings ?? lib.DEFAULT_TEAMS;
    const next = lib.applyMatchResult(teams, winnerName, loserName);

    const { error: upErr } = await db.from("league_settings").update({ standings: next }).eq("league_key", cfg.LEAGUE_KEY);
    if (upErr) throw upErr;
    return NextResponse.json({ ok: true, teams: next });
  } catch {
    return NextResponse.json({ error: "Could not record result." }, { status: 503 });
  }
}
