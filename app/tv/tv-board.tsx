"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Crown, Medal, Trophy, Wifi, WifiOff } from "lucide-react";
import {
  formatByKey, standings, champion, chipCounts, swissRoundCount,
  type EngineMatch, type FormatConfig, type Side,
} from "@/lib/formats";

const POLL_MS = 12000;
const PRESENTED_BY = "ActionLadder";
// Explicit demo fallback gate: demo rows never render as server data.
// The TV is a read-only kiosk fed by live server polls below.
const ALLOW_DEMO_ROWS = false;
type ScreenKey = "live" | "leaderboard" | "champions";

type Board = {
  tournament: { id: string; name: string; format: string; raceTo: number; status: string; prizeNote?: string; rounds?: number | null; chips?: number | null; advancers?: number | null };
  entrants: { id: string; name: string }[];
  sides?: Side[];
  matches: EngineMatch[];
};

type LeaderboardRow = {
  playerId?: string;
  playerName?: string;
  player_name?: string;
  totalPoints?: number;
  total_points?: number;
  entriesCount?: number;
  entries_count?: number;
  firstPlaceCount?: number;
  first_place_count?: number;
  secondPlaceCount?: number;
  second_place_count?: number;
};

const withOverrides = (base: FormatConfig, t: Board["tournament"]): FormatConfig => ({
  ...base,
  ...(t.rounds ? { rounds: t.rounds } : {}),
  ...(t.chips ? { chips: t.chips } : {}),
  ...(t.advancers ? { advancers: t.advancers } : {}),
});

export default function TvBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [miniTitle, setMiniTitle] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [ready, setReady] = useState(false);
  const [clock, setClock] = useState("");
  const [screen, setScreen] = useState<ScreenKey>("live");

  const pull = useCallback(async () => {
    try {
      const [listRes, leaderboardRes, miniRes] = await Promise.all([
        fetch("/api/tournaments", { cache: "no-store" }),
        fetch("/api/day2-leaderboard", { cache: "no-store" }),
        fetch("/api/mini-tournaments", { cache: "no-store" }),
      ]);

      const list = listRes.ok ? await listRes.json() : null;
      const running = list?.tournaments?.find((t: { status?: string }) => t.status !== "complete");
      const pick = running ?? list?.tournaments?.[0];
      if (pick?.id) {
        const full = await fetch(`/api/tournaments/${pick.id}`, { cache: "no-store" }).then(r => (r.ok ? r.json() : null));
        if (full?.tournament) setBoard(full);
      } else {
        setBoard(null);
      }

      if (leaderboardRes.ok) {
        const payload = await leaderboardRes.json();
        setLeaderboard(Array.isArray(payload?.leaderboard) ? payload.leaderboard : []);
      }

      if (miniRes.ok) {
        const payload = await miniRes.json();
        setMiniTitle(payload?.title || payload?.supported ? "Vegas Mini Madness" : null);
      }

      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void pull();
    const poll = setInterval(() => { void pull(); }, POLL_MS);
    const tick = setInterval(() => setClock(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })), 1000);
    const cycle = setInterval(() => {
      setScreen((prev) => prev === "live" ? "leaderboard" : prev === "leaderboard" ? "champions" : "live");
    }, 8000);
    return () => { clearInterval(poll); clearInterval(tick); clearInterval(cycle); };
  }, [pull]);

  if (!ready) return <main className="tv-shell"><p className="tv-waiting">Connecting…</p></main>;

  const leaderboardRows = leaderboard.length ? leaderboard.slice(0, 5).map((row, idx) => ({
    rank: idx + 1,
    name: row.playerName ?? row.player_name ?? `Player ${idx + 1}`,
    points: row.totalPoints ?? row.total_points ?? 0,
    entries: row.entriesCount ?? row.entries_count ?? 0,
  })) : (ALLOW_DEMO_ROWS ? [
    { rank: 1, name: "Alice", points: 10, entries: 1 },
    { rank: 2, name: "Bob", points: 7, entries: 1 },
    { rank: 3, name: "Cara", points: 5, entries: 1 },
  ] : []);

  // Idle branded state whenever no active tournament exists. The TV stays on
  // this kiosk screen instead of cycling leaderboard/champions filler.
  if (!board) {
    return <main className="tv-shell">
      <div className="tv-idle">
        <Trophy />
        <p className="tv-presents">{PRESENTED_BY} presents</p>
        <h1>Action Line-Up</h1>
        <p>{miniTitle ?? "No event running right now."}</p>
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

  const screenContent = (() => {
    if (screen === "leaderboard") {
      return <main className="tv-shell">
        <header className="tv-top">
          <div>
            <p className="tv-eyebrow">Day 2</p>
            <h1>Leaderboard</h1>
            <p className="tv-brand">{miniTitle ?? "Vegas Mini Madness"}</p>
          </div>
          <div className="tv-meta">
            <span className="tv-live"><BarChart3 size={14} /> LIVE</span>
            <span className="tv-clock">{clock}</span>
          </div>
        </header>
        <div className="tv-body">
          <section className="tv-now">
            <h2>Top performers</h2>
            <div className="tv-table-rows">
              {leaderboardRows.length === 0
                ? <p className="tv-waiting">No leaderboard entries yet.</p>
                : leaderboardRows.map((row) => (
                <div key={row.name}>
                  <span>#{row.rank}</span>
                  <strong>{row.name}</strong>
                  <b>{row.points}</b>
                  <small>{row.entries} entries</small>
                </div>
              ))}
            </div>
          </section>
          <aside className="tv-standings">
            <h2>Free-entry credits</h2>
            <div className="tv-table-rows">
              {leaderboardRows.slice(0, 3).map((row) => (
                <div key={`${row.name}-credit`}>
                  <span><Crown size={14} /></span>
                  <strong>{row.name}</strong>
                  <b>{row.points} pts</b>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>;
    }

    if (screen === "champions") {
      return <main className="tv-shell">
        <header className="tv-top">
          <div>
            <p className="tv-eyebrow">Action Ladder</p>
            <h1>Recent champions</h1>
            <p className="tv-brand">{PRESENTED_BY} presents</p>
          </div>
          <div className="tv-meta">
            <span className="tv-live"><Trophy size={14} /> HONOR ROLL</span>
            <span className="tv-clock">{clock}</span>
          </div>
        </header>
        <div className="tv-body">
          <section className="tv-now">
            <h2>Past winners</h2>
            <div className="tv-table-rows">
              {leaderboardRows.length === 0
                ? <p className="tv-waiting">No champions crowned yet.</p>
                : leaderboardRows.map((row) => (
                <div key={`${row.name}-past`}>
                  <span>#{row.rank}</span>
                  <strong>{row.name}</strong>
                  <b>{row.points} pts</b>
                  <small>{row.entries} total</small>
                </div>
              ))}
            </div>
          </section>
          <aside className="tv-standings">
            <h2>Tonight&apos;s highlight</h2>
            <div className="tv-table-rows">
              <div>
                <span><Medal size={14} /></span>
                <strong>{championName ?? "—"}</strong>
                <b>{board.tournament.name || "Main event"}</b>
              </div>
            </div>
          </aside>
        </div>
      </main>;
    }

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
  })();

  return screenContent;
}
