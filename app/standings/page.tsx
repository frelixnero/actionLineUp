import { ClaimBanner, PublicHeader, PublicLead, standings } from "../public-league";

export const metadata = { title: "Standings | Action Line-Up", description: "Seguin 8Ball League standings." };

export default function StandingsPage() {
  const divisions = ["American", "National"] as const;
  return <main className="public-page"><PublicHeader current="standings" /><div className="public-wrap"><PublicLead icon="standings" title="League standings" text="Follow the race all season. Updated after league-night scores are entered." /><section className="public-grid">{divisions.map(division => <article className="public-card" key={division}><div className="public-card-head"><h2>{division} League</h2><span>W · L</span></div><div className="standings-list">{standings.filter(team => team[0] === division).map(([_, name, wins, losses], index) => <div className="public-standing" key={name}><b>{index + 1}</b><strong>{name}</strong><span>{wins}</span><span>{losses}</span></div>)}{standings.filter(team => team[0] === division).length === 0 && <p className="public-empty">No teams entered yet.</p>}</div></article>)}</section><ClaimBanner /></div></main>;
}
