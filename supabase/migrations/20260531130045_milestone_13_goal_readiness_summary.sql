-- Milestone 13 Change 5: persist goal-readiness metadata.
-- Additive only: existing plans may keep this field null.

alter table public.training_plans
  add column if not exists goal_readiness_summary jsonb;

alter table public.training_plans
  drop constraint if exists training_plans_goal_readiness_summary_is_object;

alter table public.training_plans
  add constraint training_plans_goal_readiness_summary_is_object
    check (
      goal_readiness_summary is null
      or jsonb_typeof(goal_readiness_summary) = 'object'
    );
