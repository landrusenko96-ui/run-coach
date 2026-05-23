-- Milestone 9.5: Auth + RLS hardening.
--
-- This migration is intentionally local-only until reviewed and manually
-- applied. It deletes the current anonymous-session MVP data before requiring
-- user ownership, then protects user-owned rows with RLS.

begin;

do $$
declare
  non_anonymous_user_count integer;
  unowned_core_row_count integer;
begin
  select count(*)::integer
  into non_anonymous_user_count
  from auth.users
  where coalesce(is_anonymous, false) = false;

  select (
    (select count(*) from public.workout_exports) +
    (select count(*) from public.intervals_workout_syncs) +
    (select count(*) from public.plan_adjustments) +
    (select count(*) from public.workout_evaluations) +
    (select count(*) from public.logged_workouts) +
    (select count(*) from public.planned_workouts) +
    (select count(*) from public.training_plans) +
    (select count(*) from public.race_goals) +
    (select count(*) from public.intervals_connections) +
    (select count(*) from public.profiles)
  )::integer
  into unowned_core_row_count;

  if non_anonymous_user_count > 0 and unowned_core_row_count > 0 then
    raise exception
      'Refusing to delete unowned MVP data because non-anonymous auth users already exist. Assign or remove existing data manually first.';
  end if;

  delete from public.strava_webhook_events
  where user_id in (
    select id from auth.users where coalesce(is_anonymous, false) = true
  );

  delete from public.strava_activities
  where user_id in (
    select id from auth.users where coalesce(is_anonymous, false) = true
  );

  delete from public.strava_connections
  where user_id in (
    select id from auth.users where coalesce(is_anonymous, false) = true
  );

  -- The original MVP core tables had no user_id, so the safe option chosen for
  -- this private app is to clear those old anonymous-session rows.
  delete from public.workout_exports;
  delete from public.intervals_workout_syncs;
  delete from public.plan_adjustments;
  delete from public.workout_evaluations;
  delete from public.logged_workouts;
  delete from public.planned_workouts;
  delete from public.training_plans;
  delete from public.race_goals;
  delete from public.intervals_connections;
  delete from public.profiles;
end $$;

alter table public.profiles
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.race_goals
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.training_plans
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.planned_workouts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.logged_workouts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_evaluations
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.plan_adjustments
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.intervals_connections
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.intervals_workout_syncs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_exports
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.profiles
  alter column user_id set default auth.uid(),
  alter column user_id set not null;
alter table public.race_goals
  alter column user_id set default auth.uid(),
  alter column user_id set not null;
alter table public.training_plans
  alter column user_id set default auth.uid(),
  alter column user_id set not null;
alter table public.planned_workouts
  alter column user_id set default auth.uid(),
  alter column user_id set not null;
alter table public.logged_workouts
  alter column user_id set default auth.uid(),
  alter column user_id set not null;
alter table public.workout_evaluations
  alter column user_id set default auth.uid(),
  alter column user_id set not null;
alter table public.plan_adjustments
  alter column user_id set default auth.uid(),
  alter column user_id set not null;
alter table public.intervals_connections
  alter column user_id set default auth.uid(),
  alter column user_id set not null;
alter table public.intervals_workout_syncs
  alter column user_id set default auth.uid(),
  alter column user_id set not null;
alter table public.workout_exports
  alter column user_id set default auth.uid(),
  alter column user_id set not null;

alter table public.profiles
  drop constraint if exists profiles_username_key;

create unique index if not exists profiles_user_id_key
  on public.profiles(user_id);

create unique index if not exists profiles_user_username_key
  on public.profiles(user_id, username);

create index if not exists race_goals_user_id_idx
  on public.race_goals(user_id);
create index if not exists training_plans_user_id_idx
  on public.training_plans(user_id);
create index if not exists planned_workouts_user_id_idx
  on public.planned_workouts(user_id);
create index if not exists logged_workouts_user_id_idx
  on public.logged_workouts(user_id);
create index if not exists workout_evaluations_user_id_idx
  on public.workout_evaluations(user_id);
create index if not exists plan_adjustments_user_id_idx
  on public.plan_adjustments(user_id);
create index if not exists intervals_connections_user_id_idx
  on public.intervals_connections(user_id);
create index if not exists intervals_workout_syncs_user_id_idx
  on public.intervals_workout_syncs(user_id);
create index if not exists workout_exports_user_id_idx
  on public.workout_exports(user_id);

alter table public.profiles enable row level security;
alter table public.race_goals enable row level security;
alter table public.training_plans enable row level security;
alter table public.planned_workouts enable row level security;
alter table public.logged_workouts enable row level security;
alter table public.workout_evaluations enable row level security;
alter table public.plan_adjustments enable row level security;
alter table public.intervals_connections enable row level security;
alter table public.intervals_workout_syncs enable row level security;
alter table public.workout_exports enable row level security;
alter table public.strava_connections enable row level security;
alter table public.strava_activities enable row level security;
alter table public.strava_webhook_events enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.race_goals from anon;
revoke all on table public.training_plans from anon;
revoke all on table public.planned_workouts from anon;
revoke all on table public.logged_workouts from anon;
revoke all on table public.workout_evaluations from anon;
revoke all on table public.plan_adjustments from anon;
revoke all on table public.intervals_connections from anon;
revoke all on table public.intervals_workout_syncs from anon;
revoke all on table public.workout_exports from anon;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.race_goals to authenticated;
grant select, insert, update, delete on table public.training_plans to authenticated;
grant select, insert, update, delete on table public.planned_workouts to authenticated;
grant select, insert, update, delete on table public.logged_workouts to authenticated;
grant select, insert, update, delete on table public.workout_evaluations to authenticated;
grant select, insert, update, delete on table public.plan_adjustments to authenticated;
grant select, insert, update on table public.intervals_connections to authenticated;
grant select, insert, update on table public.intervals_workout_syncs to authenticated;
grant select, insert, update on table public.workout_exports to authenticated;

revoke all on table public.strava_connections from anon;
revoke all on table public.strava_connections from authenticated;
grant select (
  id,
  user_id,
  strava_athlete_id,
  athlete_display_name,
  athlete_username,
  athlete_profile_url,
  token_expires_at,
  scope,
  created_at,
  updated_at
) on table public.strava_connections to authenticated;

revoke all on table public.strava_activities from anon;
grant select, insert, update, delete on table public.strava_activities to authenticated;

revoke all on table public.strava_webhook_events from anon;
revoke all on table public.strava_webhook_events from authenticated;
grant select on table public.strava_webhook_events to authenticated;

drop policy if exists "Users can view their own profile."
  on public.profiles;
create policy "Users can view their own profile."
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own profile."
  on public.profiles;
create policy "Users can create their own profile."
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own profile."
  on public.profiles;
create policy "Users can update their own profile."
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own race goals."
  on public.race_goals;
create policy "Users can view their own race goals."
  on public.race_goals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own race goals."
  on public.race_goals;
create policy "Users can create their own race goals."
  on public.race_goals
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own race goals."
  on public.race_goals;
create policy "Users can update their own race goals."
  on public.race_goals
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own training plans."
  on public.training_plans;
create policy "Users can view their own training plans."
  on public.training_plans
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own training plans."
  on public.training_plans;
create policy "Users can create their own training plans."
  on public.training_plans
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own training plans."
  on public.training_plans;
create policy "Users can update their own training plans."
  on public.training_plans
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own training plans."
  on public.training_plans;
create policy "Users can delete their own training plans."
  on public.training_plans
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own planned workouts."
  on public.planned_workouts;
create policy "Users can view their own planned workouts."
  on public.planned_workouts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own planned workouts."
  on public.planned_workouts;
create policy "Users can create their own planned workouts."
  on public.planned_workouts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own planned workouts."
  on public.planned_workouts;
create policy "Users can update their own planned workouts."
  on public.planned_workouts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own planned workouts."
  on public.planned_workouts;
create policy "Users can delete their own planned workouts."
  on public.planned_workouts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own logged workouts."
  on public.logged_workouts;
create policy "Users can view their own logged workouts."
  on public.logged_workouts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own logged workouts."
  on public.logged_workouts;
create policy "Users can create their own logged workouts."
  on public.logged_workouts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own logged workouts."
  on public.logged_workouts;
create policy "Users can update their own logged workouts."
  on public.logged_workouts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own logged workouts."
  on public.logged_workouts;
create policy "Users can delete their own logged workouts."
  on public.logged_workouts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own workout evaluations."
  on public.workout_evaluations;
create policy "Users can view their own workout evaluations."
  on public.workout_evaluations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own workout evaluations."
  on public.workout_evaluations;
create policy "Users can create their own workout evaluations."
  on public.workout_evaluations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own workout evaluations."
  on public.workout_evaluations;
create policy "Users can update their own workout evaluations."
  on public.workout_evaluations
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own workout evaluations."
  on public.workout_evaluations;
create policy "Users can delete their own workout evaluations."
  on public.workout_evaluations
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own plan adjustments."
  on public.plan_adjustments;
create policy "Users can view their own plan adjustments."
  on public.plan_adjustments
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own plan adjustments."
  on public.plan_adjustments;
create policy "Users can create their own plan adjustments."
  on public.plan_adjustments
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own plan adjustments."
  on public.plan_adjustments;
create policy "Users can update their own plan adjustments."
  on public.plan_adjustments
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own plan adjustments."
  on public.plan_adjustments;
create policy "Users can delete their own plan adjustments."
  on public.plan_adjustments
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own Intervals connections."
  on public.intervals_connections;
create policy "Users can view their own Intervals connections."
  on public.intervals_connections
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own Intervals connections."
  on public.intervals_connections;
create policy "Users can create their own Intervals connections."
  on public.intervals_connections
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Intervals connections."
  on public.intervals_connections;
create policy "Users can update their own Intervals connections."
  on public.intervals_connections
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own Intervals workout syncs."
  on public.intervals_workout_syncs;
create policy "Users can view their own Intervals workout syncs."
  on public.intervals_workout_syncs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own Intervals workout syncs."
  on public.intervals_workout_syncs;
create policy "Users can create their own Intervals workout syncs."
  on public.intervals_workout_syncs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Intervals workout syncs."
  on public.intervals_workout_syncs;
create policy "Users can update their own Intervals workout syncs."
  on public.intervals_workout_syncs
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own workout exports."
  on public.workout_exports;
create policy "Users can view their own workout exports."
  on public.workout_exports
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own workout exports."
  on public.workout_exports;
create policy "Users can create their own workout exports."
  on public.workout_exports
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own workout exports."
  on public.workout_exports;
create policy "Users can update their own workout exports."
  on public.workout_exports
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own Strava connection."
  on public.strava_connections;
create policy "Users can view their own Strava connection."
  on public.strava_connections
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own Strava connection."
  on public.strava_connections;
drop policy if exists "Users can update their own Strava connection."
  on public.strava_connections;
drop policy if exists "Users can delete their own Strava connection."
  on public.strava_connections;

drop policy if exists "Users can view their own Strava activities."
  on public.strava_activities;
create policy "Users can view their own Strava activities."
  on public.strava_activities
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own Strava activities."
  on public.strava_activities;
create policy "Users can create their own Strava activities."
  on public.strava_activities
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Strava activities."
  on public.strava_activities;
create policy "Users can update their own Strava activities."
  on public.strava_activities
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Strava activities."
  on public.strava_activities;
create policy "Users can delete their own Strava activities."
  on public.strava_activities
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own Strava webhook events."
  on public.strava_webhook_events;
create policy "Users can view their own Strava webhook events."
  on public.strava_webhook_events
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function public.activate_training_plan(
  selected_training_plan_id uuid
)
returns public.training_plans
language plpgsql
as $$
declare
  request_user_id uuid := auth.uid();
  selected_plan public.training_plans%rowtype;
  activated_plan public.training_plans%rowtype;
begin
  if request_user_id is null then
    raise exception 'Sign in before activating a training plan.';
  end if;

  select *
  into selected_plan
  from public.training_plans
  where id = selected_training_plan_id
    and user_id = request_user_id;

  if not found then
    raise exception 'Training plan % does not exist for this user.', selected_training_plan_id;
  end if;

  update public.training_plans
  set status = 'paused'
  where user_id = request_user_id
    and profile_id = selected_plan.profile_id
    and id <> selected_plan.id
    and status = 'active';

  update public.training_plans
  set status = 'active'
  where id = selected_plan.id
    and user_id = request_user_id
  returning * into activated_plan;

  return activated_plan;
end;
$$;

create or replace function public.delete_training_plan_and_related_data(
  target_training_plan_id uuid
)
returns table (
  deleted_training_plan_id uuid,
  deleted_plan_name text,
  was_active boolean,
  deleted_planned_workout_count integer,
  deleted_workout_evaluation_count integer,
  unlinked_logged_workout_count integer
)
language plpgsql
as $$
declare
  request_user_id uuid := auth.uid();
  target_plan public.training_plans%rowtype;
begin
  if request_user_id is null then
    raise exception 'Sign in before deleting a training plan.';
  end if;

  select *
  into target_plan
  from public.training_plans
  where id = target_training_plan_id
    and user_id = request_user_id;

  if not found then
    raise exception 'Training plan % does not exist for this user.', target_training_plan_id;
  end if;

  select count(*)::integer
  into deleted_planned_workout_count
  from public.planned_workouts
  where training_plan_id = target_plan.id
    and user_id = request_user_id;

  select count(distinct workout_evaluation.id)::integer
  into deleted_workout_evaluation_count
  from public.workout_evaluations as workout_evaluation
  where workout_evaluation.user_id = request_user_id
    and (
      workout_evaluation.training_plan_id = target_plan.id
      or workout_evaluation.planned_workout_id in (
        select planned_workout.id
        from public.planned_workouts as planned_workout
        where planned_workout.training_plan_id = target_plan.id
          and planned_workout.user_id = request_user_id
      )
      or workout_evaluation.logged_workout_id in (
        select logged_workout.id
        from public.logged_workouts as logged_workout
        where logged_workout.user_id = request_user_id
          and (
            logged_workout.training_plan_id = target_plan.id
            or logged_workout.planned_workout_id in (
              select planned_workout.id
              from public.planned_workouts as planned_workout
              where planned_workout.training_plan_id = target_plan.id
                and planned_workout.user_id = request_user_id
            )
          )
      )
    );

  select count(distinct logged_workout.id)::integer
  into unlinked_logged_workout_count
  from public.logged_workouts as logged_workout
  where logged_workout.user_id = request_user_id
    and (
      logged_workout.training_plan_id = target_plan.id
      or logged_workout.planned_workout_id in (
        select planned_workout.id
        from public.planned_workouts as planned_workout
        where planned_workout.training_plan_id = target_plan.id
          and planned_workout.user_id = request_user_id
      )
    );

  delete from public.workout_evaluations as workout_evaluation
  where workout_evaluation.user_id = request_user_id
    and (
      workout_evaluation.training_plan_id = target_plan.id
      or workout_evaluation.planned_workout_id in (
        select planned_workout.id
        from public.planned_workouts as planned_workout
        where planned_workout.training_plan_id = target_plan.id
          and planned_workout.user_id = request_user_id
      )
      or workout_evaluation.logged_workout_id in (
        select logged_workout.id
        from public.logged_workouts as logged_workout
        where logged_workout.user_id = request_user_id
          and (
            logged_workout.training_plan_id = target_plan.id
            or logged_workout.planned_workout_id in (
              select planned_workout.id
              from public.planned_workouts as planned_workout
              where planned_workout.training_plan_id = target_plan.id
                and planned_workout.user_id = request_user_id
            )
          )
      )
    );

  update public.logged_workouts as logged_workout
  set
    training_plan_id = case
      when logged_workout.training_plan_id = target_plan.id then null
      else logged_workout.training_plan_id
    end,
    planned_workout_id = case
      when logged_workout.planned_workout_id in (
        select planned_workout.id
        from public.planned_workouts as planned_workout
        where planned_workout.training_plan_id = target_plan.id
          and planned_workout.user_id = request_user_id
      ) then null
      else logged_workout.planned_workout_id
    end
  where logged_workout.user_id = request_user_id
    and (
      logged_workout.training_plan_id = target_plan.id
      or logged_workout.planned_workout_id in (
        select planned_workout.id
        from public.planned_workouts as planned_workout
        where planned_workout.training_plan_id = target_plan.id
          and planned_workout.user_id = request_user_id
      )
    );

  delete from public.training_plans
  where id = target_plan.id
    and user_id = request_user_id;

  deleted_training_plan_id := target_plan.id;
  deleted_plan_name := target_plan.name;
  was_active := target_plan.status = 'active';

  return next;
end;
$$;

revoke execute on function public.activate_training_plan(uuid) from public;
revoke execute on function public.activate_training_plan(uuid) from anon;
revoke execute on function public.delete_training_plan_and_related_data(uuid) from public;
revoke execute on function public.delete_training_plan_and_related_data(uuid) from anon;
grant execute on function public.activate_training_plan(uuid) to authenticated;
grant execute on function public.delete_training_plan_and_related_data(uuid) to authenticated;

commit;
