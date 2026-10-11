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

// Load the league permission helpers dynamically (same alias-free pattern).
let _leagueLib: any = null;
async function loadLeagueLib() {
  if (_leagueLib) return _leagueLib;
  try {
    _leagueLib = await import("@/lib/league");
  } catch {
    try {
      _leagueLib = await import("../../../lib/league");
    } catch {
      _leagueLib = await import("../../../lib/league.ts");
    }
  }
  return _leagueLib;
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

/**
 * Authoritative match-result application for a lineup.
 *
 * - Requires both-team confirmation on the lineup.
 * - Derives the winner/loser server-side from lineup_results.
 * - Applies standings exactly once per lineup via an atomic claim on
 *   lineups.result_winner / result_loser / standings_applied_at.
 * - Retried calls with the same result are no-ops (alreadyApplied: true).
 */
export async function recordResultForLineupInDb(lineupId: string, actor?: string, db?: any) {
  const client = db ?? await getDb();
  const lib = await loadStandingsLib();
  const cleanId = String(lineupId ?? "").trim().slice(0, 80);
  if (!cleanId) {
    const e: any = new Error("lineupId required.");
    e.status = 400;
    throw e;
  }

  const { data: lineup, error: lineupError } = await client
    .from("lineups")
    .select("id, home_team, away_team, home_confirmed, away_confirmed, result_winner, result_loser, standings_applied_at")
    .eq("id", cleanId)
    .maybeSingle();
  if (lineupError) throw lineupError;
  if (!lineup) {
    const e: any = new Error("Lineup not found.");
    e.status = 404;
    throw e;
  }

  if (!lineup.home_confirmed || !lineup.away_confirmed) {
    const e: any = new Error("Both teams must confirm the score sheet before standings update.");
    e.status = 409;
    throw e;
  }

  const { data: resultRows, error: resultsError } = await client
    .from("lineup_results")
    .select("game_key, winner")
    .eq("lineup_id", cleanId);
  if (resultsError) throw resultsError;
  const decided = lib.decideMatchResult(resultRows ?? [], lineup.home_team, lineup.away_team);
  if (!decided) {
    const e: any = new Error("No decisive result to apply.");
    e.status = 409;
    throw e;
  }
  const winnerTeam = decided.winner as string;
  const loserTeam = decided.loser as string;

  if ((lineup as Record<string, unknown>).standings_applied_at) {
    if (lib.sameResult(
      { winner: (lineup as Record<string, string>).result_winner, loser: (lineup as Record<string, string>).result_loser },
      { winner: winnerTeam, loser: loserTeam },
    )) {
      const current = await getStandingsFromDb(db ?? undefined);
      return { teams: current, alreadyApplied: true, winner: winnerTeam, loser: loserTeam };
    }
    const e: any = new Error("Standings already applied for this match with a different result.");
    e.status = 409;
    throw e;
  }

  const appliedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await client
    .from("lineups")
    .update({ result_winner: winnerTeam, result_loser: loserTeam, standings_applied_at: appliedAt })
    .eq("id", cleanId)
    .is("standings_applied_at", null)
    .select("id");
  if (claimError) throw claimError;
  if (!claimed || (claimed as unknown[]).length === 0) {
    const current = await getStandingsFromDb(db ?? undefined);
    return { teams: current, alreadyApplied: true, winner: winnerTeam, loser: loserTeam };
  }

  let settingsRow: Record<string, any> | null;
  if (db) {
    const r = await client.from("league_settings").select("id, standings").eq("league_key", null).maybeSingle();
    if (r.error) throw r.error;
    settingsRow = r.data;
  } else {
    const cfg = await loadConfig();
    const r = await client.from("league_settings").select("id, standings").eq("league_key", cfg.LEAGUE_KEY).maybeSingle();
    if (r.error) throw r.error;
    settingsRow = r.data;
  }
  const teams = settingsRow?.standings ?? lib.DEFAULT_TEAMS;
  const next = lib.applyMatchResult(teams, winnerTeam, loserTeam);

  if (db) {
    const r = await client.from("league_settings").update({ standings: next });
    if ((r as { error?: unknown }).error) throw (r as { error: unknown }).error;
  } else {
    const cfg = await loadConfig();
    const { error: upErr } = await client.from("league_settings").update({ standings: next }).eq("league_key", cfg.LEAGUE_KEY);
    if (upErr) throw upErr;
  }
  try {
    const leagueKey = db ? null : (await loadConfig()).LEAGUE_KEY;
    await client.from("league_standings_audit").insert({ league_key: leagueKey, action: "auto_increment", payload: { lineup_id: cleanId, winner: winnerTeam, loser: loserTeam }, performed_by: actor ?? null, created_at: new Date().toISOString() });
  } catch {}
  return { teams: next, alreadyApplied: false, winner: winnerTeam, loser: loserTeam };
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

/** PATCH /api/standings — apply a confirmed lineup result (increment W/L once) */
export async function PATCH(request: Request) {
  const { NextResponse } = await import("next/server");
  let body: { lineupId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const lineupId = typeof body?.lineupId === "string" ? body.lineupId.trim().slice(0, 80) : "";
  if (!lineupId) return NextResponse.json({ error: "lineupId required." }, { status: 400 });

  try {
    const db = await getDb();
    const { data: lineup, error: lineupError } = await db
      .from("lineups")
      .select("home_team, away_team")
      .eq("id", lineupId)
      .maybeSingle();
    if (lineupError) throw lineupError;
    if (!lineup) return NextResponse.json({ error: "Lineup not found." }, { status: 404 });

    let actor: string | undefined;
    try {
      const leagueLib = await loadLeagueLib();
      const permission = await leagueLib.canEditLineup(
        (lineup as Record<string, string>).home_team ?? "",
        (lineup as Record<string, string>).away_team ?? "",
      );
      if (!permission.ok) return NextResponse.json({ error: permission.error }, { status: permission.status });
      actor = permission.user.id;
    } catch {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    try {
      const result = await recordResultForLineupInDb(lineupId, actor);
      return NextResponse.json({ ok: true, teams: result.teams, alreadyApplied: result.alreadyApplied, winner: result.winner, loser: result.loser });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "Could not record result." }, { status: e?.status ?? 503 });
    }
  } catch {
    return NextResponse.json({ error: "Could not record result." }, { status: 503 });
  }
}
