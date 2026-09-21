import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY } from "@/lib/league";
import {
  FORMATS, formatByKey, buildSides, initialMatches, nextRound, resolve, statusOf,
  type EngineMatch, type Entrant, type FormatConfig, type Side,
} from "@/lib/formats";

/**
 * A shared tournament board, for every format the engine supports.
 *
 * The engine works in *sides*: a side is one player in singles, or a drawn pair
 * in blind draw doubles. Matches therefore point at sides, not entrants, which
 * is what lets doubles and the progressive formats live on the server at all.
 *
 * Pairings are stored for every match. On read, resolve() re-derives the seats
 * that are downstream of a result (later bracket rounds, the losers bracket, the
 * playoff tree) so a corrected early result cannot leave a stale name sitting in
 * a later round. Pairings that cannot be re-derived -- Swiss rounds, which depend
 * on standings history, and chip rounds, which are drawn at random -- are read
 * back exactly as they were stored.
 */

type Ctx = { params: Promise<{ id: string }> };

type TournamentRow = {
  id: string; name: string; format: string; race_to: number; status: string;
  prize_note: string | null; rounds: number | null; chips: number | null; advancers: number | null;
};

const FORMAT_KEYS = new Set(FORMATS.map(f => f.key));

function configFor(t: Pick<TournamentRow, "format" | "rounds" | "chips" | "advancers">): FormatConfig {
  const base = formatByKey(t.format);
  return {
    ...base,
    ...(t.rounds ? { rounds: t.rounds } : {}),
    ...(t.chips ? { chips: t.chips } : {}),
    ...(t.advancers ? { advancers: t.advancers } : {}),
  };
}

async function load(id: string) {
  const db = adminSupabase();
  const { data: tournament, error } = await db
    .from("tournaments")
    .select("id, name, format, race_to, status, prize_note, rounds, chips, advancers")
    .eq("id", id).eq("league_key", LEAGUE_KEY)
    .maybeSingle();
  if (error) throw error;
  if (!tournament) return null;

  const [{ data: entrantRows }, { data: sideRows }, { data: matchRows }] = await Promise.all([
    db.from("tournament_entrants").select("id, name, seed").eq("tournament_id", id).order("seed"),
    db.from("tournament_sides").select("id, name, ordinal").eq("tournament_id", id).order("ordinal"),
    db.from("tournament_matches")
      .select("match_key, round, slot, side_a, side_b, winner_side, bracket, phase")
      .eq("tournament_id", id).order("round").order("slot"),
  ]);

  const sideIds = (sideRows ?? []).map(s => s.id as string);
  const { data: memberRows } = sideIds.length
    ? await db.from("tournament_side_members").select("side_id, entrant_id").in("side_id", sideIds)
    : { data: [] as { side_id: string; entrant_id: string }[] };

  const membersBySide = new Map<string, string[]>();
  for (const m of memberRows ?? []) {
    const list = membersBySide.get(m.side_id as string) ?? [];
    list.push(m.entrant_id as string);
    membersBySide.set(m.side_id as string, list);
  }

  const entrants: Entrant[] = (entrantRows ?? []).map(r => ({ id: r.id as string, name: r.name as string }));
  const sides: Side[] = (sideRows ?? []).map(s => ({
    id: s.id as string, name: s.name as string, memberIds: membersBySide.get(s.id as string) ?? [],
  }));
  const stored: EngineMatch[] = (matchRows ?? []).map(m => ({
    id: m.match_key as string,
    round: m.round as number,
    slot: m.slot as number,
    a: (m.side_a as string | null) ?? null,
    b: (m.side_b as string | null) ?? null,
    winner: (m.winner_side as string | null) ?? null,
    ...(m.bracket ? { bracket: m.bracket as "w" | "l" | "gf" } : {}),
    ...(m.phase ? { phase: m.phase as "group" | "playoff" } : {}),
  }));

  const config = configFor(tournament as TournamentRow);
  return { tournament: tournament as TournamentRow, config, entrants, sides, stored, matches: resolve(config, stored) };
}

function shape(t: TournamentRow, entrants: Entrant[], sides: Side[], matches: EngineMatch[]) {
  return {
    tournament: {
      id: t.id, name: t.name, format: t.format, raceTo: t.race_to, status: t.status,
      prizeNote: t.prize_note ?? "",
      rounds: t.rounds, chips: t.chips, advancers: t.advancers,
    },
    entrants, sides, matches,
  };
}

const matchRow = (tournamentId: string, m: EngineMatch) => ({
  tournament_id: tournamentId,
  match_key: m.id,
  round: m.round,
  slot: m.slot,
  side_a: m.a,
  side_b: m.b,
  winner_side: m.winner,
  bracket: m.bracket ?? null,
  phase: m.phase ?? null,
});

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const found = await load(id);
    if (!found) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
    return NextResponse.json(shape(found.tournament, found.entrants, found.sides, found.matches));
  } catch {
    return NextResponse.json({ error: "Could not load the tournament." }, { status: 503 });
  }
}

/** Replace settings and entrants, then build the draw for whichever format is set. */
export async function PUT(request: Request, { params }: Ctx) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Only the league owner can edit a tournament." }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json();
    const db = adminSupabase();

    const existingState = await load(id);
    if (!existingState) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });

    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    const formatKey = typeof body?.format === "string" && FORMAT_KEYS.has(body.format) ? body.format : "single";
    const raceToRaw = Number(body?.raceTo);
    const raceTo = Number.isFinite(raceToRaw) ? Math.min(50, Math.max(1, Math.trunc(raceToRaw))) : 5;
    const prizeNote = typeof body?.prizeNote === "string" ? body.prizeNote.trim().slice(0, 280) : "";
    const clamp = (v: unknown, lo: number, hi: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : null;
    };
    const rounds = body?.rounds == null ? null : clamp(body.rounds, 1, 20);
    const chips = body?.chips == null ? null : clamp(body.chips, 1, 20);
    const advancers = body?.advancers == null ? null : clamp(body.advancers, 2, 64);

    const rawEntrants: unknown[] = Array.isArray(body?.entrants) ? body.entrants : [];
    const names = rawEntrants
      .map(e => (typeof e === "string" ? e : typeof (e as { name?: unknown })?.name === "string" ? (e as { name: string }).name : ""))
      .map(n => n.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 128);
    if (new Set(names.map(n => n.toLowerCase())).size !== names.length) {
      return NextResponse.json({ error: "Entrant names must be unique." }, { status: 400 });
    }

    const previousNames = existingState.entrants.map(e => e.name);
    const recordedResults = existingState.stored.filter(m => m.winner).length;
    const sameField = previousNames.length === names.length && previousNames.every((n, i) => n === names[i]);
    const sameFormat = existingState.tournament.format === formatKey;

    if (sameField && sameFormat && existingState.stored.length > 0) {
      // Only the settings changed. Renaming the event or editing the prize
      // wording must not tear down a bracket that is mid-event.
      const { data: settingsOnly, error: sErr } = await db
        .from("tournaments")
        .update({ name, race_to: raceTo, prize_note: prizeNote || null, rounds, chips, advancers })
        .eq("id", id)
        .select("id, name, format, race_to, status, prize_note, rounds, chips, advancers")
        .single();
      if (sErr) throw sErr;
      return NextResponse.json(shape(settingsOnly as TournamentRow, existingState.entrants, existingState.sides, existingState.matches));
    }

    // Rebuilding throws away every result already recorded, which is destructive
    // enough to require an explicit confirmation rather than a stray second click.
    if (recordedResults > 0 && body?.force !== true) {
      return NextResponse.json({
        error: `This board already has ${recordedResults} recorded result${recordedResults === 1 ? "" : "s"}. Rebuilding the draw will erase ${recordedResults === 1 ? "it" : "them"}.`,
        needsConfirmation: true,
        recordedResults,
      }, { status: 409 });
    }

    const config = configFor({ format: formatKey, rounds, chips, advancers });

    // Entrants and sides both cascade to matches, so clearing them clears the draw.
    await db.from("tournament_sides").delete().eq("tournament_id", id);
    await db.from("tournament_entrants").delete().eq("tournament_id", id);

    let entrants: Entrant[] = [];
    let sides: Side[] = [];
    let matches: EngineMatch[] = [];

    if (names.length > 0) {
      const { data: insertedEntrants, error: eErr } = await db
        .from("tournament_entrants")
        .insert(names.map((n, seed) => ({ tournament_id: id, name: n, seed })))
        .select("id, name, seed");
      if (eErr) throw eErr;
      entrants = (insertedEntrants ?? []).sort((a, b) => a.seed - b.seed)
        .map(r => ({ id: r.id as string, name: r.name as string }));

      // Sides are drawn here, once, and persisted. A blind draw must not
      // re-shuffle partners every time somebody loads the page.
      const engineSides = buildSides(config, entrants);
      if (engineSides.length > 0) {
        const { data: insertedSides, error: sErr } = await db
          .from("tournament_sides")
          .insert(engineSides.map((s, ordinal) => ({ tournament_id: id, name: s.name, ordinal })))
          .select("id, name, ordinal");
        if (sErr) throw sErr;
        const idByOrdinal = new Map((insertedSides ?? []).map(r => [r.ordinal as number, r.id as string]));
        sides = engineSides.map((s, i) => ({ id: idByOrdinal.get(i)!, name: s.name, memberIds: s.memberIds }));

        const members = sides.flatMap(s => s.memberIds.map(entrantId => ({ side_id: s.id, entrant_id: entrantId })));
        if (members.length > 0) {
          const { error: mErr } = await db.from("tournament_side_members").insert(members);
          if (mErr) throw mErr;
        }

        matches = initialMatches(config, sides);
        if (matches.length > 0) {
          const { error: matchErr } = await db.from("tournament_matches").insert(matches.map(m => matchRow(id, m)));
          if (matchErr) throw matchErr;
        }
      }
    }

    const resolved = resolve(config, matches);
    const { data: updated, error: uErr } = await db
      .from("tournaments")
      .update({
        name, format: formatKey, race_to: raceTo, prize_note: prizeNote || null,
        rounds, chips, advancers, status: statusOf(config, sides, resolved),
      })
      .eq("id", id)
      .select("id, name, format, race_to, status, prize_note, rounds, chips, advancers")
      .single();
    if (uErr) throw uErr;

    return NextResponse.json(shape(updated as TournamentRow, entrants, sides, resolved));
  } catch {
    return NextResponse.json({ error: "Could not save the tournament." }, { status: 503 });
  }
}

/**
 * Record a result, or pair the next round of a format that discovers its
 * pairings as it goes (Swiss, chip, and the playoff stage of groups+playoff).
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Only the league owner can change the board." }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json();
    const found = await load(id);
    if (!found) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });

    const db = adminSupabase();
    const { config, sides } = found;

    if (body?.action === "next-round") {
      const added = nextRound(config, sides, found.matches);
      if (added.length === 0) {
        return NextResponse.json({ error: "Nothing left to pair yet." }, { status: 409 });
      }
      const { error } = await db.from("tournament_matches").insert(added.map(m => matchRow(id, m)));
      if (error) throw error;
      const all = resolve(config, [...found.stored, ...added]);
      const { data: updated, error: uErr } = await db
        .from("tournaments").update({ status: statusOf(config, sides, all) }).eq("id", id)
        .select("id, name, format, race_to, status, prize_note, rounds, chips, advancers").single();
      if (uErr) throw uErr;
      return NextResponse.json(shape(updated as TournamentRow, found.entrants, sides, all));
    }

    const matchKey = typeof body?.matchKey === "string" ? body.matchKey : null;
    const winner: string | null = typeof body?.winner === "string" ? body.winner : null;
    if (!matchKey) return NextResponse.json({ error: "Which match?" }, { status: 400 });

    const target = found.matches.find(m => m.id === matchKey);
    if (!target) return NextResponse.json({ error: "Match not found." }, { status: 404 });
    if (winner && winner !== target.a && winner !== target.b) {
      return NextResponse.json({ error: "That side is not in this match." }, { status: 400 });
    }

    const next = found.matches.map(m => (m.id === matchKey ? { ...m, winner } : m));
    // Re-resolving clears any later winner this result just invalidated.
    const resolved = resolve(config, next);

    const before = new Map(found.stored.map(m => [m.id, m.winner ?? null]));
    const changed = resolved.filter(m => (before.get(m.id) ?? null) !== (m.winner ?? null));
    for (const m of changed) {
      const { error } = await db.from("tournament_matches")
        .update({ winner_side: m.winner }).eq("tournament_id", id).eq("match_key", m.id);
      if (error) throw error;
    }

    const { data: updated, error: uErr } = await db
      .from("tournaments").update({ status: statusOf(config, sides, resolved) }).eq("id", id)
      .select("id, name, format, race_to, status, prize_note, rounds, chips, advancers").single();
    if (uErr) throw uErr;

    return NextResponse.json(shape(updated as TournamentRow, found.entrants, sides, resolved));
  } catch {
    return NextResponse.json({ error: "Could not update the board." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Only the league owner can delete a tournament." }, { status: 403 });
  try {
    const { id } = await params;
    const { error } = await adminSupabase().from("tournaments").delete().eq("id", id).eq("league_key", LEAGUE_KEY);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete the tournament." }, { status: 503 });
  }
}
