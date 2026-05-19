-- Milestone 6C follow-up: keep local Garmin export history after deleting a
-- training plan. Direct Garmin deletion is not implemented yet, so the app
-- needs to preserve workout_exports rows and mark them deleted locally before
-- planned_workouts/training_plans are removed.

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint as con
  join pg_class as rel
    on rel.oid = con.conrelid
  join pg_namespace as nsp
    on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'workout_exports'
    and con.contype = 'f'
    and con.confrelid = 'public.planned_workouts'::regclass
  limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.workout_exports drop constraint %I',
      constraint_name
    );
  end if;

  select con.conname
    into constraint_name
  from pg_constraint as con
  join pg_class as rel
    on rel.oid = con.conrelid
  join pg_namespace as nsp
    on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'workout_exports'
    and con.contype = 'f'
    and con.confrelid = 'public.training_plans'::regclass
  limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.workout_exports drop constraint %I',
      constraint_name
    );
  end if;
end $$;

alter table public.workout_exports
  alter column planned_workout_id drop not null,
  alter column training_plan_id drop not null;

alter table public.workout_exports
  add constraint workout_exports_planned_workout_id_fkey
    foreign key (planned_workout_id)
    references public.planned_workouts(id)
    on delete set null,
  add constraint workout_exports_training_plan_id_fkey
    foreign key (training_plan_id)
    references public.training_plans(id)
    on delete set null;

comment on column public.workout_exports.planned_workout_id is
  'Linked planned workout while it exists locally. Set to null when the local workout is deleted so Garmin export history can remain.';

comment on column public.workout_exports.training_plan_id is
  'Linked training plan while it exists locally. Set to null when the local plan is deleted so Garmin export history can remain.';
