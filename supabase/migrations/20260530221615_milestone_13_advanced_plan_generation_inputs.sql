-- Milestone 13: optional advanced physiology and zone inputs.
-- This is additive only. Existing profiles keep the current generator behavior.

alter table public.profiles
  add column if not exists lactate_threshold_heart_rate integer,
  add column if not exists aerobic_threshold_heart_rate integer,
  add column if not exists user_hr_zones jsonb,
  add column if not exists aerobic_threshold_pace_sec_per_km integer,
  add column if not exists threshold_power_watts integer,
  add column if not exists critical_power_watts integer,
  add column if not exists easy_power_min_watts integer,
  add column if not exists easy_power_max_watts integer,
  add column if not exists user_power_zones jsonb,
  add column if not exists vo2max numeric(5, 2),
  add column if not exists vo2max_source text,
  add column if not exists zones_source_priority text[],
  add column if not exists physiology_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_lactate_threshold_hr_reasonable,
  drop constraint if exists profiles_aerobic_threshold_hr_reasonable,
  drop constraint if exists profiles_user_hr_zones_is_array,
  drop constraint if exists profiles_aerobic_threshold_pace_positive,
  drop constraint if exists profiles_threshold_power_reasonable,
  drop constraint if exists profiles_critical_power_reasonable,
  drop constraint if exists profiles_easy_power_min_reasonable,
  drop constraint if exists profiles_easy_power_max_reasonable,
  drop constraint if exists profiles_easy_power_range_valid,
  drop constraint if exists profiles_user_power_zones_is_array,
  drop constraint if exists profiles_vo2max_reasonable,
  drop constraint if exists profiles_vo2max_source_valid,
  drop constraint if exists profiles_zones_source_priority_valid;

alter table public.profiles
  add constraint profiles_lactate_threshold_hr_reasonable
    check (
      lactate_threshold_heart_rate is null
      or lactate_threshold_heart_rate between 40 and 250
    ),
  add constraint profiles_aerobic_threshold_hr_reasonable
    check (
      aerobic_threshold_heart_rate is null
      or aerobic_threshold_heart_rate between 40 and 250
    ),
  add constraint profiles_user_hr_zones_is_array
    check (
      user_hr_zones is null
      or jsonb_typeof(user_hr_zones) = 'array'
    ),
  add constraint profiles_aerobic_threshold_pace_positive
    check (
      aerobic_threshold_pace_sec_per_km is null
      or aerobic_threshold_pace_sec_per_km > 0
    ),
  add constraint profiles_threshold_power_reasonable
    check (
      threshold_power_watts is null
      or threshold_power_watts between 50 and 900
    ),
  add constraint profiles_critical_power_reasonable
    check (
      critical_power_watts is null
      or critical_power_watts between 50 and 900
    ),
  add constraint profiles_easy_power_min_reasonable
    check (
      easy_power_min_watts is null
      or easy_power_min_watts between 30 and 700
    ),
  add constraint profiles_easy_power_max_reasonable
    check (
      easy_power_max_watts is null
      or easy_power_max_watts between 30 and 700
    ),
  add constraint profiles_easy_power_range_valid
    check (
      easy_power_min_watts is null
      or easy_power_max_watts is null
      or easy_power_min_watts <= easy_power_max_watts
    ),
  add constraint profiles_user_power_zones_is_array
    check (
      user_power_zones is null
      or jsonb_typeof(user_power_zones) = 'array'
    ),
  add constraint profiles_vo2max_reasonable
    check (
      vo2max is null
      or vo2max between 10 and 100
    ),
  add constraint profiles_vo2max_source_valid
    check (
      vo2max_source is null
      or vo2max_source in ('garmin', 'lab', 'estimate', 'other')
    ),
  add constraint profiles_zones_source_priority_valid
    check (
      zones_source_priority is null
      or zones_source_priority <@ array[
        'manual',
        'garmin',
        'lab',
        'other'
      ]::text[]
    );
