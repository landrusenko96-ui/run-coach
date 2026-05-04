-- First app schema for Run.B*tch.app.
-- Paste this file into the Supabase SQL editor, or run it as a migration.
--
-- This intentionally does not add auth or row-level security yet.
-- Before a public deployment, add authentication and RLS policies.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  birth_year integer,
  sex text,
  height_cm integer,
  weight_kg numeric(5, 2),
  current_weekly_mileage_km numeric(6, 2),
  longest_recent_run_km numeric(6, 2),
  easy_pace_sec_per_km integer,
  threshold_pace_sec_per_km integer,
  max_heart_rate integer,
  resting_heart_rate integer,
  available_training_days text[] not null default '{}',
  preferred_long_run_day text,
  terrain_available text[] not null default '{}',
  training_aggressiveness text not null default 'balanced',
  injury_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_username_not_blank
    check (length(trim(username)) > 0),
  constraint profiles_display_name_not_blank
    check (length(trim(display_name)) > 0),
  constraint profiles_birth_year_reasonable
    check (birth_year is null or birth_year between 1900 and 2100),
  constraint profiles_sex_valid
    check (
      sex is null
      or sex in ('female', 'male', 'non_binary', 'prefer_not_to_say')
    ),
  constraint profiles_height_cm_reasonable
    check (height_cm is null or height_cm between 50 and 250),
  constraint profiles_weight_kg_reasonable
    check (weight_kg is null or weight_kg > 0),
  constraint profiles_current_weekly_mileage_non_negative
    check (
      current_weekly_mileage_km is null
      or current_weekly_mileage_km >= 0
    ),
  constraint profiles_longest_recent_run_non_negative
    check (
      longest_recent_run_km is null
      or longest_recent_run_km >= 0
    ),
  constraint profiles_easy_pace_positive
    check (easy_pace_sec_per_km is null or easy_pace_sec_per_km > 0),
  constraint profiles_threshold_pace_positive
    check (
      threshold_pace_sec_per_km is null
      or threshold_pace_sec_per_km > 0
    ),
  constraint profiles_max_heart_rate_reasonable
    check (max_heart_rate is null or max_heart_rate between 40 and 250),
  constraint profiles_resting_heart_rate_reasonable
    check (
      resting_heart_rate is null
      or resting_heart_rate between 20 and 150
    ),
  constraint profiles_available_training_days_valid
    check (
      available_training_days <@ array[
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      ]::text[]
    ),
  constraint profiles_preferred_long_run_day_valid
    check (
      preferred_long_run_day is null
      or preferred_long_run_day in (
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      )
    ),
  constraint profiles_terrain_available_valid
    check (
      terrain_available <@ array[
        'flat',
        'hills',
        'track',
        'treadmill',
        'trails',
        'downhill'
      ]::text[]
    ),
  constraint profiles_training_aggressiveness_valid
    check (
      training_aggressiveness in ('conservative', 'balanced', 'aggressive')
    )
);

create table if not exists public.race_goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  race_name text not null,
  race_date date not null,
  distance text not null,
  target_finish_time_sec integer,
  target_priority text not null default 'finish',
  course_elevation_notes text,
  expected_weather_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint race_goals_race_name_not_blank
    check (length(trim(race_name)) > 0),
  constraint race_goals_distance_valid
    check (distance in ('half_marathon', 'marathon')),
  constraint race_goals_target_finish_time_positive
    check (
      target_finish_time_sec is null
      or target_finish_time_sec > 0
    ),
  constraint race_goals_target_priority_valid
    check (target_priority in ('finish', 'personal_best', 'aggressive'))
);

create unique index if not exists race_goals_one_active_goal_per_profile
  on public.race_goals(profile_id)
  where is_active = true;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

drop trigger if exists race_goals_set_updated_at on public.race_goals;
create trigger race_goals_set_updated_at
  before update on public.race_goals
  for each row
  execute function public.set_updated_at();
