import type { Metadata } from "next";
import "./globals.css";
import "./calendar.css";
import "./forecast.css";
import "./scoring.css";
import "./portal.css";
import "./league-directory.css";
import "./apex.css";
import "./mode.css";
import "./tournament.css";
import "./lineup.css";
import "./tv.css";

export const metadata: Metadata = {
  title: "Action Line-Up",
  description: "Automatic league lineups, live scoring, payments and fundraising in one place.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
