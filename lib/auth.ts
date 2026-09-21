import { cookies } from "next/headers";
import { publicSupabase } from "@/lib/supabase";

export const ACCESS_COOKIE = "actionlineup_access";

export type CurrentUser = { id: string; username: string; role: "owner" | "player"; email: string | null };

export async function currentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const supabase = publicSupabase();
  const { data: authData, error } = await supabase.auth.getUser(token);
  if (error || !authData.user) return null;
  const { data: profile } = await supabase.from("profiles").select("username, role, email").eq("id", authData.user.id).maybeSingle();
  return { id: authData.user.id, username: profile?.username ?? authData.user.email?.split("@")[0] ?? "member", role: profile?.role === "owner" ? "owner" : "player", email: profile?.email ?? authData.user.email ?? null };
}

export async function requireOwner() {
  const user = await currentUser();
  if (!user || user.role !== "owner") return null;
  return user;
}
