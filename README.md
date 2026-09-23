# Action Line-Up 🎱

**Action Line-Up** is a modern, responsive web application and digital scoresheet designed for competitive amateur and commercial pool & billiards leagues (8-Ball, 9-Ball, 10-Ball) and tournament directors. It eliminates paper scoresheets, disputes, and delayed standings with real-time roster rotations, dual-captain verification, dispute escalation, and bar TV kiosk displays.

---

## ⚡ Key Capabilities

### 1. Multi-Role Authentication & Access Control
- **League Owner / Tournament Director**: Access the Owner Command Center to configure leagues, review captain-reported disputes, publish announcements, manage fees, and monitor active matches.
- **Team Captain**: Draft and submit blind lineups, conduct live match scoring rack-by-rack, confirm dual-captain results, or file structured dispute tickets.
- **League Player**: View personal stats, team standings, weekly schedules, and verified match scorecards.

### 2. Live Match Lineup & Blind Rotation Manager
- Automatic blind round-robin rotation for 5-player rosters (Rounds 1–5).
- Live rack scoring with defense tracking and break-and-run indicators.
- One-click **Demo Match** loader for rapid demonstration and testing.

### 3. Dual-Captain Verification & Dispute Resolution
- **Sync & Confirm**: Both Home and Away captains must independently verify and submit their scoresheet before final official submission.
- **Dispute Escalation**: If captains disagree on ball count or handicap rules, either captain can submit a dispute with detailed notes directly to the Owner's review queue.
- **Owner Review Queue**: League Owners can view open disputes in real time and mark them resolved with audit notes.

### 4. Bar TV / Tournament Desk Kiosk (`/tv`)
- High-contrast, large-format dark-mode scoreboard built for wall-mounted TV monitors in pool halls and sports bars.
- Displays live table assignments, active racks, team race progress, and upcoming matchups.

### 5. Deterministic Bracket & Tournament Engine
- Production-grade tournament scheduler supporting:
  - Single Elimination
  - Double Elimination (with true winner-take-all finals)
  - Round Robin and Swiss formats
- Validated with **233 automated test suites** guaranteeing bracket integrity and seed placement.

### 6. Public League Hub
- Live public standings with win/loss records, rack differentials, and point totals.
- Weekly match schedules and venue directions.
- Player performance leaderboards.

---

## 🛠️ Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Server Components & Route Handlers)
- **Frontend**: React 19, Tailwind CSS v4, Lucide React icons
- **Typography**: Google Font [Inter](https://fonts.google.com/specimen/Inter)
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL with Row-Level Security)
- **Testing**: Node.js test runner (`node --experimental-strip-types`)

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js `>=22.13.0`
- npm `>=10.0.0`
- A free [Supabase](https://supabase.com) project

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/frelixnero/actionLineUp.git
cd actionLineUp
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. Database Setup
Run the single-run consolidated presentation migration in your Supabase SQL Editor:
- Navigate to your Supabase Dashboard -> **SQL Editor**.
- Open and execute the SQL file:
  ```
  supabase/migrations/20260921_presentation_baseline.sql
  ```
This script creates all necessary tables (`profiles`, `leagues`, `league_settings`, `league_captains`, `lineups`, `tournaments`, `league_announcements`, `league_issues`) along with automatic profile triggers and sample league data.

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing

Run the automated tournament engine and bracket test suite:
```bash
npm test
```
All **233 unit tests** should pass cleanly:
```text
48 passed, 0 failed   (tests/bracket.test.mjs)
185 passed, 0 failed  (tests/formats.test.mjs)
```

---

## 🎬 48-Hour Presentation / Demo Script

Use this sequence to deliver a compelling live demonstration:

1. **The Problem**: Pool leagues still use paper scoresheets, leading to arithmetic errors, late standings, and heated captain arguments at the bar.
2. **Landing Page & Branding**:
   - Open [http://localhost:3000](http://localhost:3000).
   - Show the refined dark-mode UI with **Inter** typography and lime accents.
3. **Authentication**:
   - Click **Sign In / Join**.
   - Create a new account with a username and password. Notice the instant session creation and topbar user status badge showing your handle and role badge.
4. **Live Lineup & Match Scoring**:
   - In the Lineup tab, click the **"⚡ Demo Match"** button to load a realistic Seguin 8-Ball match (Seguin Cue Club vs Guadalupe Break).
   - Demonstrate the blind 5-round rotation grid.
   - Adjust scores and mark a Defense / Break & Run rack.
5. **Dual-Captain Verification**:
   - Open the **Review / Submit** drawer or tab.
   - Show the Home Captain and Away Captain confirmation toggles.
   - Demonstrate submitting a dispute note (e.g. *"Dispute on Table 3 rack 4 ball count"*).
6. **Owner Command Center**:
   - Switch to **Owner Mode** (or sign in as an owner).
   - Open the **Disputes & Issues** queue to show the captain's dispute ticket immediately visible for resolution.
   - Mark the issue resolved with a resolution note.
7. **Bar TV / Tournament Kiosk**:
   - Navigate to [http://localhost:3000/tv](http://localhost:3000/tv).
   - Showcase the large-screen display designed for TVs mounted above pool tables in venues.
8. **Public League Hub**:
   - Navigate to [http://localhost:3000/standings](http://localhost:3000/standings) and [http://localhost:3000/schedule](http://localhost:3000/schedule) to show public standings and upcoming matches.
