-- League donations ledger for Stripe one-time checkout.
-- Run once in the Supabase SQL editor, like the earlier migrations.
--
-- The donate button used to increment a local number. Donations now create a
-- Stripe Checkout session, and the webhook inserts one row here per completed
-- payment, so the fundraiser meter is the sum of real money.

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  league_key text not null default 'seguin-8ball',
  amount_cents integer not null check (amount_cents > 0),
  donor_profile_id uuid references public.profiles(id) on delete set null,
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);

create index if not exists donations_league_idx
  on public.donations (league_key, created_at desc);

-- Service-role API only: RLS on, no public policies (anon reads denied).
alter table public.donations enable row level security;
