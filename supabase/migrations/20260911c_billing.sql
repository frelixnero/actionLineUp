-- Action Line-Up: make memberships writable, and record Stripe subscriptions.
-- Run after 20260911b_format_engine.sql, in the Supabase SQL editor.
--
-- Why this exists: memberships.league_id is NOT NULL and references
-- public.leagues(id), but nothing in the app ever reads or writes public.leagues.
-- Every other table keys off league_key = 'seguin-8ball'. So as shipped, a
-- membership row could not be inserted at all -- there was no league id to use.
--
-- This aligns memberships with the convention the rest of the schema already
-- uses, without dropping the old column or touching public.leagues.

-- Key memberships the same way as everything else.
alter table public.memberships add column if not exists league_key text not null default 'seguin-8ball';

-- league_id stays for anything that already depended on it, but it can no longer
-- block an insert. Nothing populates it today.
alter table public.memberships alter column league_id drop not null;

-- The real uniqueness rule is one membership per person per league.
drop index if exists memberships_profile_league_key_unique;
create unique index memberships_profile_league_key_unique
  on public.memberships (profile_id, league_key);

-- Stripe bookkeeping. provider_customer_id / provider_subscription_id already
-- exist and stay provider-agnostic; these add what a subscription needs on top.
alter table public.memberships add column if not exists provider text
  check (provider is null or provider in ('stripe'));
alter table public.memberships add column if not exists price_id text;
alter table public.memberships add column if not exists cancel_at_period_end boolean not null default false;
alter table public.memberships add column if not exists updated_at timestamptz not null default now();

create index if not exists memberships_subscription_idx
  on public.memberships (provider_subscription_id);
create index if not exists memberships_customer_idx
  on public.memberships (provider_customer_id);

drop trigger if exists memberships_touch_updated_at on public.memberships;
create trigger memberships_touch_updated_at before update on public.memberships
  for each row execute function public.touch_updated_at();

-- Stripe webhooks retry, and can arrive out of order or more than once. Recording
-- each event id makes handling idempotent: a replayed event is ignored instead of
-- re-applying a stale subscription state.
create table if not exists public.billing_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;
-- No policy: this table is service-role only. Nothing client-side should read it.

-- A member's own row is theirs to read. No public read: tier and billing status
-- are not league standings.
drop policy if exists "members can read own memberships" on public.memberships;
create policy "members can read own memberships" on public.memberships
  for select using (auth.uid() = profile_id);
