-- Action Line-Up beta foundation. Run once in the Supabase SQL editor.
alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_email_unique on public.profiles (lower(email)) where email is not null;

create table if not exists public.league_settings (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  score_format text not null default 'Games won',
  games_per_match integer not null default 20 check (games_per_match between 1 and 100),
  match_win_at integer not null default 11 check (match_win_at between 1 and 100),
  player_fee_cents integer not null default 1000 check (player_fee_cents >= 0),
  season_months integer not null default 6 check (season_months between 1 and 12),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  tier text not null check (tier in ('free','basic','premium')) default 'free',
  status text not null check (status in ('active','past_due','canceled','trial')) default 'active',
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  unique(profile_id, league_id)
);

create table if not exists public.market_listings (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  price_cents integer not null check (price_cents >= 0),
  note text,
  status text not null default 'active' check (status in ('active','sold','removed')),
  created_at timestamptz not null default now()
);

create table if not exists public.score_sheets (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  submitted_by uuid not null references public.profiles(id),
  home_score integer not null default 0 check (home_score >= 0),
  away_score integer not null default 0 check (away_score >= 0),
  home_confirmed_at timestamptz,
  away_confirmed_at timestamptz,
  image_path text,
  status text not null default 'draft' check (status in ('draft','submitted','confirmed','disputed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  league_id uuid references public.leagues(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.league_settings enable row level security;
alter table public.memberships enable row level security;
alter table public.market_listings enable row level security;
alter table public.score_sheets enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "public can read league settings" on public.league_settings;
create policy "public can read league settings" on public.league_settings for select using (true);
drop policy if exists "members can read own memberships" on public.memberships;
create policy "members can read own memberships" on public.memberships for select using (auth.uid() = profile_id);
drop policy if exists "public can read active listings" on public.market_listings;
create policy "public can read active listings" on public.market_listings for select using (status = 'active');
drop policy if exists "sellers can create own listings" on public.market_listings;
create policy "sellers can create own listings" on public.market_listings for insert with check (auth.uid() = seller_id);
drop policy if exists "sellers can update own listings" on public.market_listings;
create policy "sellers can update own listings" on public.market_listings for update using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and (p.email is null or p.email like '%.user@actionlineup.local');
