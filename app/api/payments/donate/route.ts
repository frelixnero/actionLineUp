import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY } from "@/lib/league";
import { originFrom, stripeClient, stripeConfigured } from "@/lib/billing";

/**
 * Fundraiser donations. Anyone (signed in or not) can start a one-time
 * Checkout; the webhook records completed payments in public.donations,
 * and the meter below reads the sum. The client picks from fixed tiers
 * validated here, so it can never name its own price.
 */
const TIERS_CENTS = [500, 1000, 2500, 5000];

export async function GET() {
  try {
    const { data, error } = await adminSupabase()
      .from("donations")
      .select("amount_cents")
      .eq("league_key", LEAGUE_KEY);
    if (error) throw error;
    const raisedCents = (data ?? []).reduce((sum, row) => sum + (row.amount_cents ?? 0), 0);
    return NextResponse.json({ raisedCents, count: data?.length ?? 0, configured: stripeConfigured() });
  } catch {
    return NextResponse.json({ raisedCents: 0, count: 0, configured: stripeConfigured(), offline: true });
  }
}

export async function POST(request: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: "Donations are not open yet." }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const amountCents = Math.round(Number(body.amountCents ?? 0));
  if (!TIERS_CENTS.includes(amountCents)) {
    return NextResponse.json({ error: "Pick a listed donation amount." }, { status: 400 });
  }
  try {
    const origin = originFrom(request);
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: { name: "Action Line-Up team fundraiser donation" },
        },
        quantity: 1,
      }],
      metadata: { type: "donation", league_key: LEAGUE_KEY },
      success_url: `${origin}/?donation=thanks`,
      cancel_url: `${origin}/?donation=cancelled`,
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL.");
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "Could not start donation checkout." }, { status: 503 });
  }
}
