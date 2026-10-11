import { NextResponse } from "next/server";
import { adminSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { currentUser } from "@/lib/auth";
import { canConfirmMatch, normalizeScore, syncMatchState, winnerOf } from "@/lib/mini-madness";

function isSide(value: unknown): value is "home" | "away" {
  return value === "home" || value === "away";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  if (!matchId) {
    return NextResponse.json({ matches: [] });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ match: null, offline: true });
  }

  try {
    const db = adminSupabase();
    const { data, error } = await db.from("mini_matches").select("*").eq("id", matchId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ match: data ?? null });
  } catch {
    return NextResponse.json({ match: null, error: "Could not load mini match." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const matchId = typeof body.matchId === "string" ? body.matchId.trim() : "";
  const side = isSide(body.side) ? body.side : null;
  const homeScore = normalizeScore(body.homeScore);
  const awayScore = normalizeScore(body.awayScore);

  if (!matchId || !side) {
    return NextResponse.json({ error: "matchId and side are required." }, { status: 400 });
  }

  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in before confirming a match." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured for live match confirmation." }, { status: 503 });
  }

  try {
    const db = adminSupabase();
    const { data: match, error: loadError } = await db.from("mini_matches").select("*").eq("id", matchId).maybeSingle();
    if (loadError) throw loadError;
    if (!match) {
      return NextResponse.json({ error: "Mini match not found." }, { status: 404 });
    }

    if (!canConfirmMatch(user, match)) {
      return NextResponse.json({ error: "You are not authorized to confirm this match." }, { status: 403 });
    }

    const nextMatch = {
      ...match,
      home_score: side === "home" ? homeScore : match.home_score,
      away_score: side === "away" ? awayScore : match.away_score,
      home_confirmed: side === "home" ? true : Boolean(match.home_confirmed),
      away_confirmed: side === "away" ? true : Boolean(match.away_confirmed),
      status: "in_progress",
    };

    const winner = winnerOf(nextMatch.home_score, nextMatch.away_score);
    const confirmedByBoth = Boolean(nextMatch.home_confirmed) && Boolean(nextMatch.away_confirmed);

    const fullMatch = {
      ...nextMatch,
      winner_id: confirmedByBoth && winner ? (winner === "home" ? nextMatch.home_player_id : nextMatch.away_player_id) : nextMatch.winner_id,
      status: confirmedByBoth && winner ? "completed" : "in_progress",
    };

    const { data: updated, error: updateError } = await db
      .from("mini_matches")
      .update({
        home_score: fullMatch.home_score,
        away_score: fullMatch.away_score,
        home_confirmed: fullMatch.home_confirmed,
        away_confirmed: fullMatch.away_confirmed,
        winner_id: fullMatch.winner_id,
        status: fullMatch.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matchId)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      match: syncMatchState(updated),
      winner: winner,
      confirmedByBoth,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm mini match.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
