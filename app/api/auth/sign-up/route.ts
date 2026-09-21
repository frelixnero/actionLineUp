import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { bootstrapOwnerIfNeeded } from "@/lib/owner";

export async function POST(request: Request) {
  try {
    const { username, email, password } = await request.json();
    const cleanUsername = typeof username === "string" ? username.trim() : "";
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(cleanUsername) || !/^\S+@\S+\.\S+$/.test(cleanEmail) || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Use a username, a real email, and a password with at least 8 characters." }, { status: 400 });
    }
    const admin = adminSupabase();
    const { data, error } = await admin.auth.admin.createUser({
      email: cleanEmail, password, email_confirm: true,
    });
    if (error || !data.user) return NextResponse.json({ error: error?.message ?? "Could not create this account." }, { status: 400 });
    const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, username: cleanUsername, email: cleanEmail, role: "player" });
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return NextResponse.json({ error: "That username is already in use." }, { status: 400 });
    }
    const promoted = await bootstrapOwnerIfNeeded(admin, data.user.id, cleanEmail);
    return NextResponse.json({ ok: true, role: promoted ? "owner" : "player", username: cleanUsername });
  } catch {
    return NextResponse.json({ error: "Account creation is not available yet. Please try again shortly." }, { status: 503 });
  }
}
