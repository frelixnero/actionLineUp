import Stripe from "stripe";

/**
 * Stripe wiring for the two membership tiers.
 *
 * Nothing here touches tournaments. Memberships are an ordinary SaaS
 * subscription between the league operator and the player; tournament objects
 * stay free of money entirely, which is what keeps the tournament engine out of
 * wagering territory.
 */

export type Tier = "basic" | "premium";

const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripeConfigured = () =>
  Boolean(secretKey && process.env.STRIPE_PRICE_BASIC && process.env.STRIPE_PRICE_PREMIUM);

export function stripeClient(): Stripe {
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return new Stripe(secretKey);
}

export function priceFor(tier: Tier): string {
  const id = tier === "basic" ? process.env.STRIPE_PRICE_BASIC : process.env.STRIPE_PRICE_PREMIUM;
  if (!id) throw new Error(`No Stripe price configured for the ${tier} tier.`);
  return id;
}

export const tierForPrice = (priceId: string | null | undefined): Tier | null => {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_BASIC) return "basic";
  if (priceId === process.env.STRIPE_PRICE_PREMIUM) return "premium";
  return null;
};

/** Stripe's subscription states mapped onto the ones the memberships table allows. */
export function membershipStatus(stripeStatus: string): "active" | "past_due" | "canceled" | "trial" {
  switch (stripeStatus) {
    case "trialing": return "trial";
    case "active": return "active";
    case "past_due":
    case "unpaid":
    case "incomplete": return "past_due";
    default: return "canceled";
  }
}

/** Absolute origin for Stripe redirect URLs, from the request rather than a guess. */
export function originFrom(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin;
}
