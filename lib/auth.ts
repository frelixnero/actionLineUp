import { cookies } from "next/headers";
import { isSupabaseConfigured, publicSupabase } from "@/lib/supabase";

export const ACCESS_COOKIE = "actionlineup_access";

export type CurrentUser = { id: string; username: string; role: "owner" | "player"; email: string | null };

export function createDemoToken(payload: CurrentUser): string {
  return "demo_" + Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function parseDemoToken(token: string): CurrentUser | null {
  try {
    if (!token.startsWith("demo_")) return null;
    const json = Buffer.from(token.slice(5), "base64").toString("utf-8");
    const data = JSON.parse(json);
    if (!data?.id || !data?.username) return null;
    return {
      id: String(data.id),
      username: String(data.username),
      role: data.role === "owner" ? "owner" : "player",
      email: data.email ? String(data.email) : null,
    };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  const demoUser = parseDemoToken(token);
  if (demoUser) return demoUser;

  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = publicSupabase();
    const { data: authData, error } = await supabase.auth.getUser(token);
    if (error || !authData.user) return null;
    const { data: profile } = await supabase.from("profiles").select("username, role, email").eq("id", authData.user.id).maybeSingle();
    return {
      id: authData.user.id,
      username: profile?.username ?? authData.user.email?.split("@")[0] ?? "member",
      role: profile?.role === "owner" ? "owner" : "player",
      email: profile?.email ?? authData.user.email ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireOwner() {
  const user = await currentUser();
  if (!user || user.role !== "owner") return null;
  return user;
}
