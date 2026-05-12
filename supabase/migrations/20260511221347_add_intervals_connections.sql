-- Milestone 6B database foundation: Intervals.icu connection settings.
-- This stores the Intervals athlete ID only. The real API key must stay in
-- server-only environment variables such as INTERVALS_API_KEY.
--
-- RLS note:
-- The existing MVP schema is still using a temporary no-auth/no-RLS setup.
-- This table intentionally matches that current setup for now. Before public
-- deployment, add Supabase Auth and RLS policies so users can only access
-- their own Intervals.icu connection records.

create table if not exists public.intervals_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id text not null,
  api_key_encrypted_or_placeholder text not null default 'stored_in_environment_variable',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint intervals_connections_athlete_id_not_blank
    check (length(trim(athlete_id)) > 0),
  constraint intervals_connections_api_key_placeholder_only
    check (
      api_key_encrypted_or_placeholder = 'stored_in_environment_variable'
    )
);

comment on table public.intervals_connections is
  'Stores Intervals.icu athlete IDs for the MVP. Real Intervals API keys must stay in server-only environment variables. RLS is intentionally not enabled in the temporary MVP schema; add Supabase Auth and RLS before public deployment.';

comment on column public.intervals_connections.api_key_encrypted_or_placeholder is
  'MVP placeholder only. Do not store real Intervals.icu API keys in this column.';

create index if not exists intervals_connections_profile_id_idx
  on public.intervals_connections(profile_id);

create index if not exists intervals_connections_profile_active_idx
  on public.intervals_connections(profile_id, is_active);

create unique index if not exists intervals_connections_one_active_per_profile
  on public.intervals_connections(profile_id)
  where is_active = true;

drop trigger if exists intervals_connections_set_updated_at
  on public.intervals_connections;
create trigger intervals_connections_set_updated_at
  before update on public.intervals_connections
  for each row
  execute function public.set_updated_at();
