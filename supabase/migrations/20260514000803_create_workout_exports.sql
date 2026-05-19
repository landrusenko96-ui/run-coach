-- Milestone 6C export history foundation.
-- This generic table tracks workout export attempts across providers.
-- For now the app writes Garmin direct export attempts here. The existing
-- intervals_workout_syncs table remains unchanged.
--
-- Security note:
-- Store only safe export metadata and sanitized payload snapshots here.
-- Do not store Garmin tokens, cookies, passwords, bridge API keys, request
-- headers, or full provider response bodies.
--
-- RLS note:
-- The existing MVP schema is still using a temporary no-auth/no-RLS setup.
-- This table intentionally matches that current setup for now. Before public
-- deployment, add Supabase Auth and RLS policies so users can only access
-- their own workout export records.

create table if not exists public.workout_exports (
  id uuid primary key default gen_random_uuid(),
  planned_workout_id uuid not null references public.planned_workouts(id) on delete cascade,
  training_plan_id uuid not null references public.training_plans(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  export_provider text not null,
  export_mode text not null,
  provider_workout_id text,
  provider_schedule_id text,
  sync_status text not null default 'not_synced',
  scheduled_date date,
  last_synced_at timestamptz,
  last_verified_at timestamptz,
  last_error text,
  warnings jsonb not null default '[]'::jsonb,
  payload_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workout_exports_provider_valid
    check (export_provider in ('intervals_icu', 'garmin_direct')),
  constraint workout_exports_mode_not_blank
    check (length(trim(export_mode)) > 0),
  constraint workout_exports_status_valid
    check (sync_status in (
      'not_synced',
      'synced',
      'failed',
      'stale',
      'deleted',
      'partial'
    )),
  constraint workout_exports_provider_workout_id_not_blank
    check (
      provider_workout_id is null
      or length(trim(provider_workout_id)) > 0
    ),
  constraint workout_exports_provider_schedule_id_not_blank
    check (
      provider_schedule_id is null
      or length(trim(provider_schedule_id)) > 0
    ),
  constraint workout_exports_synced_has_provider_workout_id
    check (
      sync_status <> 'synced'
      or provider_workout_id is not null
    ),
  constraint workout_exports_partial_has_provider_workout_id
    check (
      sync_status <> 'partial'
      or provider_workout_id is not null
    ),
  constraint workout_exports_failed_has_error
    check (
      sync_status <> 'failed'
      or (last_error is not null and length(trim(last_error)) > 0)
    ),
  constraint workout_exports_warnings_is_array
    check (jsonb_typeof(warnings) = 'array'),
  constraint workout_exports_payload_snapshot_is_object
    check (
      payload_snapshot is null
      or jsonb_typeof(payload_snapshot) = 'object'
    )
);

comment on table public.workout_exports is
  'Generic workout export history. Garmin direct export attempts are written here first; Intervals.icu remains tracked in intervals_workout_syncs until migration is intentionally planned.';

comment on column public.workout_exports.export_provider is
  'External export provider. Supported values are intervals_icu and garmin_direct.';

comment on column public.workout_exports.export_mode is
  'How the export was initiated, for example single_publish or bulk_publish.';

comment on column public.workout_exports.payload_snapshot is
  'Sanitized local request/response summary only. Do not store provider secrets, tokens, cookies, passwords, API keys, headers, or full Garmin responses.';

create index if not exists workout_exports_planned_provider_created_idx
  on public.workout_exports(planned_workout_id, export_provider, created_at desc);

create index if not exists workout_exports_training_plan_provider_status_idx
  on public.workout_exports(training_plan_id, export_provider, sync_status);

create index if not exists workout_exports_profile_provider_status_idx
  on public.workout_exports(profile_id, export_provider, sync_status);

create index if not exists workout_exports_provider_workout_id_idx
  on public.workout_exports(export_provider, provider_workout_id)
  where provider_workout_id is not null;

grant select, insert, update on table public.workout_exports to anon, authenticated;

drop trigger if exists workout_exports_set_updated_at
  on public.workout_exports;
create trigger workout_exports_set_updated_at
  before update on public.workout_exports
  for each row
  execute function public.set_updated_at();
