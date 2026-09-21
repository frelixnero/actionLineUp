"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState(""); const [status, setStatus] = useState("Checking your reset link…"); const [ready, setReady] = useState(false); const [supabase, setSupabase] = useState<any>(null);
  useEffect(() => { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; if (!url || !key) { setStatus("Password reset is temporarily unavailable."); return; } const client = createClient(url, key); setSupabase(client); client.auth.getSession().then(({ data }) => { setReady(Boolean(data.session)); setStatus(data.session ? "Choose a new password." : "This reset link is invalid or has expired. Request a new one."); }); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!supabase) return; const { error } = await supabase.auth.updateUser({ password }); setStatus(error ? error.message : "Password updated. You can sign in now."); };
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><p className="eyebrow">ACTION LINE-UP</p><h1>Choose a new password</h1><p>{status}</p><label>New password<input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} required disabled={!ready} /></label><button disabled={!ready}>Update password</button><Link href="/">Back to sign in</Link></form></main>;
}
