-- Milestone 6B follow-up: mark synced Intervals.icu workouts stale after
-- planned workout changes.
--
-- This migration only expands the allowed sync status values. It does not
-- publish, delete, or update any existing sync records.
--
-- RLS note:
-- The existing MVP schema is still using a temporary no-auth/no-RLS setup.
-- This migration keeps that pattern unchanged. Before public deployment, add
-- Supabase Auth and RLS policies for Intervals.icu sync records.

alter table public.intervals_workout_syncs
  drop constraint if exists intervals_workout_syncs_status_valid;

alter table public.intervals_workout_syncs
  add constraint intervals_workout_syncs_status_valid
  check (sync_status in (
    'not_synced',
    'needs_resync',
    'synced',
    'failed',
    'deleted'
  ));

comment on column public.intervals_workout_syncs.sync_status is
  'Tracks local Intervals.icu sync state. needs_resync means a previously synced planned workout changed and should be republished manually.';
