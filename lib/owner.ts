import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Owner bootstrap.
 *
 * Sign-up only ever creates players, and there is no in-app way to become the
 * owner, so a brand new deployment has nobody who can publish a tournament,
 * assign a captain or post an announcement. Promoting by hand needs the service
 * role key, which is marked sensitive in Vercel and cannot be read back out.
 *
 * This closes that gap with the narrowest rule that still works:
 *
 *   - the address must match OWNER_EMAIL exactly, and
 *   - there must be no owner yet.
 *
 * The second condition is what makes it safe to leave in the codebase: the
 * moment a first owner exists the path is dead, so it cannot be used later to
 * escalate. After that, ownership changes are a database operation, on purpose.
 */

export const ownerBootstrapEmail = (): string => (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();

export async function bootstrapOwnerIfNeeded(
  admin: SupabaseClient,
  userId: string,
  email: string | null | undefined,
): Promise<boolean> {
  const configured = ownerBootstrapEmail();
  if (!configured) return false;
  if ((email ?? "").trim().toLowerCase() !== configured) return false;

  try {
    const { count, error: countError } = await admin
      .from("profiles").select("id", { count: "exact", head: true }).eq("role", "owner");
    if (countError) return false;
    if ((count ?? 0) > 0) return false; // A league already has its owner.

    const { error } = await admin.from("profiles").update({ role: "owner" }).eq("id", userId);
    return !error;
  } catch {
    return false;
  }
}
