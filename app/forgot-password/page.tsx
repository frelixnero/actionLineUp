"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState(""); const [status, setStatus] = useState(""); const [sending, setSending] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSending(true); setStatus(""); const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier }) }); setSending(false); setStatus(response.ok ? "If an account matches, a password-reset link has been sent." : "Please enter your email or username and try again."); };
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><p className="eyebrow">ACTION LINE-UP</p><h1>Reset your password</h1><p>Enter the email connected to your account. Players who created an account with a username can enter that username instead.</p><label>Email or username<input value={identifier} onChange={event => setIdentifier(event.target.value)} required /></label>{status && <p className="auth-status">{status}</p>}<button disabled={sending}>{sending ? "Sending…" : "Send reset link"}</button><Link href="/">Back to sign in</Link></form></main>;
}
