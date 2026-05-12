-- Milestone 6B database foundation: Intervals.icu workout sync records.
-- This adds storage only. It does not publish workouts or change existing
-- planned workout behavior.
--
-- RLS note:
-- The existing MVP schema is still using a temporary no-auth/no-RLS setup.
-- This table intentionally matches that current setup for now. Before public
-- deployment, add Supabase Auth and RLS policies so users can only access
-- their own Intervals.icu sync records.

create table if not exists public.intervals_workout_syncs (
  id uuid primary key default gen_random_uuid(),
  planned_workout_id uuid not null references public.planned_workouts(id) on delete cascade,
  training_plan_id uuid not null references public.training_plans(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  intervals_external_id text not null,
  intervals_event_id bigint,
  sync_status text not null default 'not_synced',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint intervals_workout_syncs_external_id_not_blank
    check (length(trim(intervals_external_id)) > 0),
  constraint intervals_workout_syncs_status_valid
    check (sync_status in ('not_synced', 'synced', 'failed', 'deleted')),
  constraint intervals_workout_syncs_synced_has_timestamp
    check (sync_status <> 'synced' or last_synced_at is not null),
  constraint intervals_workout_syncs_failed_has_error
    check (
      sync_status <> 'failed'
      or (last_error is not null and length(trim(last_error)) > 0)
    )
);

comment on table public.intervals_workout_syncs is
  'Tracks what planned workouts were sent to Intervals.icu and their latest sync status. RLS is intentionally not enabled in the temporary MVP schema; add Supabase Auth and RLS before public deployment.';

comment on column public.intervals_workout_syncs.intervals_external_id is
  'Stable external ID sent to Intervals.icu. For the MVP this should match planned_workouts.id.';

create unique index if not exists intervals_workout_syncs_planned_workout_id_key
  on public.intervals_workout_syncs(planned_workout_id);

create unique index if not exists intervals_workout_syncs_external_id_key
  on public.intervals_workout_syncs(intervals_external_id);

create index if not exists intervals_workout_syncs_training_plan_status_idx
  on public.intervals_workout_syncs(training_plan_id, sync_status);

create index if not exists intervals_workout_syncs_profile_status_idx
  on public.intervals_workout_syncs(profile_id, sync_status);

drop trigger if exists intervals_workout_syncs_set_updated_at
  on public.intervals_workout_syncs;
create trigger intervals_workout_syncs_set_updated_at
  before update on public.intervals_workout_syncs
  for each row
  execute function public.set_updated_at();
