import { NextResponse } from "next/server";
import { adminSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { buildDayTwoLeaderboard, generateFreeEntryCredits } from "@/lib/points-engine";

const demoLeaderboard = [
  { playerId: "p1", playerName: "Alice", result: "champion", tournamentDay: 2, matchCount: 5, entryCount: 1 },
  { playerId: "p2", playerName: "Bob", result: "runner_up", tournamentDay: 2, matchCount: 4, entryCount: 1 },
  { playerId: "p3", playerName: "Cara", result: "win", tournamentDay: 2, matchCount: 3, entryCount: 1 },
  { playerId: "p4", playerName: "Drew", result: "win", tournamentDay: 2, matchCount: 2, entryCount: 1 },
];

export async function GET() {
  const leaderboard = buildDayTwoLeaderboard(demoLeaderboard);
  const freeEntryCredits = generateFreeEntryCredits(leaderboard);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ leaderboard, freeEntryCredits, source: "demo" });
  }

  try {
    const db = adminSupabase();
    const { data, error } = await db.from("day2_leaderboard").select("*").order("total_points", { ascending: false }).order("player_name", { ascending: true });
    if (error) throw error;

    const rows = data && data.length > 0 ? data : leaderboard;
    return NextResponse.json({ leaderboard: rows, freeEntryCredits: generateFreeEntryCredits(rows), source: "supabase" });
  } catch {
    return NextResponse.json({ leaderboard, freeEntryCredits, source: "fallback" });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body is required." }, { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events : [];
  const leaderboard = buildDayTwoLeaderboard(events as any[]);
  const freeEntryCredits = generateFreeEntryCredits(leaderboard);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ leaderboard, freeEntryCredits, source: "demo" });
  }

  try {
    const db = adminSupabase();
    for (const row of leaderboard) {
      await db.from("day2_leaderboard").upsert({
        player_id: row.playerId,
        player_name: row.playerName,
        entries_count: row.entriesCount,
        first_place_count: row.firstPlaceCount,
        second_place_count: row.secondPlaceCount,
        total_points: row.totalPoints,
        updated_at: new Date().toISOString(),
      }, { onConflict: "player_id" });
    }

    return NextResponse.json({ leaderboard, freeEntryCredits, source: "supabase" });
  } catch {
    return NextResponse.json({ leaderboard, freeEntryCredits, source: "fallback" });
  }
}
