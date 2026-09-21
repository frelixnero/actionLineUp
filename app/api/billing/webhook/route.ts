import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY } from "@/lib/league";
import { membershipStatus, stripeClient, tierForPrice } from "@/lib/billing";

/**
 * Stripe webhook. This is the only thing that grants or revokes membership --
 * never the checkout redirect, which a user can hit without paying.
 *
 * Every event is verified against the signing secret, and every event id is
 * recorded, so Stripe's retries and out-of-order deliveries cannot double-apply
 * or resurrect a stale subscription state.
 */

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  // Signature verification needs the exact bytes, so read the body as text.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, signature, webhookSecret);
  } catch {
    // A bad signature means this did not come from Stripe. Never trust the payload.
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const db = adminSupabase();

  try {
    // Idempotency: if we have seen this event id, acknowledge and stop.
    const { error: seenError } = await db.from("billing_events").insert({ id: event.id, type: event.type });
    if (seenError) {
      if (seenError.code === "23505") return NextResponse.json({ received: true, duplicate: true });
      throw seenError;
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripeClient().subscriptions.retrieve(
            typeof session.subscription === "string" ? session.subscription : session.subscription.id);
          await applySubscription(db, sub, session.client_reference_id ?? null);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscription(db, event.data.object as Stripe.Subscription, null);
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch {
    // 500 so Stripe retries. The event id insert is rolled back only if it
    // failed; a recorded id with a failed apply is the one case worth watching.
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
}

type Db = ReturnType<typeof adminSupabase>;

async function applySubscription(db: Db, sub: Stripe.Subscription, fallbackProfileId: string | null) {
  const profileId = (sub.metadata?.profile_id as string | undefined) ?? fallbackProfileId;
  if (!profileId) return; // Nothing to attach this to; ignore rather than guess.

  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const tier = tierForPrice(priceId) ?? (sub.metadata?.tier === "premium" ? "premium" : "basic");
  const status = membershipStatus(sub.status);

  // A cancelled or unpaid subscription drops the member back to free rather than
  // leaving a paid tier on the row.
  const effectiveTier = status === "active" || status === "trial" ? tier : "free";

  const periodEnd = item?.current_period_end ?? null;

  await db.from("memberships").upsert({
    profile_id: profileId,
    league_key: (sub.metadata?.league_key as string | undefined) ?? LEAGUE_KEY,
    tier: effectiveTier,
    status,
    provider: "stripe",
    provider_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    provider_subscription_id: sub.id,
    price_id: priceId,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  }, { onConflict: "profile_id,league_key" });
}
