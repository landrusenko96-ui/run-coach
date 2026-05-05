-- Milestone 4 database foundation: manual workout logs and workout scoring.
-- This adds storage only. It does not add Strava import, Intervals.icu,
-- scoring formulas, UI, or plan adjustment.
--
-- RLS note:
-- The existing app schema does not use auth or row-level security yet.
-- These public tables intentionally match that temporary setup for now.
-- Before public deployment, add Supabase Auth and RLS policies so users can
-- only access their own workout data.

create table if not exists public.logged_workouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  race_goal_id uuid references public.race_goals(id) on delete set null,
  training_plan_id uuid references public.training_plans(id) on delete set null,
  planned_workout_id uuid references public.planned_workouts(id) on delete set null,
  workout_date date not null,
  workout_type text not null default 'run',
  source text not null default 'manual',
  distance_km numeric(6, 2),
  duration_sec integer,
  avg_pace_sec_per_km integer,
  avg_heart_rate integer,
  max_heart_rate integer,
  cadence integer,
  elevation_gain_m numeric(7, 2),
  rpe integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint logged_workouts_workout_type_valid
    check (workout_type in ('run', 'treadmill_run')),
  constraint logged_workouts_source_valid
    check (source in ('manual', 'strava')),
  constraint logged_workouts_distance_non_negative
    check (distance_km is null or distance_km >= 0),
  constraint logged_workouts_duration_positive
    check (duration_sec is null or duration_sec > 0),
  constraint logged_workouts_avg_pace_positive
    check (avg_pace_sec_per_km is null or avg_pace_sec_per_km > 0),
  constraint logged_workouts_avg_heart_rate_reasonable
    check (
      avg_heart_rate is null
      or avg_heart_rate between 40 and 250
    ),
  constraint logged_workouts_max_heart_rate_reasonable
    check (
      max_heart_rate is null
      or max_heart_rate between 40 and 250
    ),
  constraint logged_workouts_heart_rate_order_valid
    check (
      avg_heart_rate is null
      or max_heart_rate is null
      or avg_heart_rate <= max_heart_rate
    ),
  constraint logged_workouts_cadence_reasonable
    check (cadence is null or cadence between 1 and 300),
  constraint logged_workouts_elevation_gain_non_negative
    check (elevation_gain_m is null or elevation_gain_m >= 0),
  constraint logged_workouts_rpe_valid
    check (rpe is null or rpe between 1 and 10)
);

create table if not exists public.workout_evaluations (
  id uuid primary key default gen_random_uuid(),
  logged_workout_id uuid not null references public.logged_workouts(id) on delete cascade,
  planned_workout_id uuid references public.planned_workouts(id) on delete set null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  training_plan_id uuid references public.training_plans(id) on delete set null,
  overall_score integer not null,
  completion_score integer not null,
  pace_accuracy_score integer not null,
  distance_completion_score integer not null,
  effort_control_score integer not null,
  training_value_score integer not null,
  risk_level text not null,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workout_evaluations_overall_score_valid
    check (overall_score between 0 and 100),
  constraint workout_evaluations_completion_score_valid
    check (completion_score between 0 and 100),
  constraint workout_evaluations_pace_accuracy_score_valid
    check (pace_accuracy_score between 0 and 100),
  constraint workout_evaluations_distance_completion_score_valid
    check (distance_completion_score between 0 and 100),
  constraint workout_evaluations_effort_control_score_valid
    check (effort_control_score between 0 and 100),
  constraint workout_evaluations_training_value_score_valid
    check (training_value_score between 0 and 100),
  constraint workout_evaluations_risk_level_valid
    check (risk_level in ('low', 'medium', 'high'))
);

create index if not exists logged_workouts_profile_date_idx
  on public.logged_workouts(profile_id, workout_date);

create index if not exists logged_workouts_training_plan_date_idx
  on public.logged_workouts(training_plan_id, workout_date);

create index if not exists logged_workouts_planned_workout_id_idx
  on public.logged_workouts(planned_workout_id);

create index if not exists workout_evaluations_logged_workout_id_idx
  on public.workout_evaluations(logged_workout_id);

create index if not exists workout_evaluations_profile_created_at_idx
  on public.workout_evaluations(profile_id, created_at);

create index if not exists workout_evaluations_training_plan_created_at_idx
  on public.workout_evaluations(training_plan_id, created_at);

drop trigger if exists logged_workouts_set_updated_at on public.logged_workouts;
create trigger logged_workouts_set_updated_at
  before update on public.logged_workouts
  for each row
  execute function public.set_updated_at();

drop trigger if exists workout_evaluations_set_updated_at on public.workout_evaluations;
create trigger workout_evaluations_set_updated_at
  before update on public.workout_evaluations
  for each row
  execute function public.set_updated_at();
