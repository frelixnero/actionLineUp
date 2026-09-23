"use client";

import { useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, Crown, Plus, RefreshCw, RotateCcw, Shuffle, Sparkles, Trophy, Tv, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import {
  FORMATS, formatByKey, buildSides, initialMatches, resolve, nextRound, standings, champion,
  chipCounts, swissRoundCount, roundComplete,
  type EngineMatch, type Entrant, type FormatConfig, type Side,
} from "@/lib/formats";

type DeskState = {
  formatKey: string;
  name: string;
  raceTo: number;
  prizeNote: string;
  rounds: number | null;
  chips: number | null;
  advancers: number | null;
  entrants: Entrant[];
  sides: Side[];
  matches: EngineMatch[];
};

const STORAGE_KEY = "action-line-up-tournament-v2";
const empty: DeskState = {
  formatKey: "single", name: "", raceTo: 5, prizeNote: "",
  rounds: null, chips: null, advancers: null,
  entrants: [], sides: [], matches: [],
};

const withOverrides = (base: FormatConfig, s: DeskState): FormatConfig => ({
  ...base,
  ...(s.rounds ? { rounds: s.rounds } : {}),
  ...(s.chips ? { chips: s.chips } : {}),
  ...(s.advancers ? { advancers: s.advancers } : {}),
});

export default function TournamentDesk() {
  const [state, setState] = useState<DeskState>(empty);
  const [entrantName, setEntrantName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [remoteId, setRemoteId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRebuild, setConfirmRebuild] = useState<{ message: string } | null>(null);

  const config = useMemo(() => withOverrides(formatByKey(state.formatKey), state), [state]);
  const shared = remoteId !== null;
  const canEdit = !shared || isOwner;
  const started = state.matches.length > 0;

  /** Adopt a board that lives on the server. Sides mirror entrants for the shareable formats. */
  const applyServer = (data: {
    tournament: { id: string; name: string; format: string; raceTo: number; prizeNote?: string; rounds?: number | null; chips?: number | null; advancers?: number | null };
    entrants: Entrant[]; sides?: Side[]; matches: EngineMatch[];
  }) => {
    // Sides come from the server. A blind-draw pair cannot be rebuilt from the
    // entrant list, and re-drawing it here would give every viewer different partners.
    const sides: Side[] = data.sides ?? data.entrants.map(e => ({ id: e.id, name: e.name, memberIds: [e.id] }));
    setRemoteId(data.tournament.id);
    setState(v => ({
      ...v,
      formatKey: data.tournament.format,
      name: data.tournament.name,
      raceTo: data.tournament.raceTo,
      prizeNote: data.tournament.prizeNote ?? v.prizeNote,
      rounds: data.tournament.rounds ?? null,
      chips: data.tournament.chips ?? null,
      advancers: data.tournament.advancers ?? null,
      entrants: data.entrants,
      sides,
      matches: data.matches,
    }));
  };

  const loadShared = async (id: string, announce = false) => {
    try {
      const response = await fetch(`/api/tournaments/${id}`);
      if (!response.ok) return false;
      applyServer(await response.json());
      if (announce) toast.success("Board refreshed.");
      return true;
    } catch {
      if (announce) toast.error("Could not reach the league board.");
      return false;
    }
  };

  /**
   * An empty seat is a bye only where no future result can fill it: the opening
   * round of a bracket, or any round of a progressive format. Everywhere else an
   * empty seat means "waiting on a feeder match", and calling that a BYE tells a
   * director someone has advanced when they have not.
   */
  const isBye = (m: EngineMatch) => {
    if (!m.a || m.b) return false;
    if (config.pairing === "swiss" || config.pairing === "chip") return true;
    if (config.pairing === "double") return (m.bracket ?? "w") === "w" && m.round === 0;
    if (config.pairing === "rr-playoff") return m.phase === "playoff" ? m.round === 0 : true;
    return m.round === 0;
  };

  useEffect(() => {
    let cancelled = false;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { try { setState({ ...empty, ...JSON.parse(saved) }); } catch {} }
    (async () => {
      const owner = await fetch("/api/auth/me")
        .then(r => (r.ok ? r.json() : null)).then(d => d?.user?.role === "owner").catch(() => false);
      if (!cancelled) setIsOwner(Boolean(owner));
      try {
        const list = await fetch("/api/tournaments").then(r => r.json());
        // Prefer the event still in progress; a finished one should not pull the
        // director back onto last week's board.
        const running = list?.tournaments?.find((t: { status?: string }) => t.status !== "complete");
        const latest = running ?? list?.tournaments?.[0];
        if (!cancelled && latest?.id) {
          const full = await fetch(`/api/tournaments/${latest.id}`).then(r => (r.ok ? r.json() : null));
          if (!cancelled && full?.tournament) applyServer(full);
        }
      } catch { /* stay on the local copy */ }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (loaded && !shared) localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state, loaded, shared]);

  const nameOf = useMemo(() => {
    const map = new Map(state.sides.map(s => [s.id, s.name]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : null);
  }, [state.sides]);

  const table = useMemo(() => standings(config, state.sides, state.matches), [config, state.sides, state.matches]);
  const chips = useMemo(
    () => (config.pairing === "chip" ? chipCounts(config, state.sides, state.matches) : null),
    [config, state.sides, state.matches]);
  const championName = useMemo(() => {
    const id = champion(config, state.sides, state.matches);
    return id ? nameOf(id) : null;
  }, [config, state.sides, state.matches, nameOf]);

  const isBracket = config.pairing === "single" || config.pairing === "double" || config.pairing === "rr-playoff";
  const isProgressive = config.pairing === "swiss" || config.pairing === "chip";

  const groups = useMemo(() => {
    const ms = state.matches;
    if (ms.length === 0) return [] as { label: string; matches: EngineMatch[] }[];
    if (config.pairing === "double") {
      const label = (b?: string, r?: number) => b === "gf" ? "Grand final" : b === "l" ? `Losers ${(r ?? 0) + 1}` : `Winners ${(r ?? 0) + 1}`;
      const keys = [...new Set(ms.map(m => `${m.bracket ?? "w"}|${m.round}`))];
      return keys.map(k => {
        const [b, r] = k.split("|");
        return { label: label(b, Number(r)), matches: ms.filter(m => (m.bracket ?? "w") === b && m.round === Number(r)).sort((x, y) => x.slot - y.slot) };
      });
    }
    if (config.pairing === "roundrobin") return [{ label: "All matches", matches: ms }];
    if (config.pairing === "rr-playoff") {
      const group = ms.filter(m => m.phase !== "playoff");
      const playoff = ms.filter(m => m.phase === "playoff");
      const out = [{ label: "Group stage", matches: group }];
      const maxR = playoff.length ? Math.max(...playoff.map(m => m.round)) : -1;
      for (let r = 0; r <= maxR; r++) out.push({ label: r === maxR ? "Playoff final" : `Playoff round ${r + 1}`, matches: playoff.filter(m => m.round === r) });
      return out;
    }
    const maxR = Math.max(...ms.map(m => m.round));
    if (config.pairing === "single") {
      // Knockout rounds read by what they are, not by number.
      const total = maxR + 1;
      const knockoutLabel = (r: number) =>
        r === total - 1 ? "Final" : r === total - 2 ? "Semifinals" : r === total - 3 ? "Quarterfinals" : `Round ${r + 1}`;
      return Array.from({ length: total }, (_, r) => ({
        label: knockoutLabel(r),
        matches: ms.filter(m => m.round === r).sort((x, y) => x.slot - y.slot),
      }));
    }
    return Array.from({ length: maxR + 1 }, (_, r) => ({
      label: config.pairing === "chip" ? `Round ${r + 1}` : `Round ${r + 1} of ${swissRoundCount(config, state.sides.length)}`,
      matches: ms.filter(m => m.round === r).sort((x, y) => x.slot - y.slot),
    }));
  }, [state.matches, state.sides.length, config]);

  const pendingRound = useMemo(() => {
    if (!isProgressive || !started) return false;
    const maxR = Math.max(...state.matches.map(m => m.round));
    return roundComplete(state.matches, maxR) && nextRound(config, state.sides, state.matches).length > 0;
  }, [isProgressive, started, state.matches, state.sides, config]);

  const guard = () => {
    if (canEdit) return true;
    toast.error("Only the league owner can change a shared tournament.");
    return false;
  };
  const lockedForEntrants = () => {
    if (!started) return false;
    toast.error("Clear the draw before changing entrants.");
    return true;
  };

  const addEntrant = () => {
    if (!guard() || lockedForEntrants()) return;
    const name = entrantName.trim();
    if (!name) { toast.error("Enter a player or team name."); return; }
    if (state.entrants.some(e => e.name.toLowerCase() === name.toLowerCase())) { toast.error(`${name} is already entered.`); return; }
    setState(v => ({ ...v, entrants: [...v.entrants, { id: `e-${Date.now()}-${v.entrants.length}`, name }] }));
    setEntrantName("");
  };

  const removeEntrant = (id: string) => {
    if (!guard() || lockedForEntrants()) return;
    setState(v => ({ ...v, entrants: v.entrants.filter(e => e.id !== id) }));
  };

  const reorderRandom = () => {
    if (!guard() || lockedForEntrants()) return;
    setState(v => {
      const list = [...v.entrants];
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      return { ...v, entrants: list };
    });
    toast.success("Entrants reseeded.");
  };

  const loadDemoTournament = () => {
    const demoEntrants = [
      { id: "e-demo-1", name: "Marcus Ray" },
      { id: "e-demo-2", name: "Jake Torres" },
      { id: "e-demo-3", name: "Carlos Vance" },
      { id: "e-demo-4", name: "Elena Ramos" },
      { id: "e-demo-5", name: "Devon Miller" },
      { id: "e-demo-6", name: "Toby Morales" },
      { id: "e-demo-7", name: "Brad Becker" },
      { id: "e-demo-8", name: "Samira Patel" },
    ];
    const sides = buildSides(config, demoEntrants);
    const matches = initialMatches(config, sides);
    const withScores = resolve(config, matches.map((m, idx) => idx === 0 ? { ...m, winner: m.a } : idx === 1 ? { ...m, winner: m.b } : m));
    setState(v => ({
      ...v,
      name: "Tuesday 8-Ball Shootout",
      prizeNote: "$200 Bar Tab + Trophy to 1st Place",
      entrants: demoEntrants,
      sides,
      matches: withScores,
    }));
    toast.success("Loaded 8-player demo tournament with active bracket!");
  };

  const generate = async (force = false) => {
    if (!guard()) return;
    const min = config.teamSize === 2 ? 4 : 2;
    if (state.entrants.length < min) { toast.error(`Add at least ${min} entrants for ${config.barName}.`); return; }
    if (shared && remoteId) {
      setBusy(true);
      try {
        const response = await fetch(`/api/tournaments/${remoteId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: state.name, format: state.formatKey, raceTo: state.raceTo, prizeNote: state.prizeNote, rounds: state.rounds, chips: state.chips, advancers: state.advancers, entrants: state.entrants.map(e => ({ name: e.name })), force }),
        });
        const data = await response.json();
        if (response.status === 409 && data?.needsConfirmation) {
          // Rebuilding would erase results someone already played for. Ask first.
          setConfirmRebuild({ message: data.error });
          return;
        }
        if (!response.ok) { toast.error(data?.error ?? "Could not save the draw."); return; }
        setConfirmRebuild(null);
        applyServer(data);
        toast.success("Draw generated for the league.");
      } catch { toast.error("Could not reach the league board."); }
      finally { setBusy(false); }
      return;
    }
    const sides = buildSides(config, state.entrants);
    const matches = resolve(config, initialMatches(config, sides));
    setState(v => ({ ...v, sides, matches }));
    toast.success(config.teamSize === 2 ? "Partners drawn and bracket built." : `${config.barName} started.`);
  };

  const clear = () => {
    if (!guard()) return;
    setState(v => ({ ...v, sides: [], matches: [] }));
    toast.success("Draw cleared. Entrants kept.");
  };

  const pickWinner = async (matchId: string, winner: string) => {
    if (!guard()) return;
    const current = state.matches.find(m => m.id === matchId);
    const next = current?.winner === winner ? null : winner;

    if (shared && remoteId) {
      setBusy(true);
      try {
        const response = await fetch(`/api/tournaments/${remoteId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchKey: matchId, winner: next }),
        });
        const data = await response.json();
        if (!response.ok) toast.error(data?.error ?? "Could not record the result.");
        else applyServer(data);
      } catch { toast.error("Could not reach the league board."); }
      finally { setBusy(false); }
      return;
    }

    setState(v => ({ ...v, matches: resolve(config, v.matches.map(m => (m.id === matchId ? { ...m, winner: next } : m))) }));
  };

  const advanceRound = async () => {
    if (!guard()) return;
    if (shared && remoteId) {
      setBusy(true);
      try {
        const response = await fetch(`/api/tournaments/${remoteId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "next-round" }),
        });
        const data = await response.json();
        if (!response.ok) { toast.error(data?.error ?? "Could not pair the next round."); return; }
        applyServer(data);
        toast.success("Next round paired for the league.");
      } catch { toast.error("Could not reach the league board."); }
      finally { setBusy(false); }
      return;
    }
    const added = nextRound(config, state.sides, state.matches);
    if (added.length === 0) { toast.info("Nothing left to pair."); return; }
    setState(v => ({ ...v, matches: [...v.matches, ...added] }));
    toast.success("Next round paired.");
  };

  const publish = async () => {
    if (!isOwner) { toast.error("Only the league owner can publish a tournament."); return; }
    setBusy(true);
    try {
      const created = await fetch("/api/tournaments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: state.name, format: state.formatKey, raceTo: state.raceTo, prizeNote: state.prizeNote, rounds: state.rounds, chips: state.chips, advancers: state.advancers }),
      }).then(r => r.json());
      if (!created?.tournament?.id) { toast.error(created?.error ?? "Could not publish."); return; }
      const saved = await fetch(`/api/tournaments/${created.tournament.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: state.name, format: state.formatKey, raceTo: state.raceTo, prizeNote: state.prizeNote, rounds: state.rounds, chips: state.chips, advancers: state.advancers, entrants: state.entrants.map(e => ({ name: e.name })) }),
      });
      const savedData = await saved.json();
      if (!saved.ok) { toast.error(savedData?.error ?? "Could not publish the draw."); return; }
      applyServer(savedData);
      toast.success("Tournament published to the league.");
    } catch {
      toast.error("Could not reach the league board.");
    } finally { setBusy(false); }
  };

  const locked = !canEdit || busy;
  const minEntrants = config.teamSize === 2 ? 4 : 2;

  return <div className="tournament-desk">
    <div className="toolbar">
      <div><p className="eyebrow"><Trophy /> TOURNAMENT DESK</p><h2>Run the room</h2></div>
      <div className="tourney-toolbar-actions">
        <span className={`sync-pill ${shared ? "live" : ""}`}>{shared ? <Cloud /> : <CloudOff />}{shared ? "Shared" : "This device"}</span>
        {!started && canEdit && (
          <button className="quiet-button" onClick={loadDemoTournament} title="Load pre-built 8-player tournament bracket">
            <Sparkles size={14}/> Demo bracket
          </button>
        )}
        {!shared && isOwner && started &&
          <button className="quiet-button" disabled={busy} onClick={publish}><Cloud /> Publish to league</button>}
        <a className="quiet-button" href="/tv" target="_blank" rel="noreferrer"><Tv /> Bar screen</a>
        {shared && <button className="quiet-button" disabled={busy} onClick={() => remoteId && loadShared(remoteId, true)}><RefreshCw /> Refresh</button>}
        {started && canEdit && <button className="quiet-button" onClick={clear}><RotateCcw /> Clear draw</button>}
      </div>
    </div>

    {shared && !isOwner && <p className="tourney-readonly">You&apos;re watching the league board. The tournament director records results.</p>}

    <section className="format-picker">
      <p className="eyebrow">FORMAT</p>
      <div className="format-cards">
        {FORMATS.map(f => <button
          key={f.key}
          className={`format-card ${state.formatKey === f.key ? "active" : ""}`}
          disabled={locked || started}
          onClick={() => setState(v => ({ ...v, formatKey: f.key, rounds: null, chips: null, advancers: null }))}
        >
          <strong>{f.barName}</strong>
          <span className={f.eliminates ? "tag-out" : "tag-in"}>{f.eliminates ? "Players go home" : "Nobody eliminated"}</span>
          <small>{f.blurb}</small>
        </button>)}
      </div>
    </section>

    <section className="tourney-setup">
      <label>Event name<input value={state.name} disabled={locked} onChange={e => setState(v => ({ ...v, name: e.target.value }))} placeholder="Tuesday night" /></label>
      <label>Race to<input type="number" min="1" max="50" disabled={locked} value={state.raceTo} onChange={e => setState(v => ({ ...v, raceTo: Math.max(1, Number(e.target.value) || 1) }))} /></label>
      {config.pairing === "swiss" && <label>Rounds<input type="number" min="1" max="20" disabled={locked || started}
        value={state.rounds ?? swissRoundCount(config, Math.max(state.entrants.length, 2))}
        onChange={e => setState(v => ({ ...v, rounds: Math.max(1, Number(e.target.value) || 1) }))} /></label>}
      {config.pairing === "chip" && <label>Chips each<input type="number" min="1" max="20" disabled={locked || started}
        value={state.chips ?? config.chips ?? 3}
        onChange={e => setState(v => ({ ...v, chips: Math.max(1, Number(e.target.value) || 1) }))} /></label>}
      {config.pairing === "rr-playoff" && <label>Advance to playoff<input type="number" min="2" max="64" disabled={locked || started}
        value={state.advancers ?? config.advancers ?? 4}
        onChange={e => setState(v => ({ ...v, advancers: Math.max(2, Number(e.target.value) || 2) }))} /></label>}
    </section>

    <label className="prize-note">Prize (awarded by the venue)
      <input value={state.prizeNote} disabled={locked} maxLength={280}
        onChange={e => setState(v => ({ ...v, prizeNote: e.target.value }))}
        placeholder="e.g. bar tab for the winner — the venue decides and awards this" />
      <small>Free text the venue owns. Action Line-Up never calculates or handles prize money.</small>
    </label>

    <div className="tourney-grid">
      <section className="tourney-entrants">
        <div className="data-title"><div><p className="eyebrow">ENTRANTS</p><h3>Who&apos;s playing</h3></div><span>{state.entrants.length} in</span></div>
        {canEdit && !started && <div className="entrant-add">
          <input value={entrantName} onChange={e => setEntrantName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addEntrant(); }} placeholder="Player name" />
          <button onClick={addEntrant}><Plus /> Add</button>
        </div>}
        {state.entrants.length === 0
          ? <p className="leaderboard-empty">Nobody entered yet.</p>
          : <ol className="entrant-list">{state.entrants.map((e, i) => <li key={e.id}><span>{i + 1}</span><strong>{e.name}</strong>
              {canEdit && !started && <button aria-label={`Remove ${e.name}`} onClick={() => removeEntrant(e.id)}><UserX /></button>}</li>)}</ol>}
        {canEdit && !started && <div className="entrant-actions">
          <button className="quiet-button" onClick={reorderRandom} disabled={state.entrants.length < 2}><Shuffle /> Reseed</button>
          <button className="generate-button" onClick={() => { void generate(false); }} disabled={busy || state.entrants.length < minEntrants}>Start {config.barName}</button>
        </div>}

        {config.teamSize === 2 && state.sides.length > 0 && <div className="drawn-teams">
          <p className="eyebrow"><Users /> DRAWN TEAMS</p>
          {state.sides.map(s => <div key={s.id}>{s.name}</div>)}
        </div>}

        {(config.pairing === "swiss" || config.pairing === "chip" || config.pairing === "roundrobin" || config.pairing === "rr-playoff") && table.length > 0 && <div className="tourney-standings">
          <div className="standing-head"><span>RK</span><span>{config.teamSize === 2 ? "TEAM" : "PLAYER"}</span>{chips ? <span>CHIPS</span> : <span>W</span>}<span>{chips ? "W" : "L"}</span></div>
          {table.map((s, i) => <div className={`standing-row ${chips && (s.chips ?? 0) === 0 ? "busted" : ""}`} key={s.id}>
            <span className={i < 3 ? `rank rank-${i + 1}` : "rank"}>{i + 1}</span><strong>{s.name}</strong>
            {chips ? <b>{s.chips}</b> : <b>{s.wins}</b>}<span>{chips ? s.wins : s.losses}</span>
          </div>)}
        </div>}
      </section>

      <section className="tourney-board">
        {confirmRebuild && <div className="rebuild-warning">
          <div><strong>Rebuild the draw?</strong><p>{confirmRebuild.message}</p></div>
          <div>
            <button className="quiet-button" onClick={() => setConfirmRebuild(null)}>Keep results</button>
            <button className="danger-button" disabled={busy} onClick={() => { void generate(true); }}>Erase and rebuild</button>
          </div>
        </div>}
        {championName && <div className="champion-banner"><Crown /><div><span>WINNER</span><strong>{championName}</strong></div></div>}
        {pendingRound && canEdit && <button className="next-round" disabled={busy} onClick={() => { void advanceRound(); }}><RefreshCw /> Pair the next round</button>}

        {!started
          ? <p className="leaderboard-empty">Pick a format, add players, and start. {config.blurb}</p>
          : <div className="bracket-scroll"><div className={isBracket ? "bracket-rounds" : "round-list"}>
              {groups.map((g, i) => <div className="bracket-round" key={`${g.label}-${i}`}>
                <h4>{g.label}</h4>
                {g.matches.map(m => <div className={`bracket-match ${m.winner ? "decided" : ""}`} key={m.id}>
                  <button className={m.winner === m.a ? "won" : ""} disabled={!m.a || !m.b || locked} onClick={() => m.a && pickWinner(m.id, m.a)}>{nameOf(m.a) ?? <em>TBD</em>}</button>
                  <span>race to {state.raceTo}</span>
                  <button className={m.winner === m.b ? "won" : ""} disabled={!m.a || !m.b || locked} onClick={() => m.b && pickWinner(m.id, m.b)}>
                    {nameOf(m.b) ?? (isBye(m) ? <em>{config.pairing === "swiss" ? "BYE — sits this round" : "BYE"}</em> : <em>TBD</em>)}
                  </button>
                </div>)}
              </div>)}
            </div></div>}
      </section>
    </div>
    <p className="forecast-note"><Trophy /> Tap a name to set the winner. Tap again to undo.{isProgressive && " Pair the next round once every table reports."}{config.pairing === "chip" && " Chips are a score only — they carry no cash value."}</p>
  </div>;
}
