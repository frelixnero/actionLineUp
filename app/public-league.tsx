import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardList, Trophy, Users } from "lucide-react";

export const standings: (readonly [string, string, number, number])[] = [
  ["American", "Seguin Cue Club", 14, 4],
  ["American", "Guadalupe Break", 12, 6],
  ["American", "8-Ball Assassins", 11, 7],
  ["American", "Corner Pocket Crew", 9, 9],
  ["National", "Rack 'Em Rollers", 13, 5],
  ["National", "Billiards & Brews", 10, 8],
  ["National", "Diamond Cutters", 8, 10],
  ["National", "Rail Masters", 5, 13],
];

export const schedule: (readonly [string, string, string, string])[] = [
  ["Tue Sep 22", "7:30 PM", "Seguin Cue Club", "Guadalupe Break"],
  ["Tue Sep 22", "7:30 PM", "8-Ball Assassins", "Corner Pocket Crew"],
  ["Thu Sep 24", "7:30 PM", "Rack 'Em Rollers", "Billiards & Brews"],
  ["Thu Sep 24", "7:30 PM", "Diamond Cutters", "Rail Masters"],
];

export function PublicHeader({ current }: { current: "standings" | "schedule" | "rules" }) {
  return <header className="public-topbar"><Link href="/" className="public-brand"><span><Trophy /></span><b>ACTION LINE-UP</b></Link><nav aria-label="Public league navigation"><Link className={current === "standings" ? "active" : ""} href="/standings">Standings</Link><Link className={current === "schedule" ? "active" : ""} href="/schedule">Schedule</Link><Link className={current === "rules" ? "active" : ""} href="/rules">Rules</Link></nav><Link className="public-signin" href="/">Sign in <ChevronRight /></Link></header>;
}

export function PublicLead({ title, text, icon }: { title: string; text: string; icon: "standings" | "schedule" | "rules" }) {
  const Icon = icon === "standings" ? Trophy : icon === "schedule" ? CalendarDays : ClipboardList;
  return <section className="public-lead"><div><p>SEGUIN 8BALL LEAGUE</p><h1>{title}</h1><span>{text}</span></div><Icon /></section>;
}

export function ClaimBanner() {
  return <aside className="claim-banner"><Users /><div><strong>See your team? Claim your player account.</strong><p>Create your player account to follow matches, scores, and league updates.</p></div><Link href="/">Claim your spot <ChevronRight /></Link></aside>;
}
