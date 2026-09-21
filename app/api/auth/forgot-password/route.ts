import { NextResponse } from "next/server";
import { adminSupabase, publicSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { identifier } = await request.json();
    if (typeof identifier !== "string" || !identifier.trim()) return NextResponse.json({ error: "Enter your email or username." }, { status: 400 });
    const cleaned = identifier.trim().toLowerCase();
    let email = cleaned.includes("@") ? cleaned : null;
    if (!email) {
      const { data } = await adminSupabase().from("profiles").select("email").eq("username", cleaned).maybeSingle();
      email = data?.email ?? null;
    }
    if (email) {
      const { error } = await publicSupabase().auth.resetPasswordForEmail(email, { redirectTo: new URL("/reset-password", request.url).toString() });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 });
  }
}
