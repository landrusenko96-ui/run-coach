-- Allow manual workout elevation to represent net descent.
-- Negative values are valid when a route loses more elevation than it gains.

alter table public.logged_workouts
  drop constraint if exists logged_workouts_elevation_gain_non_negative;
