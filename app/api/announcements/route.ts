import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase";

const leagueKey = "seguin-8ball";

export async function GET() {
  try {
    const { data, error } = await adminSupabase().from("league_announcements").select("id, title, message, created_at").eq("league_key", leagueKey).order("created_at", { ascending: false }).limit(25);
    if (error) throw error;
    return NextResponse.json({ announcements: data ?? [] });
  } catch {
    return NextResponse.json({ announcements: [] });
  }
}

export async function POST(request: Request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Only the league owner can publish announcements." }, { status: 403 });
  try {
    const { title, message } = await request.json();
    if (typeof title !== "string" || typeof message !== "string" || title.trim().length < 3 || message.trim().length < 3) {
      return NextResponse.json({ error: "Add an announcement title and message." }, { status: 400 });
    }
    const { data, error } = await adminSupabase().from("league_announcements").insert({ league_key: leagueKey, title: title.trim().slice(0, 120), message: message.trim().slice(0, 1200), posted_by: owner.id }).select("id, title, message, created_at").single();
    if (error) throw error;
    return NextResponse.json({ announcement: data });
  } catch {
    return NextResponse.json({ error: "Could not publish the announcement." }, { status: 503 });
  }
}
