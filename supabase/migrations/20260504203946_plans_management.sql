-- Milestone 4.5: Plans Management.
-- This changes training plans from active/archived to active/paused,
-- enforces one active plan per profile, and adds safe plan-management RPCs.
--
-- RLS note:
-- The current app still uses the temporary no-auth/no-RLS setup from earlier
-- milestones. These functions intentionally match that setup for now.

alter table public.training_plans
  drop constraint if exists training_plans_status_valid;

alter table public.training_plans
  alter column status set default 'paused';

update public.training_plans
set status = 'paused'
where status = 'archived';

with ranked_active_plans as (
  select
    id,
    row_number() over (
      partition by profile_id
      order by created_at desc, id desc
    ) as active_rank
  from public.training_plans
  where status = 'active'
)
update public.training_plans as training_plan
set status = 'paused'
from ranked_active_plans
where training_plan.id = ranked_active_plans.id
  and ranked_active_plans.active_rank > 1;

alter table public.training_plans
  add constraint training_plans_status_valid
  check (status in ('active', 'paused'));

create unique index if not exists training_plans_one_active_plan_per_profile
  on public.training_plans(profile_id)
  where status = 'active';

create or replace function public.activate_training_plan(
  selected_training_plan_id uuid
)
returns public.training_plans
language plpgsql
as $$
declare
  selected_plan public.training_plans%rowtype;
  activated_plan public.training_plans%rowtype;
begin
  select *
  into selected_plan
  from public.training_plans
  where id = selected_training_plan_id;

  if not found then
    raise exception 'Training plan % does not exist.', selected_training_plan_id;
  end if;

  update public.training_plans
  set status = 'paused'
  where profile_id = selected_plan.profile_id
    and id <> selected_plan.id
    and status = 'active';

  update public.training_plans
  set status = 'active'
  where id = selected_plan.id
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
  target_plan public.training_plans%rowtype;
begin
  select *
  into target_plan
  from public.training_plans
  where id = target_training_plan_id;

  if not found then
    raise exception 'Training plan % does not exist.', target_training_plan_id;
  end if;

  select count(*)::integer
  into deleted_planned_workout_count
  from public.planned_workouts
  where training_plan_id = target_plan.id;

  select count(distinct workout_evaluation.id)::integer
  into deleted_workout_evaluation_count
  from public.workout_evaluations as workout_evaluation
  where workout_evaluation.training_plan_id = target_plan.id
    or workout_evaluation.planned_workout_id in (
      select planned_workout.id
      from public.planned_workouts as planned_workout
      where planned_workout.training_plan_id = target_plan.id
    );

  select count(distinct logged_workout.id)::integer
  into unlinked_logged_workout_count
  from public.logged_workouts as logged_workout
  where logged_workout.training_plan_id = target_plan.id
    or logged_workout.planned_workout_id in (
      select planned_workout.id
      from public.planned_workouts as planned_workout
      where planned_workout.training_plan_id = target_plan.id
    );

  delete from public.workout_evaluations as workout_evaluation
  where workout_evaluation.training_plan_id = target_plan.id
    or workout_evaluation.planned_workout_id in (
      select planned_workout.id
      from public.planned_workouts as planned_workout
      where planned_workout.training_plan_id = target_plan.id
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
      ) then null
      else logged_workout.planned_workout_id
    end
  where logged_workout.training_plan_id = target_plan.id
    or logged_workout.planned_workout_id in (
      select planned_workout.id
      from public.planned_workouts as planned_workout
      where planned_workout.training_plan_id = target_plan.id
    );

  delete from public.training_plans
  where id = target_plan.id;

  deleted_training_plan_id := target_plan.id;
  deleted_plan_name := target_plan.name;
  was_active := target_plan.status = 'active';

  return next;
end;
$$;
