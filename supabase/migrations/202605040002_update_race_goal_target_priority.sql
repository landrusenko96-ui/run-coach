-- Update race goal priority options to match the app UI:
-- finish, PR, or aggressive.

alter table public.race_goals
  drop constraint if exists race_goals_target_priority_valid;

alter table public.race_goals
  add constraint race_goals_target_priority_valid
  check (target_priority in ('finish', 'personal_best', 'aggressive'));
