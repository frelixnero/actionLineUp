import { ClaimBanner, PublicHeader, PublicLead, schedule } from "../public-league";

export const metadata = { title: "Schedule | Action Line-Up", description: "Seguin 8Ball League schedule." };

export default function SchedulePage() {
  return <main className="public-page"><PublicHeader current="schedule" /><div className="public-wrap"><PublicLead icon="schedule" title="League-night schedule" text="Check your matchup before you head to the table." /><section className="public-card schedule-card"><div className="public-card-head"><h2>Upcoming matchups</h2><span>League night</span></div>{schedule.map(([day, time, home, away]) => <div className="public-match" key={`${home}-${away}`}><span>{day}<b>{time}</b></span><strong>{home}</strong><em>vs</em><strong>{away}</strong></div>)}{schedule.length === 0 && <p className="public-empty">No matches scheduled yet.</p>}</section><ClaimBanner /></div></main>;
}
