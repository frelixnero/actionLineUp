import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY } from "@/lib/league";
import { originFrom, stripeClient, stripeConfigured } from "@/lib/billing";

/** The signed-in player's own membership. Never anyone else's. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ membership: null, configured: stripeConfigured() }, { status: 200 });
  try {
    const { data } = await adminSupabase()
      .from("memberships")
      .select("tier, status, current_period_end, cancel_at_period_end")
      .eq("profile_id", user.id).eq("league_key", LEAGUE_KEY)
      .maybeSingle();
    return NextResponse.json({
      configured: stripeConfigured(),
      membership: data
        ? { tier: data.tier, status: data.status, currentPeriodEnd: data.current_period_end, cancelAtPeriodEnd: data.cancel_at_period_end }
        : { tier: "free", status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: false },
    });
  } catch {
    return NextResponse.json({ membership: null, configured: stripeConfigured(), offline: true });
  }
}

/** Opens the Stripe billing portal so a member can change or cancel their own plan. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage your membership." }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Memberships are not open yet." }, { status: 503 });
  try {
    const { data } = await adminSupabase()
      .from("memberships").select("provider_customer_id")
      .eq("profile_id", user.id).eq("league_key", LEAGUE_KEY)
      .maybeSingle();
    if (!data?.provider_customer_id) {
      return NextResponse.json({ error: "No membership to manage yet." }, { status: 404 });
    }
    const session = await stripeClient().billingPortal.sessions.create({
      customer: data.provider_customer_id,
      return_url: originFrom(request),
    });
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "Could not open the billing portal." }, { status: 503 });
  }
}
