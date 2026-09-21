import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY } from "@/lib/league";

/**
 * Assigning captains. Without this the captain tier in lib/league.ts can never
 * match anyone: the table would exist, the permission check would read it, and
 * it would always come back empty, leaving every captain a spectator.
 *
 * Only the owner can assign or remove a captain.
 */

type CaptainRow = { id: string; team_name: string; profile_id: string; created_at: string };

export async function GET() {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Only the league owner can see captains." }, { status: 403 });
  try {
    const db = adminSupabase();
    const { data, error } = await db
      .from("league_captains")
      .select("id, team_name, profile_id, created_at")
      .eq("league_key", LEAGUE_KEY)
      .order("team_name");
    if (error) throw error;

    const rows = (data ?? []) as CaptainRow[];
    const ids = [...new Set(rows.map(r => r.profile_id))];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await db.from("profiles").select("id, username").in("id", ids);
      for (const p of profiles ?? []) names.set(p.id as string, p.username as string);
    }
    return NextResponse.json({
      captains: rows.map(r => ({ id: r.id, teamName: r.team_name, profileId: r.profile_id, username: names.get(r.profile_id) ?? "(unknown)", createdAt: r.created_at })),
    });
  } catch {
    return NextResponse.json({ captains: [], offline: true });
  }
}

export async function POST(request: Request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Only the league owner can assign a captain." }, { status: 403 });
  try {
    const body = await request.json();
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const teamName = typeof body?.teamName === "string" ? body.teamName.trim().slice(0, 80) : "";
    if (!username || !teamName) return NextResponse.json({ error: "Give a player username and a team name." }, { status: 400 });

    const db = adminSupabase();
    // Match on username case-insensitively; players rarely type their own casing back.
    const { data: profile, error: lookupError } = await db
      .from("profiles").select("id, username").ilike("username", username).maybeSingle();
    if (lookupError) throw lookupError;
    if (!profile) return NextResponse.json({ error: `No player account found for "${username}".` }, { status: 404 });

    const { data, error } = await db
      .from("league_captains")
      .upsert({ league_key: LEAGUE_KEY, profile_id: profile.id, team_name: teamName }, { onConflict: "league_key,profile_id,team_name" })
      .select("id, team_name, profile_id, created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({
      captain: { id: data.id, teamName: data.team_name, profileId: data.profile_id, username: profile.username, createdAt: data.created_at },
    });
  } catch {
    return NextResponse.json({ error: "Could not assign the captain." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Only the league owner can remove a captain." }, { status: 403 });
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which captain?" }, { status: 400 });
    const { error } = await adminSupabase().from("league_captains").delete().eq("id", id).eq("league_key", LEAGUE_KEY);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not remove the captain." }, { status: 503 });
  }
}
