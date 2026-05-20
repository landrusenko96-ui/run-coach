-- Milestone 7 database foundation: manual Strava import.
-- This adds Strava connection/activity storage and a Strava source identifier
-- on logged workouts. It does not add Strava webhooks or change existing
-- manual logging, scoring, plan adjustment, Intervals.icu, or Garmin behavior.
--
-- Auth/RLS note:
-- The existing MVP tables are still in the temporary no-auth/no-RLS setup.
-- These new Strava tables are the first signed-in-user scoped tables and use
-- auth.users(id) plus RLS. Existing app tables are intentionally left unchanged
-- until a dedicated auth/RLS milestone.

create table if not exists public.strava_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strava_athlete_id text not null,
  athlete_display_name text,
  athlete_username text,
  athlete_profile_url text,
  athlete_summary_json jsonb,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  scope text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint strava_connections_athlete_id_not_blank
    check (length(trim(strava_athlete_id)) > 0),
  constraint strava_connections_display_name_not_blank
    check (
      athlete_display_name is null
      or length(trim(athlete_display_name)) > 0
    ),
  constraint strava_connections_username_not_blank
    check (
      athlete_username is null
      or length(trim(athlete_username)) > 0
    ),
  constraint strava_connections_profile_url_not_blank
    check (
      athlete_profile_url is null
      or length(trim(athlete_profile_url)) > 0
    ),
  constraint strava_connections_summary_is_object
    check (
      athlete_summary_json is null
      or jsonb_typeof(athlete_summary_json) = 'object'
    ),
  constraint strava_connections_access_token_not_blank
    check (length(trim(access_token)) > 0),
  constraint strava_connections_refresh_token_not_blank
    check (length(trim(refresh_token)) > 0),
  constraint strava_connections_scope_not_blank
    check (length(trim(scope)) > 0)
);

comment on table public.strava_connections is
  'Stores manual Strava import connection data. Access and refresh tokens are sensitive and must not be exposed through browser UI.';

comment on column public.strava_connections.athlete_summary_json is
  'Small safe athlete display summary only. Do not store full Strava athlete responses here.';

create unique index if not exists strava_connections_user_id_key
  on public.strava_connections(user_id);

create unique index if not exists strava_connections_athlete_id_key
  on public.strava_connections(strava_athlete_id);

create index if not exists strava_connections_token_expires_at_idx
  on public.strava_connections(token_expires_at);

drop trigger if exists strava_connections_set_updated_at
  on public.strava_connections;
create trigger strava_connections_set_updated_at
  before update on public.strava_connections
  for each row
  execute function public.set_updated_at();

create table if not exists public.strava_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strava_activity_id text not null,
  logged_workout_id uuid references public.logged_workouts(id) on delete set null,
  planned_workout_id uuid references public.planned_workouts(id) on delete set null,
  activity_name text not null,
  sport_type text not null,
  start_date timestamptz not null,
  distance_m numeric(12, 2) not null,
  moving_time_sec integer not null,
  elapsed_time_sec integer not null,
  total_elevation_gain_m numeric(8, 2),
  average_heart_rate numeric(5, 2),
  max_heart_rate numeric(5, 2),
  raw_summary_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint strava_activities_activity_id_not_blank
    check (length(trim(strava_activity_id)) > 0),
  constraint strava_activities_activity_name_not_blank
    check (length(trim(activity_name)) > 0),
  constraint strava_activities_sport_type_not_blank
    check (length(trim(sport_type)) > 0),
  constraint strava_activities_distance_non_negative
    check (distance_m >= 0),
  constraint strava_activities_moving_time_non_negative
    check (moving_time_sec >= 0),
  constraint strava_activities_elapsed_time_non_negative
    check (elapsed_time_sec >= 0),
  constraint strava_activities_elevation_gain_valid
    check (
      total_elevation_gain_m is null
      or total_elevation_gain_m >= 0
    ),
  constraint strava_activities_average_hr_reasonable
    check (
      average_heart_rate is null
      or average_heart_rate between 40 and 250
    ),
  constraint strava_activities_max_hr_reasonable
    check (
      max_heart_rate is null
      or max_heart_rate between 40 and 250
    ),
  constraint strava_activities_heart_rate_order_valid
    check (
      average_heart_rate is null
      or max_heart_rate is null
      or average_heart_rate <= max_heart_rate
    ),
  constraint strava_activities_raw_summary_is_object
    check (
      raw_summary_json is null
      or jsonb_typeof(raw_summary_json) = 'object'
    )
);

comment on table public.strava_activities is
  'Tracks Strava activities seen by manual import and links them to logged workouts when imported.';

comment on column public.strava_activities.distance_m is
  'Strava activity distance in meters.';

comment on column public.strava_activities.raw_summary_json is
  'Raw Strava activity summary for debugging. Do not store secrets or OAuth token responses here.';

create unique index if not exists strava_activities_user_activity_id_key
  on public.strava_activities(user_id, strava_activity_id);

create unique index if not exists strava_activities_logged_workout_id_key
  on public.strava_activities(logged_workout_id)
  where logged_workout_id is not null;

create index if not exists strava_activities_user_start_date_idx
  on public.strava_activities(user_id, start_date desc);

create index if not exists strava_activities_planned_workout_id_idx
  on public.strava_activities(planned_workout_id)
  where planned_workout_id is not null;

drop trigger if exists strava_activities_set_updated_at
  on public.strava_activities;
create trigger strava_activities_set_updated_at
  before update on public.strava_activities
  for each row
  execute function public.set_updated_at();

alter table public.logged_workouts
  add column if not exists source_activity_id text;

alter table public.logged_workouts
  drop constraint if exists logged_workouts_source_activity_id_not_blank;

alter table public.logged_workouts
  add constraint logged_workouts_source_activity_id_not_blank
  check (
    source_activity_id is null
    or length(trim(source_activity_id)) > 0
  );

comment on column public.logged_workouts.source_activity_id is
  'External source activity ID. For Strava imports this stores the Strava activity ID. Manual logs may leave this null.';

create unique index if not exists logged_workouts_strava_source_activity_id_key
  on public.logged_workouts(source_activity_id)
  where source = 'strava' and source_activity_id is not null;

alter table public.strava_connections enable row level security;
alter table public.strava_activities enable row level security;

revoke all on table public.strava_connections from anon;
revoke all on table public.strava_activities from anon;

grant select, insert, update, delete
  on table public.strava_connections
  to authenticated;

grant select, insert, update, delete
  on table public.strava_activities
  to authenticated;

drop policy if exists "Users can view their own Strava connection."
  on public.strava_connections;
create policy "Users can view their own Strava connection."
  on public.strava_connections
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can create their own Strava connection."
  on public.strava_connections;
create policy "Users can create their own Strava connection."
  on public.strava_connections
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own Strava connection."
  on public.strava_connections;
create policy "Users can update their own Strava connection."
  on public.strava_connections
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Strava connection."
  on public.strava_connections;
create policy "Users can delete their own Strava connection."
  on public.strava_connections
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can view their own Strava activities."
  on public.strava_activities;
create policy "Users can view their own Strava activities."
  on public.strava_activities
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can create their own Strava activities."
  on public.strava_activities;
create policy "Users can create their own Strava activities."
  on public.strava_activities
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own Strava activities."
  on public.strava_activities;
create policy "Users can update their own Strava activities."
  on public.strava_activities
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Strava activities."
  on public.strava_activities;
create policy "Users can delete their own Strava activities."
  on public.strava_activities
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
