import { NextResponse } from "next/server";
import { adminSupabase, publicSupabase, signInIdentifierToEmail, isSupabaseConfigured } from "@/lib/supabase";
import { ACCESS_COOKIE, createDemoToken } from "@/lib/auth";
import { bootstrapOwnerIfNeeded } from "@/lib/owner";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawIdentifier = (typeof body.email === "string" ? body.email : typeof body.username === "string" ? body.username : "").trim();
    const password = typeof body.password === "string" ? body.password : "";

    if (!rawIdentifier || password.length < 8) {
      return NextResponse.json({ error: "Enter your email and password (at least 8 characters)." }, { status: 400 });
    }

    // If Supabase is not configured, authenticate in local demo presentation mode
    if (!isSupabaseConfigured()) {
      const username = rawIdentifier.includes("@") ? rawIdentifier.split("@")[0] : rawIdentifier;
      const cleanEmail = rawIdentifier.includes("@") ? rawIdentifier.toLowerCase() : `${username.toLowerCase()}@actionlineup.local`;
      const isOwner = cleanEmail.includes("owner") || cleanEmail === (process.env.INITIAL_OWNER_EMAIL?.toLowerCase() ?? "owner@seguinpool.org");
      const role = isOwner ? "owner" : "player";

      const demoUser = {
        id: "demo-" + username.toLowerCase().replace(/[^a-z0-9]/g, ""),
        username,
        role: role as "owner" | "player",
        email: cleanEmail,
      };

      const token = createDemoToken(demoUser);
      const response = NextResponse.json({ ok: true, id: demoUser.id, username, role });
      response.cookies.set(ACCESS_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
      return response;
    }

    let email = signInIdentifierToEmail(rawIdentifier);
    if (!rawIdentifier.includes("@")) {
      const { data: profileByUsername } = await adminSupabase()
        .from("profiles")
        .select("email")
        .ilike("username", rawIdentifier)
        .maybeSingle();
      email = profileByUsername?.email ?? email;
    }

    const supabase = publicSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json({ error: "That email or password is not correct." }, { status: 401 });
    }

    const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", data.user.id).single();
    const promoted = profile?.role !== "owner" && (await bootstrapOwnerIfNeeded(adminSupabase(), data.user.id, data.user.email));
    const role = promoted ? "owner" : profile?.role ?? "player";
    const username = profile?.username ?? (rawIdentifier.includes("@") ? rawIdentifier.split("@")[0] : rawIdentifier);

    const response = NextResponse.json({ ok: true, id: data.user.id, username, role });
    if (data.session?.access_token) {
      response.cookies.set(ACCESS_COOKIE, data.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
    }
    return response;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Sign-in is not available yet. Please try again shortly.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
