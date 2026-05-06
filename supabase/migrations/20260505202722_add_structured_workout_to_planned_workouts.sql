-- Add structured workout documents for planned workout export.
-- Existing planned workouts remain unchanged with null structured_workout.

alter table public.planned_workouts
  add column if not exists structured_workout jsonb;
