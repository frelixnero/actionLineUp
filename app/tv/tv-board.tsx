"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Trophy, Wifi, WifiOff } from "lucide-react";
import {
  formatByKey, standings, champion, chipCounts, swissRoundCount,
  type EngineMatch, type FormatConfig, type Side,
} from "@/lib/formats";

/**
 * The bar-screen view. Read-only, no sign-in, meant to be left open on a TV
 * across the room, so everything is sized to be read standing at a table
 * rather than holding a phone.
 *
 * It polls rather than holding a socket open: a screen that silently stops
 * updating is worse than one that refreshes a few seconds late, and a poll
 * recovers by itself when the bar's wifi drops and comes back.
 */

const POLL_MS = 12000;

/** Whose screen this is. The bar TV is ad inventory you own; put your name on it. */
const PRESENTED_BY = "ActionLadder";

type Board = {
  tournament: { id: string; name: string; format: string; raceTo: number; status: string; prizeNote?: string; rounds?: number | null; chips?: number | null; advancers?: number | null };
  entrants: { id: string; name: string }[];
  sides?: Side[];
  matches: EngineMatch[];
};

const withOverrides = (base: FormatConfig, t: Board["tournament"]): FormatConfig => ({
  ...base,
  ...(t.rounds ? { rounds: t.rounds } : {}),
  ...(t.chips ? { chips: t.chips } : {}),
  ...(t.advancers ? { advancers: t.advancers } : {}),
});

export default function TvBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [connected, setConnected] = useState(true);
  const [ready, setReady] = useState(false);
  const [clock, setClock] = useState("");

  const pull = useCallback(async () => {
    try {
      const list = await fetch("/api/tournaments", { cache: "no-store" }).then(r => r.json());
      const running = list?.tournaments?.find((t: { status?: string }) => t.status !== "complete");
      const pick = running ?? list?.tournaments?.[0];
      if (!pick?.id) { setBoard(null); setConnected(true); return; }
      const full = await fetch(`/api/tournaments/${pick.id}`, { cache: "no-store" }).then(r => (r.ok ? r.json() : null));
      if (full?.tournament) { setBoard(full); setConnected(true); }
    } catch {
      // Keep whatever is on screen. A blank TV mid-event is worse than a stale one.
      setConnected(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void pull();
    const poll = setInterval(() => { void pull(); }, POLL_MS);
    const tick = setInterval(() => setClock(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [pull]);

  if (!ready) return <main className="tv-shell"><p className="tv-waiting">Connecting…</p></main>;

  if (!board) {
    return <main className="tv-shell">
      <div className="tv-idle">
        <Trophy />
        <p className="tv-presents">{PRESENTED_BY} presents</p>
        <h1>Action Line-Up</h1>
        <p>No event running right now.</p>
        <span>This screen updates by itself when the director starts one.</span>
      </div>
    </main>;
  }

  const config = withOverrides(formatByKey(board.tournament.format), board.tournament);
  const sides: Side[] = board.sides ?? board.entrants.map(e => ({ id: e.id, name: e.name, memberIds: [e.id] }));
  const nameOf = (id: string | null) => (id ? sides.find(s => s.id === id)?.name ?? "—" : null);

  const championId = champion(config, sides, board.matches);
  const championName = championId ? nameOf(championId) : null;
  const table = standings(config, sides, board.matches);
  const chips = config.pairing === "chip" ? chipCounts(config, sides, board.matches) : null;

  // What is happening right now: the newest round that still has an open match,
  // falling back to the newest round so a finished board still shows the final.
  const maxRound = board.matches.length ? Math.max(...board.matches.map(m => m.round)) : 0;
  const openRound = [...new Set(board.matches.map(m => m.round))].sort((a, b) => a - b)
    .find(r => board.matches.some(m => m.round === r && m.a && m.b && !m.winner));
  const showRound = openRound ?? maxRound;
  const onNow = board.matches
    .filter(m => m.round === showRound && m.a && m.b)
    .sort((a, b) => a.slot - b.slot);

  const roundLabel = () => {
    if (config.pairing === "swiss") return `Round ${showRound + 1} of ${swissRoundCount(config, sides.length)}`;
    if (config.pairing === "chip") return `Round ${showRound + 1}`;
    if (config.pairing === "roundrobin") return "Matches";
    const total = maxRound + 1;
    if (showRound === total - 1) return "Final";
    if (showRound === total - 2) return "Semifinals";
    if (showRound === total - 3) return "Quarterfinals";
    return `Round ${showRound + 1}`;
  };

  return <main className="tv-shell">
    <header className="tv-top">
      <div>
        <p className="tv-eyebrow">{config.barName}</p>
        <h1>{board.tournament.name || "Tonight's event"}</h1>
        <p className="tv-brand">{PRESENTED_BY} presents <b>Action Line-Up</b></p>
      </div>
      <div className="tv-meta">
        <span className="tv-race">RACE TO {board.tournament.raceTo}</span>
        <span className={`tv-live ${connected ? "" : "stale"}`}>{connected ? <Wifi /> : <WifiOff />}{connected ? "LIVE" : "RECONNECTING"}</span>
        <span className="tv-clock">{clock}</span>
      </div>
    </header>

    {championName && <section className="tv-champion"><Crown /><div><span>WINNER</span><strong>{championName}</strong></div></section>}

    <div className="tv-body">
      <section className="tv-now">
        <h2>{championName ? "Final result" : `On now · ${roundLabel()}`}</h2>
        {onNow.length === 0
          ? <p className="tv-waiting">Waiting for the next round.</p>
          : <div className="tv-matches">{onNow.map((m, i) => <article key={m.id} className={m.winner ? "done" : ""}>
              <span className="tv-table">TABLE {i + 1}</span>
              <div className="tv-pair">
                <strong className={m.winner === m.a ? "won" : ""}>{nameOf(m.a)}</strong>
                <em>vs</em>
                <strong className={m.winner === m.b ? "won" : ""}>{nameOf(m.b)}</strong>
              </div>
            </article>)}</div>}
      </section>

      <aside className="tv-standings">
        <h2>{chips ? "Chips" : config.eliminates ? "Still in" : "Standings"}</h2>
        <div className="tv-table-rows">
          {table.slice(0, 10).map((s, i) => <div key={s.id} className={chips && (s.chips ?? 0) === 0 ? "out" : ""}>
            <span>{i + 1}</span>
            <strong>{s.name}</strong>
            <b>{chips ? s.chips : s.wins}</b>
            {!chips && <small>{s.losses}</small>}
          </div>)}
        </div>
      </aside>
    </div>

    <footer className="tv-foot">
      {board.tournament.prizeNote
        ? <span>{board.tournament.prizeNote} — awarded by the venue</span>
        : <span>{PRESENTED_BY} presents Action Line-Up</span>}
      <span>{sides.length} {config.teamSize === 2 ? "teams" : "players"}{config.eliminates ? "" : " · nobody eliminated"}</span>
    </footer>
  </main>;
}
