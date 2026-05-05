-- Milestone 4.5 follow-up: harden plan deletion cleanup.
-- Logged workouts stay, but evaluations connected to the deleted plan should
-- be removed even when the connection is through the logged workout.

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
    )
    or workout_evaluation.logged_workout_id in (
      select logged_workout.id
      from public.logged_workouts as logged_workout
      where logged_workout.training_plan_id = target_plan.id
        or logged_workout.planned_workout_id in (
          select planned_workout.id
          from public.planned_workouts as planned_workout
          where planned_workout.training_plan_id = target_plan.id
        )
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
    )
    or workout_evaluation.logged_workout_id in (
      select logged_workout.id
      from public.logged_workouts as logged_workout
      where logged_workout.training_plan_id = target_plan.id
        or logged_workout.planned_workout_id in (
          select planned_workout.id
          from public.planned_workouts as planned_workout
          where planned_workout.training_plan_id = target_plan.id
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
