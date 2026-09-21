import { currentUser, type CurrentUser } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase";

/** Matches the key already used by the announcements and rulebooks routes. */
export const LEAGUE_KEY = "seguin-8ball";

/**
 * Owners run the league. Captains set their own team's lineup. Everyone else
 * reads. Without the captain tier a captain could not touch their own lineup,
 * which is the whole point of sharing one.
 */
export async function captainTeams(user: CurrentUser): Promise<string[]> {
  if (user.role === "owner") return [];
  const { data } = await adminSupabase()
    .from("league_captains")
    .select("team_name")
    .eq("league_key", LEAGUE_KEY)
    .eq("profile_id", user.id);
  return (data ?? []).map(row => row.team_name as string);
}

export type LineupPermission =
  | { ok: true; user: CurrentUser }
  | { ok: false; status: number; error: string };

/** A lineup write is allowed for the owner, or for a captain of either team on it. */
export async function canEditLineup(homeTeam: string, awayTeam: string): Promise<LineupPermission> {
  const user = await currentUser();
  if (!user) return { ok: false, status: 401, error: "Sign in to change the lineup." };
  if (user.role === "owner") return { ok: true, user };
  const teams = (await captainTeams(user)).map(t => t.trim().toLowerCase());
  const wanted = [homeTeam, awayTeam].map(t => t.trim().toLowerCase()).filter(Boolean);
  if (wanted.some(t => teams.includes(t))) return { ok: true, user };
  return { ok: false, status: 403, error: "Only the league owner or a captain of one of these teams can change this lineup." };
}
