-- Score-sheet scan audit log.
-- Run once in the Supabase SQL editor, like the earlier migrations.
--
-- Every scan upload writes one row here BEFORE the vision call. The table
-- is the abuse control (per-user hourly/daily caps are plain count queries)
-- and the audit trail linking an uploaded sheet image to the uploader.

create table if not exists public.scorecard_scans (
  id uuid primary key default gen_random_uuid(),
  league_key text not null default 'seguin-8ball',
  lineup_id uuid references public.lineups(id) on delete set null,
  uploader_id uuid references public.profiles(id) on delete set null,
  storage_path text not null check (char_length(storage_path) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists scorecard_scans_uploader_idx
  on public.scorecard_scans (uploader_id, created_at desc);

create index if not exists scorecard_scans_league_idx
  on public.scorecard_scans (league_key, created_at desc);

-- Service-role API only, matching the lineups pattern: RLS on, no public
-- policies, so anon-key reads/writes are denied by default.
alter table public.scorecard_scans enable row level security;
