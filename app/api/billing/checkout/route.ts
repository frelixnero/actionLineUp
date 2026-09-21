import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY } from "@/lib/league";
import { originFrom, priceFor, stripeClient, stripeConfigured, type Tier } from "@/lib/billing";

/**
 * Starts a Stripe Checkout session for a membership tier.
 *
 * The price comes from server-side env, never from the request body, so a
 * caller cannot name their own amount. The tier is the only thing the client
 * chooses, and it is validated against a fixed list.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to start a membership." }, { status: 401 });
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Memberships are not open yet." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const tier: Tier | null = body?.tier === "basic" || body?.tier === "premium" ? body.tier : null;
    if (!tier) return NextResponse.json({ error: "Pick the Basic or Premium tier." }, { status: 400 });

    const db = adminSupabase();
    const { data: existing } = await db
      .from("memberships")
      .select("provider_customer_id, tier, status")
      .eq("profile_id", user.id).eq("league_key", LEAGUE_KEY)
      .maybeSingle();

    if (existing?.status === "active" && existing.tier === tier) {
      return NextResponse.json({ error: `You already have an active ${tier} membership.` }, { status: 409 });
    }

    const stripe = stripeClient();
    const origin = originFrom(request);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceFor(tier), quantity: 1 }],
      // Reuse the customer if this player has subscribed before, so Stripe does
      // not accumulate a new customer record per checkout attempt.
      ...(existing?.provider_customer_id
        ? { customer: existing.provider_customer_id }
        : { customer_email: user.email ?? undefined }),
      // The webhook is the only thing that grants access, and it reads these.
      client_reference_id: user.id,
      subscription_data: { metadata: { profile_id: user.id, league_key: LEAGUE_KEY, tier } },
      metadata: { profile_id: user.id, league_key: LEAGUE_KEY, tier },
      success_url: `${origin}/?membership=active`,
      cancel_url: `${origin}/?membership=cancelled`,
      allow_promotion_codes: true,
    });

    if (!session.url) throw new Error("Stripe returned no checkout URL.");
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 503 });
  }
}
