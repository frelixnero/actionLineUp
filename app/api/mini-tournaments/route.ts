import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { buildMiniBracket, validateFreeEntryCredits } from "@/lib/mini-bracket";

export async function GET() {
  return NextResponse.json({
    ok: true,
    supported: true,
    engine: "mini-bracket",
    note: "Use POST to generate a Vegas Mini Madness bracket for a 10-player field.",
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in before launching a mini tournament." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body is required." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "Vegas Mini Madness";
  const rawPlayers = Array.isArray(body.players) ? body.players : [];
  const players = [...new Set(rawPlayers.map((player) => String(player).trim()).filter(Boolean))];

  if (players.length < 2) {
    return NextResponse.json({ error: "At least two players are required to launch a mini tournament." }, { status: 400 });
  }

  const bracket = buildMiniBracket(players.slice(0, 10));
  const freeEntryCredits = validateFreeEntryCredits(players.slice(0, 10), players.slice(0, 3));

  return NextResponse.json({
    ok: true,
    title,
    entrants: players.slice(0, 10),
    bracket,
    freeEntryCredits,
    status: "registration",
    createdBy: user.username,
  });
}
