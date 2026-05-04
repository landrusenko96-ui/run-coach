-- Generated training plan schema for Milestone 3.
-- This adds plan storage only. It does not add workout logging,
-- Strava imports, AI features, auth, or row-level security.

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  race_goal_id uuid not null references public.race_goals(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  start_date date not null,
  end_date date not null,
  total_weeks integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint training_plans_name_not_blank
    check (length(trim(name)) > 0),
  constraint training_plans_status_valid
    check (status in ('active', 'archived')),
  constraint training_plans_dates_valid
    check (end_date >= start_date),
  constraint training_plans_total_weeks_positive
    check (total_weeks > 0)
);

create table if not exists public.planned_workouts (
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid not null references public.training_plans(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  race_goal_id uuid not null references public.race_goals(id) on delete cascade,
  workout_date date not null,
  week_number integer not null,
  day_label text not null,
  workout_type text not null,
  title text not null,
  description text,
  distance_km numeric(6, 2),
  duration_min integer,
  target_pace_min_sec_per_km integer,
  target_pace_max_sec_per_km integer,
  target_hr_zone text,
  terrain text,
  purpose text,
  instructions text,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint planned_workouts_week_number_positive
    check (week_number > 0),
  constraint planned_workouts_day_label_valid
    check (
      day_label in (
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      )
    ),
  constraint planned_workouts_workout_type_valid
    check (
      workout_type in (
        'easy',
        'long_run',
        'tempo',
        'interval',
        'marathon_pace',
        'recovery',
        'rest',
        'strength_optional',
        'calibration',
        'cross_training'
      )
    ),
  constraint planned_workouts_title_not_blank
    check (length(trim(title)) > 0),
  constraint planned_workouts_distance_non_negative
    check (distance_km is null or distance_km >= 0),
  constraint planned_workouts_duration_positive
    check (duration_min is null or duration_min > 0),
  constraint planned_workouts_target_pace_min_positive
    check (
      target_pace_min_sec_per_km is null
      or target_pace_min_sec_per_km > 0
    ),
  constraint planned_workouts_target_pace_max_positive
    check (
      target_pace_max_sec_per_km is null
      or target_pace_max_sec_per_km > 0
    ),
  constraint planned_workouts_target_pace_range_valid
    check (
      target_pace_min_sec_per_km is null
      or target_pace_max_sec_per_km is null
      or target_pace_min_sec_per_km <= target_pace_max_sec_per_km
    ),
  constraint planned_workouts_terrain_valid
    check (
      terrain is null
      or terrain in (
        'flat',
        'hills',
        'track',
        'treadmill',
        'trails',
        'downhill'
      )
    ),
  constraint planned_workouts_status_valid
    check (status in ('planned', 'completed', 'missed', 'skipped'))
);

create index if not exists training_plans_profile_id_idx
  on public.training_plans(profile_id);

create index if not exists training_plans_race_goal_id_idx
  on public.training_plans(race_goal_id);

create index if not exists training_plans_profile_status_idx
  on public.training_plans(profile_id, status);

create index if not exists planned_workouts_training_plan_date_idx
  on public.planned_workouts(training_plan_id, workout_date);

create index if not exists planned_workouts_profile_date_idx
  on public.planned_workouts(profile_id, workout_date);

create index if not exists planned_workouts_race_goal_id_idx
  on public.planned_workouts(race_goal_id);

create index if not exists planned_workouts_status_idx
  on public.planned_workouts(status);

drop trigger if exists training_plans_set_updated_at on public.training_plans;
create trigger training_plans_set_updated_at
  before update on public.training_plans
  for each row
  execute function public.set_updated_at();

drop trigger if exists planned_workouts_set_updated_at on public.planned_workouts;
create trigger planned_workouts_set_updated_at
  before update on public.planned_workouts
  for each row
  execute function public.set_updated_at();
