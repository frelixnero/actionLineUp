-- Vegas Mini Madness baseline schema
-- Compatible with existing Action Line-Up public schema.

create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text,
  role text not null default 'player' check (role in ('player', 'captain', 'owner')),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles (lower(username));
create unique index if not exists profiles_email_unique on public.profiles (lower(email)) where email is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, username, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'player')
  )
  on conflict (id) do update set
    username = coalesce(excluded.username, public.profiles.username),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = coalesce(excluded.email, public.profiles.email),
    role = coalesce(excluded.role, public.profiles.role),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.mini_tournaments (
  id uuid primary key default gen_random_uuid(),
  league_key text not null default 'seguin-8ball',
  title text not null check (char_length(title) between 1 and 120),
  day_number integer not null default 1 check (day_number in (1, 2)),
  status text not null default 'registration' check (status in ('registration', 'in_progress', 'completed')),
  race_to integer not null default 2 check (race_to in (1, 2)),
  winner_id uuid references public.profiles(id) on delete set null,
  runner_up_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mini_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.mini_tournaments(id) on delete cascade,
  round_number integer not null check (round_number >= 0),
  match_number integer not null check (match_number >= 0),
  home_player_id uuid references public.profiles(id) on delete set null,
  away_player_id uuid references public.profiles(id) on delete set null,
  home_player_name text,
  away_player_name text,
  home_score integer not null default 0 check (home_score >= 0),
  away_score integer not null default 0 check (away_score >= 0),
  home_confirmed boolean not null default false,
  away_confirmed boolean not null default false,
  winner_id uuid references public.profiles(id) on delete set null,
  table_number integer,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  updated_at timestamptz not null default now()
);

create table if not exists public.free_entry_credits (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  earned_from_tournament_id uuid references public.mini_tournaments(id) on delete set null,
  is_redeemed boolean not null default false,
  redeemed_in_tournament_id uuid references public.mini_tournaments(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.day2_leaderboard (
  id uuid primary key default gen_random_uuid(),
  player_id uuid unique references public.profiles(id) on delete cascade,
  player_name text not null,
  entries_count integer not null default 0 check (entries_count >= 0),
  first_place_count integer not null default 0 check (first_place_count >= 0),
  second_place_count integer not null default 0 check (second_place_count >= 0),
  total_points integer not null default 0 check (total_points >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists mini_tournaments_feed_idx on public.mini_tournaments (league_key, created_at desc);
create index if not exists mini_matches_tournament_idx on public.mini_matches (tournament_id, round_number, match_number);
create index if not exists free_entry_credits_player_idx on public.free_entry_credits (player_id, is_redeemed);
create index if not exists day2_leaderboard_points_idx on public.day2_leaderboard (total_points desc, player_name asc);
