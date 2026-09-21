-- Action Line-Up: shared tournaments and lineups.
-- Run once in the Supabase SQL editor, like the earlier migrations.
--
-- Everything here is written so a bracket or a lineup lives on the server
-- instead of in one browser's localStorage, which is what kept a director's
-- phone and a player's phone from ever seeing the same event.

-- ---------------------------------------------------------------- captains
-- Writes need to be narrower than "any signed-in player" but wider than
-- "owner only", or captains cannot set their own lineup. This is the missing
-- middle role.
create table if not exists public.league_captains (
  id uuid primary key default gen_random_uuid(),
  league_key text not null default 'seguin-8ball',
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team_name text not null check (char_length(team_name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (league_key, profile_id, team_name)
);

create index if not exists league_captains_lookup_idx
  on public.league_captains (league_key, profile_id);

-- ------------------------------------------------------------ tournaments
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  league_key text not null default 'seguin-8ball',
  name text not null default '' check (char_length(name) <= 120),
  format text not null default 'single' check (format in ('single','roundrobin')),
  race_to integer not null default 5 check (race_to between 1 and 50),
  status text not null default 'setup' check (status in ('setup','live','complete')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournaments_feed_idx
  on public.tournaments (league_key, created_at desc);

create table if not exists public.tournament_entrants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  seed integer not null check (seed >= 0),
  created_at timestamptz not null default now(),
  unique (tournament_id, seed)
);

create index if not exists tournament_entrants_lookup_idx
  on public.tournament_entrants (tournament_id, seed);

-- Only round-zero pairings and recorded winners are stored. Later rounds are
-- derived on read by lib/bracket.ts, so a corrected early result cannot leave
-- a stale name sitting in a later round.
create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_key text not null,
  round integer not null check (round >= 0),
  slot integer not null check (slot >= 0),
  entrant_a uuid references public.tournament_entrants(id) on delete cascade,
  entrant_b uuid references public.tournament_entrants(id) on delete cascade,
  winner uuid references public.tournament_entrants(id) on delete set null,
  score_a integer check (score_a is null or score_a >= 0),
  score_b integer check (score_b is null or score_b >= 0),
  updated_at timestamptz not null default now(),
  unique (tournament_id, match_key)
);

create index if not exists tournament_matches_lookup_idx
  on public.tournament_matches (tournament_id, round, slot);

-- A winner must be one of the two entrants in that match.
alter table public.tournament_matches drop constraint if exists tournament_matches_winner_is_participant;
alter table public.tournament_matches add constraint tournament_matches_winner_is_participant
  check (winner is null or winner = entrant_a or winner = entrant_b);

-- --------------------------------------------------------------- lineups
create table if not exists public.lineups (
  id uuid primary key default gen_random_uuid(),
  league_key text not null default 'seguin-8ball',
  home_team text not null default '' check (char_length(home_team) <= 80),
  away_team text not null default '' check (char_length(away_team) <= 80),
  match_date date,
  match_time text check (match_time is null or char_length(match_time) <= 40),
  venue text check (venue is null or char_length(venue) <= 160),
  scoring jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lineups_feed_idx
  on public.lineups (league_key, match_date desc nulls last, created_at desc);

create table if not exists public.lineup_players (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.lineups(id) on delete cascade,
  side text not null check (side in ('home','away')),
  position integer not null check (position between 0 and 7),
  name text not null default '' check (char_length(name) <= 80),
  role text not null default 'Player' check (char_length(role) <= 40),
  payment text not null default 'due' check (payment in ('paid','due','pending')),
  active boolean not null default true,
  unique (lineup_id, side, position)
);

create index if not exists lineup_players_lookup_idx
  on public.lineup_players (lineup_id, side, position);

create table if not exists public.lineup_results (
  lineup_id uuid not null references public.lineups(id) on delete cascade,
  game_key text not null check (char_length(game_key) <= 20),
  winner text not null check (winner in ('home','away')),
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  primary key (lineup_id, game_key)
);

-- --------------------------------------------------- row level security
-- The API routes use the service role and enforce permissions in the handler,
-- matching the existing announcements and rulebooks routes. These policies are
-- the second line of defence for anything reaching the tables with the anon key.
alter table public.league_captains enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_entrants enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.lineups enable row level security;
alter table public.lineup_players enable row level security;
alter table public.lineup_results enable row level security;

-- Standings, brackets and lineups are meant to be publicly readable: that is
-- the point of sharing a link to them. Writes go through the API only.
drop policy if exists "public can read tournaments" on public.tournaments;
create policy "public can read tournaments" on public.tournaments for select using (true);

drop policy if exists "public can read tournament entrants" on public.tournament_entrants;
create policy "public can read tournament entrants" on public.tournament_entrants for select using (true);

drop policy if exists "public can read tournament matches" on public.tournament_matches;
create policy "public can read tournament matches" on public.tournament_matches for select using (true);

drop policy if exists "public can read lineups" on public.lineups;
create policy "public can read lineups" on public.lineups for select using (true);

drop policy if exists "public can read lineup players" on public.lineup_players;
create policy "public can read lineup players" on public.lineup_players for select using (true);

drop policy if exists "public can read lineup results" on public.lineup_results;
create policy "public can read lineup results" on public.lineup_results for select using (true);

-- Captain rows are not public: they map a real person to a team.
drop policy if exists "captains can read own captaincy" on public.league_captains;
create policy "captains can read own captaincy" on public.league_captains
  for select using (auth.uid() = profile_id);

-- Keep updated_at honest on edits.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tournaments_touch_updated_at on public.tournaments;
create trigger tournaments_touch_updated_at before update on public.tournaments
  for each row execute function public.touch_updated_at();

drop trigger if exists tournament_matches_touch_updated_at on public.tournament_matches;
create trigger tournament_matches_touch_updated_at before update on public.tournament_matches
  for each row execute function public.touch_updated_at();

drop trigger if exists lineups_touch_updated_at on public.lineups;
create trigger lineups_touch_updated_at before update on public.lineups
  for each row execute function public.touch_updated_at();
