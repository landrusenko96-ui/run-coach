-- Milestone 5 database foundation: adaptive plan adjustment records.
-- This adds storage only. It does not add adjustment logic, Intervals.icu,
-- Strava, or changes to existing workout logging/scoring behavior.
--
-- RLS note:
-- The existing MVP schema is still using a temporary no-auth/no-RLS setup.
-- This table intentionally matches that current setup for now. Before public
-- deployment, add Supabase Auth and RLS policies so users can only access
-- their own plan adjustment records.

create table if not exists public.plan_adjustments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  race_goal_id uuid not null references public.race_goals(id) on delete cascade,
  training_plan_id uuid not null references public.training_plans(id) on delete cascade,
  logged_workout_id uuid not null references public.logged_workouts(id) on delete cascade,
  workout_evaluation_id uuid not null references public.workout_evaluations(id) on delete cascade,
  adjustment_type text not null,
  reason text not null,
  explanation text,
  affected_workout_ids uuid[] not null default '{}'::uuid[],
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz not null default now(),

  constraint plan_adjustments_adjustment_type_valid
    check (
      adjustment_type in (
        'none',
        'reduce_next_intensity',
        'add_recovery',
        'shift_workout',
        'update_training_paces',
        'reduce_weekly_volume',
        'protect_long_run_progression'
      )
    ),
  constraint plan_adjustments_reason_not_blank
    check (length(trim(reason)) > 0),
  constraint plan_adjustments_affected_workout_ids_no_nulls
    check (array_position(affected_workout_ids, null::uuid) is null)
);

comment on table public.plan_adjustments is
  'Stores adaptive plan adjustment audit records. RLS is intentionally not enabled in the temporary MVP schema; add Supabase Auth and RLS before public deployment.';

create index if not exists plan_adjustments_profile_created_at_idx
  on public.plan_adjustments(profile_id, created_at);

create index if not exists plan_adjustments_race_goal_created_at_idx
  on public.plan_adjustments(race_goal_id, created_at);

create index if not exists plan_adjustments_training_plan_created_at_idx
  on public.plan_adjustments(training_plan_id, created_at);

create index if not exists plan_adjustments_logged_workout_id_idx
  on public.plan_adjustments(logged_workout_id);

create index if not exists plan_adjustments_workout_evaluation_id_idx
  on public.plan_adjustments(workout_evaluation_id);

create index if not exists plan_adjustments_adjustment_type_idx
  on public.plan_adjustments(adjustment_type);

create index if not exists plan_adjustments_affected_workout_ids_idx
  on public.plan_adjustments using gin(affected_workout_ids);
