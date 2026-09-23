import { NextResponse } from "next/server";
import { adminSupabase, publicSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { ACCESS_COOKIE, createDemoToken } from "@/lib/auth";
import { bootstrapOwnerIfNeeded } from "@/lib/owner";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cleanEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    let cleanUsername = typeof body.username === "string" ? body.username.trim() : "";

    if (!cleanUsername && cleanEmail.includes("@")) {
      cleanUsername = cleanEmail.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "");
    }
    if (!cleanUsername) {
      cleanUsername = "player_" + Math.floor(1000 + Math.random() * 9000);
    }

    if (!/^\S+@\S+\.\S+$/.test(cleanEmail) || password.length < 8) {
      return NextResponse.json({ error: "Please provide a valid email and a password with at least 8 characters." }, { status: 400 });
    }

    // If Supabase is not configured, register in local demo presentation mode
    if (!isSupabaseConfigured()) {
      const isOwner = cleanEmail.includes("owner") || cleanEmail === (process.env.INITIAL_OWNER_EMAIL?.toLowerCase() ?? "owner@seguinpool.org");
      const role = isOwner ? "owner" : "player";

      const demoUser = {
        id: "demo-" + cleanUsername.toLowerCase().replace(/[^a-z0-9]/g, ""),
        username: cleanUsername,
        role: role as "owner" | "player",
        email: cleanEmail,
      };

      const token = createDemoToken(demoUser);
      const response = NextResponse.json({ ok: true, id: demoUser.id, role, username: cleanUsername });
      response.cookies.set(ACCESS_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
      return response;
    }

    const admin = adminSupabase();
    const { data, error } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      if (error?.message?.toLowerCase().includes("already")) {
        try {
          const publicClient = publicSupabase();
          const { data: authData, error: signInErr } = await publicClient.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });
          if (!signInErr && authData?.user && authData?.session?.access_token) {
            await bootstrapOwnerIfNeeded(admin, authData.user.id, cleanEmail);
            const { data: profile } = await admin
              .from("profiles")
              .select("username, role")
              .eq("id", authData.user.id)
              .maybeSingle();

            const role = profile?.role ?? "player";
            const username = profile?.username ?? cleanUsername;
            const response = NextResponse.json({ ok: true, id: authData.user.id, role, username });
            response.cookies.set(ACCESS_COOKIE, authData.session.access_token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              path: "/",
              maxAge: 60 * 60 * 24,
            });
            return response;
          }
        } catch {
          // Fall through to error response
        }
        return NextResponse.json({ error: "This email is already registered. Please click 'Sign in' instead." }, { status: 400 });
      }
      return NextResponse.json({ error: error?.message ?? "Could not create this account." }, { status: 400 });
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: data.user.id,
      username: cleanUsername,
      email: cleanEmail,
      role: "player",
    });

    if (profileError) {
      // If username collided, try with random suffix
      const altUsername = `${cleanUsername}_${Math.floor(100 + Math.random() * 900)}`;
      const { error: retryError } = await admin.from("profiles").insert({
        id: data.user.id,
        username: altUsername,
        email: cleanEmail,
        role: "player",
      });
      if (retryError) {
        await admin.auth.admin.deleteUser(data.user.id);
        return NextResponse.json({ error: "That username or email is already registered." }, { status: 400 });
      }
      cleanUsername = altUsername;
    }

    const promoted = await bootstrapOwnerIfNeeded(admin, data.user.id, cleanEmail);
    const role = promoted ? "owner" : "player";

    const response = NextResponse.json({ ok: true, id: data.user.id, role, username: cleanUsername });

    // Automatically sign in the user to issue their access token cookie
    try {
      const publicClient = publicSupabase();
      const { data: authData } = await publicClient.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (authData?.session?.access_token) {
        response.cookies.set(ACCESS_COOKIE, authData.session.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24,
        });
      }
    } catch {
      // Account created even if immediate token generation had a glitch
    }

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Account creation is not available yet. Please try again shortly.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
