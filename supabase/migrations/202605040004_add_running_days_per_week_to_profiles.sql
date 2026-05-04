-- Add the user's target number of running days per week.
-- Null means the plan generator will use the default for training aggressiveness.

alter table public.profiles
  add column if not exists running_days_per_week integer;

alter table public.profiles
  drop constraint if exists profiles_running_days_per_week_valid;

alter table public.profiles
  add constraint profiles_running_days_per_week_valid
  check (
    running_days_per_week is null
    or running_days_per_week between 2 and 6
  );
