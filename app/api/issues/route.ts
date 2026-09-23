import { NextResponse } from "next/server";
import { currentUser, requireOwner } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY } from "@/lib/league";

export async function GET() {
  try {
    const db = adminSupabase();
    const { data, error } = await db
      .from("league_issues")
      .select("id, type, details, resolved, created_at, resolved_at, reported_by")
      .eq("league_key", LEAGUE_KEY)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const issues = (data ?? []).map((row) => ({
      id: row.id,
      type: row.type,
      details: row.details,
      resolved: Boolean(row.resolved),
      createdAt: row.created_at,
    }));

    return NextResponse.json({ issues });
  } catch {
    return NextResponse.json({ issues: [], offline: true });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = typeof body?.type === "string" ? body.type.trim().slice(0, 60) : "Score correction";
    const details = typeof body?.details === "string" ? body.details.trim().slice(0, 1500) : "";

    if (!details) {
      return NextResponse.json({ error: "Provide details of the problem." }, { status: 400 });
    }

    const user = await currentUser();
    const db = adminSupabase();

    const { data, error } = await db
      .from("league_issues")
      .insert({
        league_key: LEAGUE_KEY,
        type,
        details,
        reported_by: user?.id ?? null,
      })
      .select("id, type, details, resolved, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({
      issue: {
        id: data.id,
        type: data.type,
        details: data.details,
        resolved: data.resolved,
        createdAt: data.created_at,
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not submit the report to the owner." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const owner = await requireOwner();
  if (!owner) {
    return NextResponse.json({ error: "Only the league owner can resolve reports." }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Issue ID required." }, { status: 400 });
    }

    const db = adminSupabase();
    const { error } = await db
      .from("league_issues")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("league_key", LEAGUE_KEY);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not update the report." }, { status: 503 });
  }
}
