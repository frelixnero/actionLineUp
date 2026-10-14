import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { captainTeams } from "@/lib/league";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  // The client gates editing controls on these; the API routes stay the
  // enforcer and re-derive them per request.
  let teams: string[] = [];
  try {
    teams = user.role === "owner" ? [] : await captainTeams(user);
  } catch {
    teams = [];
  }
  return NextResponse.json({ user: { ...user, captainTeams: teams } });
}
