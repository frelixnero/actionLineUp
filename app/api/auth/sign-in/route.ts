import { NextResponse } from "next/server";
import { adminSupabase, publicSupabase, signInIdentifierToEmail } from "@/lib/supabase";
import { ACCESS_COOKIE } from "@/lib/auth";
import { bootstrapOwnerIfNeeded } from "@/lib/owner";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
    }
    let email = signInIdentifierToEmail(username);
    if (!username.includes("@")) {
      const { data: profileByUsername } = await adminSupabase().from("profiles").select("email").eq("username", username.trim()).maybeSingle();
      email = profileByUsername?.email ?? email;
    }
    const supabase = publicSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return NextResponse.json({ error: "That username or password is not correct." }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", data.user.id).single();
    // Claims the owner seat if this is the configured address and nobody holds it yet.
    const promoted = profile?.role !== "owner" && await bootstrapOwnerIfNeeded(adminSupabase(), data.user.id, data.user.email);
    const response = NextResponse.json({ ok: true, username: profile?.username ?? username, role: promoted ? "owner" : profile?.role ?? "player" });
    response.cookies.set(ACCESS_COOKIE, data.session.access_token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 });
    return response;
  } catch {
    return NextResponse.json({ error: "Sign-in is not available yet. Please try again shortly." }, { status: 503 });
  }
}
