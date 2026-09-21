create table if not exists public.league_announcements (
  id uuid primary key default gen_random_uuid(),
  league_key text not null default 'seguin-8ball',
  title text not null check (char_length(title) between 3 and 120),
  message text not null check (char_length(message) between 3 and 1200),
  posted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists league_announcements_feed_idx
  on public.league_announcements (league_key, created_at desc);

alter table public.league_announcements enable row level security;

drop policy if exists "public can read league announcements" on public.league_announcements;
create policy "public can read league announcements"
  on public.league_announcements for select using (true);
