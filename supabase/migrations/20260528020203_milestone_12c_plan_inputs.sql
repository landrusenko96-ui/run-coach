-- Milestone 12C: collect the required inputs for spec-compatible initial plan
-- generation. This migration is local-only until reviewed and explicitly
-- approved for remote Supabase application in a later turn.

begin;

alter table public.profiles
  drop constraint if exists profiles_training_aggressiveness_valid;

update public.profiles
set training_aggressiveness = case training_aggressiveness
  when 'conservative' then 'relaxed'
  when 'balanced' then 'moderate'
  else training_aggressiveness
end;

alter table public.profiles
  alter column training_aggressiveness set default 'moderate';

alter table public.profiles
  add constraint profiles_training_aggressiveness_valid
  check (
    training_aggressiveness in (
      'relaxed',
      'moderate',
      'aggressive',
      'very_aggressive'
    )
  );

alter table public.profiles
  add column if not exists maximum_weekday_session_duration_min integer,
  add column if not exists maximum_weekend_session_duration_min integer,
  add column if not exists running_experience_level text,
  add column if not exists previous_half_marathon_history text,
  add column if not exists previous_marathon_history text,
  add column if not exists current_pain_or_injury boolean not null default false,
  add column if not exists serious_recent_injury boolean not null default false,
  add column if not exists injury_risk_notes text,
  add column if not exists preferred_rest_day text,
  add column if not exists preferred_workout_days text[] not null default '{}',
  add column if not exists cross_training_available boolean not null default false,
  add column if not exists double_run_willingness boolean not null default false,
  add column if not exists typical_surface text,
  add column if not exists typical_elevation_profile text,
  add column if not exists manual_six_week_history jsonb,
  add column if not exists manual_six_week_history_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_maximum_weekday_session_duration_valid,
  drop constraint if exists profiles_maximum_weekend_session_duration_valid,
  drop constraint if exists profiles_running_experience_level_valid,
  drop constraint if exists profiles_preferred_rest_day_valid,
  drop constraint if exists profiles_preferred_workout_days_valid,
  drop constraint if exists profiles_typical_surface_valid,
  drop constraint if exists profiles_typical_elevation_profile_valid,
  drop constraint if exists profiles_manual_six_week_history_is_array;

alter table public.profiles
  add constraint profiles_maximum_weekday_session_duration_valid
    check (
      maximum_weekday_session_duration_min is null
      or maximum_weekday_session_duration_min between 10 and 600
    ),
  add constraint profiles_maximum_weekend_session_duration_valid
    check (
      maximum_weekend_session_duration_min is null
      or maximum_weekend_session_duration_min between 10 and 720
    ),
  add constraint profiles_running_experience_level_valid
    check (
      running_experience_level is null
      or running_experience_level in ('beginner', 'intermediate', 'advanced')
    ),
  add constraint profiles_preferred_rest_day_valid
    check (
      preferred_rest_day is null
      or preferred_rest_day in (
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      )
    ),
  add constraint profiles_preferred_workout_days_valid
    check (
      preferred_workout_days <@ array[
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      ]::text[]
    ),
  add constraint profiles_typical_surface_valid
    check (
      typical_surface is null
      or typical_surface in ('road', 'trail', 'track', 'treadmill', 'mixed')
    ),
  add constraint profiles_typical_elevation_profile_valid
    check (
      typical_elevation_profile is null
      or typical_elevation_profile in (
        'flat',
        'rolling',
        'hilly',
        'mountainous',
        'mixed'
      )
    ),
  add constraint profiles_manual_six_week_history_is_array
    check (
      manual_six_week_history is null
      or jsonb_typeof(manual_six_week_history) = 'array'
    );

alter table public.race_goals
  add column if not exists race_priority text,
  add column if not exists goal_flexibility text,
  add column if not exists race_course_profile text;

update public.race_goals
set
  race_priority = coalesce(
    race_priority,
    case target_priority
      when 'aggressive' then 'A'
      when 'personal_best' then 'B'
      else 'casual'
    end
  ),
  goal_flexibility = coalesce(
    goal_flexibility,
    case
      when target_finish_time_sec is null then 'finish_only'
      when target_priority = 'aggressive' then 'fixed'
      else 'flexible'
    end
  );

alter table public.race_goals
  alter column race_priority set default 'casual',
  alter column race_priority set not null,
  alter column goal_flexibility set default 'flexible',
  alter column goal_flexibility set not null;

alter table public.race_goals
  drop constraint if exists race_goals_race_priority_valid,
  drop constraint if exists race_goals_goal_flexibility_valid,
  drop constraint if exists race_goals_race_course_profile_valid;

alter table public.race_goals
  add constraint race_goals_race_priority_valid
    check (race_priority in ('A', 'B', 'casual')),
  add constraint race_goals_goal_flexibility_valid
    check (goal_flexibility in ('fixed', 'flexible', 'finish_only')),
  add constraint race_goals_race_course_profile_valid
    check (
      race_course_profile is null
      or race_course_profile in ('flat', 'rolling', 'hilly', 'mountainous', 'unknown')
    );

commit;
