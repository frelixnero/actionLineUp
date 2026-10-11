-- Idempotency for league-night standings.
-- Run once in the Supabase SQL editor.
--
-- The standings PATCH path must apply each confirmed match exactly once.
-- These columns record the last result applied for a lineup so a retried
-- or re-published confirmation cannot double-count the same winner/loser.

alter table public.lineups
  add column if not exists result_winner text check (result_winner is null or char_length(result_winner) between 1 and 80),
  add column if not exists result_loser text check (result_loser is null or char_length(result_loser) between 1 and 80),
  add column if not exists standings_applied_at timestamptz;

create index if not exists lineups_standings_applied_idx
  on public.lineups (id) where standings_applied_at is null;
