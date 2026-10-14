import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase";
import { LEAGUE_KEY, canEditLineup } from "@/lib/league";
import { originFrom, stripeClient, stripeConfigured } from "@/lib/billing";

const cleanText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Weekly-dues checkout: a captain (or owner) starts a one-time Stripe
 * payment for a player's fee. The webhook — never the redirect — flips
 * lineup_players.payment to paid, keyed by lineup + player name metadata.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to collect dues." }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Payments are not open yet." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const lineupId = cleanText(body.lineupId, 60);
  const playerName = cleanText(body.playerName, 80);
  const amountCents = Math.round(Number(body.amountCents ?? body.amount ?? 0));
  if (!lineupId || !playerName) {
    return NextResponse.json({ error: "lineupId and playerName are required." }, { status: 400 });
  }
  if (!Number.isFinite(amountCents) || amountCents < 100 || amountCents > 100000) {
    return NextResponse.json({ error: "Amount must be between $1 and $1,000." }, { status: 400 });
  }

  try {
    const db = adminSupabase();
    const { data: lineup } = await db
      .from("lineups")
      .select("home_team, away_team")
      .eq("id", lineupId)
      .eq("league_key", LEAGUE_KEY)
      .maybeSingle();
    if (!lineup) return NextResponse.json({ error: "Match not found." }, { status: 404 });

    // Same bar as publishing: owner or a captain of either team.
    const permission = await canEditLineup(lineup.home_team ?? "", lineup.away_team ?? "");
    if (!permission.ok) return NextResponse.json({ error: permission.error }, { status: permission.status });

    const origin = originFrom(request);
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: { name: `League dues — ${playerName}` },
        },
        quantity: 1,
      }],
      client_reference_id: user.id,
      metadata: { type: "dues", league_key: LEAGUE_KEY, lineup_id: lineupId, player_name: playerName },
      success_url: `${origin}/?dues=paid`,
      cancel_url: `${origin}/?dues=cancelled`,
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL.");
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "Could not start dues checkout." }, { status: 503 });
  }
}
