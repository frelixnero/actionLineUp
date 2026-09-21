-- Action Line-Up: widen tournaments to the format engine.
-- Run after 20260911_tournaments_and_lineups.sql, in the Supabase SQL editor.
--
-- The first tournaments migration only allowed 'single' and 'roundrobin', and
-- modelled a match as two entrants. The engine works in *sides* (a side is one
-- player, or a drawn doubles team) and needs somewhere to record which half of a
-- double-elimination bracket a match sits in. This migration widens both.
--
-- MONEY: still nothing here models entry fees, pots, buy-ins or payouts. Chip
-- counts are a scoring unit with no cash value and are derived from match
-- results, never stored as a balance. Prize wording stays a venue-entered string.

-- ---------------------------------------------------------------- formats
alter table public.tournaments drop constraint if exists tournaments_format_check;
alter table public.tournaments add constraint tournaments_format_check
  check (format in ('single','double','roundrobin','rr-playoff','swiss','chip','blind-draw'));

-- Format knobs a director can set per event. Defaults match lib/formats.ts.
alter table public.tournaments add column if not exists rounds integer
  check (rounds is null or rounds between 1 and 20);
alter table public.tournaments add column if not exists chips integer
  check (chips is null or chips between 1 and 20);
alter table public.tournaments add column if not exists advancers integer
  check (advancers is null or advancers between 2 and 64);

-- Free text the venue owns. Deliberately not a number, not a schedule, and not
-- tied to entries: the software never computes or holds a payout.
alter table public.tournaments add column if not exists prize_note text
  check (prize_note is null or char_length(prize_note) <= 280);

comment on column public.tournaments.prize_note is
  'Venue-entered prize wording. Awarded by the venue. Never calculated by the app and never tied to entry counts.';

-- ------------------------------------------------------------------ sides
-- A side is whoever stands at the table. For singles it mirrors one entrant;
-- for blind draw doubles it is the drawn pair, which is why matches point at
-- sides rather than at entrants.
create table if not exists public.tournament_sides (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  ordinal integer not null check (ordinal >= 0),
  created_at timestamptz not null default now(),
  unique (tournament_id, ordinal)
);

create index if not exists tournament_sides_lookup_idx
  on public.tournament_sides (tournament_id, ordinal);

create table if not exists public.tournament_side_members (
  side_id uuid not null references public.tournament_sides(id) on delete cascade,
  entrant_id uuid not null references public.tournament_entrants(id) on delete cascade,
  primary key (side_id, entrant_id)
);

-- ---------------------------------------------------------------- matches
-- Which half of a double-elimination bracket, and which stage of a
-- group-then-playoff event, this match belongs to.
alter table public.tournament_matches add column if not exists bracket text
  check (bracket is null or bracket in ('w','l','gf'));
alter table public.tournament_matches add column if not exists phase text
  check (phase is null or phase in ('group','playoff'));

-- Matches now reference sides. The old entrant columns stay for the brackets
-- created before this migration; new rows populate side_a / side_b.
alter table public.tournament_matches add column if not exists side_a uuid
  references public.tournament_sides(id) on delete cascade;
alter table public.tournament_matches add column if not exists side_b uuid
  references public.tournament_sides(id) on delete cascade;
alter table public.tournament_matches add column if not exists winner_side uuid
  references public.tournament_sides(id) on delete set null;

alter table public.tournament_matches drop constraint if exists tournament_matches_winner_side_is_participant;
alter table public.tournament_matches add constraint tournament_matches_winner_side_is_participant
  check (winner_side is null or winner_side = side_a or winner_side = side_b);

create index if not exists tournament_matches_bracket_idx
  on public.tournament_matches (tournament_id, bracket, round, slot);

-- --------------------------------------------------- row level security
alter table public.tournament_sides enable row level security;
alter table public.tournament_side_members enable row level security;

drop policy if exists "public can read tournament sides" on public.tournament_sides;
create policy "public can read tournament sides" on public.tournament_sides for select using (true);

drop policy if exists "public can read tournament side members" on public.tournament_side_members;
create policy "public can read tournament side members" on public.tournament_side_members for select using (true);
