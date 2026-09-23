import type { Metadata } from "next";
import { Inter } from "next/font/google";
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

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Action Line-Up",
  description: "Automatic league lineups, live scoring, payments and fundraising in one place.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
