-- ============================================================================
-- ACTION LINE-UP: CONSOLIDATED PRESENTATION BASELINE SCHEMA
-- Run this script once in the Supabase SQL Editor for a fresh deployment.
-- ============================================================================

-- 1. UTILITY FUNCTIONS
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 2. USER PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text,
  role text not null default 'player' check (role in ('owner', 'player')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles (lower(username));
create unique index if not exists profiles_email_unique on public.profiles (lower(email)) where email is not null;

-- Auto-sync auth.users to profiles on new signup
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, username, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    'player'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. LEAGUES & LEAGUE SETTINGS
create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  key text unique not null default 'seguin-8ball',
  name text not null default 'Seguin 8Ball League',
  created_at timestamptz not null default now()
);

insert into public.leagues (key, name)
values ('seguin-8ball', 'Seguin 8Ball League')
on conflict (key) do nothing;

create table if not exists public.league_settings (
  league_key text primary key default 'seguin-8ball',
  score_format text not null default 'Games won',
  games_per_match integer not null default 20 check (games_per_match between 1 and 100),
  match_win_at integer not null default 11 check (match_win_at between 1 and 100),
  player_fee_cents integer not null default 1000 check (player_fee_cents >= 0),
  season_months integer not null default 6 check (season_months between 1 and 12),
  updated_at timestamptz not null default now()
);

insert into public.league_settings (league_key)
values ('seguin-8ball')
on conflict (league_key) do nothing;

-- 4. LEAGUE CAPTAINS
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

-- 5. MATCH LINEUPS & ROSTERS
create table if not exists public.lineups (
  id uuid primary key default gen_random_uuid(),
  league_key text not null default 'seguin-8ball',
  home_team text not null default '' check (char_length(home_team) <= 80),
  away_team text not null default '' check (char_length(away_team) <= 80),
  match_date date,
  match_time text check (match_time is null or char_length(match_time) <= 40),
  venue text check (venue is null or char_length(venue) <= 160),
  scoring jsonb not null default '{}'::jsonb,
  home_confirmed boolean not null default false,
  away_confirmed boolean not null default false,
  submitted_at timestamptz,
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
  name text not null check (char_length(name) <= 80),
  role text not null default 'Player' check (char_length(role) <= 40),
  payment text not null default 'due' check (payment in ('paid','due','pending')),
  active boolean not null default true,
  unique (lineup_id, side, position)
);

create table if not exists public.lineup_results (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.lineups(id) on delete cascade,
  game_key text not null check (char_length(game_key) <= 20),
  winner text not null check (winner in ('home','away')),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lineup_id, game_key)
);

-- 6. TOURNAMENT ENGINE
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  league_key text not null default 'seguin-8ball',
  name text not null default '' check (char_length(name) <= 120),
  format text not null default 'single'
    check (format in ('single','double','roundrobin','rr-playoff','swiss','chip','blind-draw')),
  race_to integer not null default 5 check (race_to between 1 and 50),
  rounds integer check (rounds is null or rounds between 1 and 20),
  chips integer check (chips is null or chips between 1 and 20),
  advancers integer check (advancers is null or advancers between 2 and 64),
  prize_note text check (prize_note is null or char_length(prize_note) <= 280),
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

create table if not exists public.tournament_sides (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  ordinal integer not null check (ordinal >= 0),
  created_at timestamptz not null default now(),
  unique (tournament_id, ordinal)
);

create table if not exists public.tournament_side_members (
  side_id uuid not null references public.tournament_sides(id) on delete cascade,
  entrant_id uuid not null references public.tournament_entrants(id) on delete cascade,
  primary key (side_id, entrant_id)
);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_key text not null,
  round integer not null check (round >= 0),
  slot integer not null check (slot >= 0),
  side_a uuid references public.tournament_sides(id) on delete cascade,
  side_b uuid references public.tournament_sides(id) on delete cascade,
  winner_side uuid references public.tournament_sides(id) on delete set null,
  score_a integer check (score_a is null or score_a >= 0),
  score_b integer check (score_b is null or score_b >= 0),
  bracket text check (bracket is null or bracket in ('w','l','gf')),
  phase text check (phase is null or phase in ('group','playoff')),
  updated_at timestamptz not null default now(),
  unique (tournament_id, match_key)
);

-- 7. ANNOUNCEMENTS & CAPTAIN DISPUTES
create table if not exists public.league_announcements (
  id uuid primary key default gen_random_uuid(),
  league_key text not null default 'seguin-8ball',
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) <= 1200),
  posted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.league_issues (
  id uuid primary key default gen_random_uuid(),
  league_key text not null default 'seguin-8ball',
  reported_by uuid references public.profiles(id) on delete set null,
  type text not null check (char_length(type) <= 60),
  details text not null check (char_length(details) <= 1500),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists league_issues_feed_idx
  on public.league_issues (league_key, resolved, created_at desc);

-- 8. MEMBERSHIPS & STRIPE BILLING
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  league_key text not null default 'seguin-8ball',
  tier text not null check (tier in ('free','basic','premium')) default 'free',
  status text not null check (status in ('active','past_due','canceled','trial')) default 'active',
  provider text check (provider is null or provider in ('stripe')),
  provider_customer_id text,
  provider_subscription_id text,
  price_id text,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, league_key)
);

create table if not exists public.billing_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- 9. TRIGGERS FOR UPDATED_AT
drop trigger if exists tournaments_touch_updated_at on public.tournaments;
create trigger tournaments_touch_updated_at before update on public.tournaments
  for each row execute function public.touch_updated_at();

drop trigger if exists lineups_touch_updated_at on public.lineups;
create trigger lineups_touch_updated_at before update on public.lineups
  for each row execute function public.touch_updated_at();

drop trigger if exists memberships_touch_updated_at on public.memberships;
create trigger memberships_touch_updated_at before update on public.memberships
  for each row execute function public.touch_updated_at();

-- 10. ROW LEVEL SECURITY (RLS)
alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_settings enable row level security;
alter table public.league_captains enable row level security;
alter table public.lineups enable row level security;
alter table public.lineup_players enable row level security;
alter table public.lineup_results enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_entrants enable row level security;
alter table public.tournament_sides enable row level security;
alter table public.tournament_side_members enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.league_announcements enable row level security;
alter table public.league_issues enable row level security;
alter table public.memberships enable row level security;
alter table public.billing_events enable row level security;

-- Public read access for league display
drop policy if exists "public can read profiles" on public.profiles;
create policy "public can read profiles" on public.profiles for select using (true);

drop policy if exists "public can read leagues" on public.leagues;
create policy "public can read leagues" on public.leagues for select using (true);

drop policy if exists "public can read league settings" on public.league_settings;
create policy "public can read league settings" on public.league_settings for select using (true);

drop policy if exists "public can read captains" on public.league_captains;
create policy "public can read captains" on public.league_captains for select using (true);

drop policy if exists "public can read lineups" on public.lineups;
create policy "public can read lineups" on public.lineups for select using (true);

drop policy if exists "public can read lineup players" on public.lineup_players;
create policy "public can read lineup players" on public.lineup_players for select using (true);

drop policy if exists "public can read lineup results" on public.lineup_results;
create policy "public can read lineup results" on public.lineup_results for select using (true);

drop policy if exists "public can read tournaments" on public.tournaments;
create policy "public can read tournaments" on public.tournaments for select using (true);

drop policy if exists "public can read tournament entrants" on public.tournament_entrants;
create policy "public can read tournament entrants" on public.tournament_entrants for select using (true);

drop policy if exists "public can read tournament sides" on public.tournament_sides;
create policy "public can read tournament sides" on public.tournament_sides for select using (true);

drop policy if exists "public can read tournament side members" on public.tournament_side_members;
create policy "public can read tournament side members" on public.tournament_side_members for select using (true);

drop policy if exists "public can read tournament matches" on public.tournament_matches;
create policy "public can read tournament matches" on public.tournament_matches for select using (true);

drop policy if exists "public can read announcements" on public.league_announcements;
create policy "public can read announcements" on public.league_announcements for select using (true);

drop policy if exists "members can read own memberships" on public.memberships;
create policy "members can read own memberships" on public.memberships for select using (auth.uid() = profile_id);
