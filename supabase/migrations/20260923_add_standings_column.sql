-- Migration: add standings JSONB column to league_settings
-- Run this in your Supabase SQL editor once.

alter table public.league_settings
  add column if not exists standings jsonb default null;

-- Add audit table for standings changes
create table if not exists public.league_standings_audit (
  id uuid default gen_random_uuid() primary key,
  league_key text not null,
  action text not null,
  payload jsonb,
  performed_by text,
  created_at timestamptz default now()
);

-- Also ensure the upsert for the PUT /api/standings endpoint works
-- by granting the service role write access (already true for service role key).
