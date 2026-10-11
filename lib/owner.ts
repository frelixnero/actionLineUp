import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Owner authority.
 *
 * The `OWNER_EMAIL` env var (comma-separated) is the single source of truth
 * for who is an owner. `profiles.role` in the database is NOT consulted for
 * authorization — see `resolveRole` below. Sign-up/sign-in still backfill
 * `profiles.role` via `bootstrapOwnerIfNeeded` so the table stays consistent
 * for anything inspecting it directly, but no permission check reads it.
 *
 * Strict mode: an address with `owner` in the database but NOT in
 * `OWNER_EMAIL` is treated as a player. If `OWNER_EMAIL` is empty or
 * unset, nobody is an owner — `warnIfOwnerEnvEmpty` logs once so a
 * misconfigured deployment is visible instead of silently locked out.
 */

export const getOwnerEmails = (): string[] =>
  (process.env.OWNER_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const isOwnerEmail = (email: string | null | undefined): boolean => {
  if (!email) return false;
  const target = email.trim().toLowerCase();
  return getOwnerEmails().includes(target);
};

/**
 * Resolve the effective role for a user. Env-listed emails are always
 * owners; everyone else is a player regardless of the stored DB role.
 */
export const resolveRole = (
  email: string | null | undefined,
  _dbRole?: string | null,
): "owner" | "player" => (isOwnerEmail(email) ? "owner" : "player");

let _warnedEmpty = false;
export function warnIfOwnerEnvEmpty(): void {
  if (_warnedEmpty) return;
  if (getOwnerEmails().length === 0) {
    _warnedEmpty = true;
    console.warn("[auth] OWNER_EMAIL is empty or unset — no user will have owner access.");
  }
}

export async function bootstrapOwnerIfNeeded(
  admin: SupabaseClient,
  userId: string,
  email: string | null | undefined,
): Promise<boolean> {
  if (!isOwnerEmail(email)) return false;

  try {
    const { error } = await admin.from("profiles").update({ role: "owner" }).eq("id", userId);
    return !error;
  } catch {
    return false;
  }
}
