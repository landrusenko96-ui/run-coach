-- Milestone 13 Change 4: persist aerobic-efficiency trend metadata.
-- This is additive only and does not change plan generation enums or workouts.

alter table public.training_plans
  add column if not exists aerobic_efficiency_summary jsonb;

alter table public.training_plans
  drop constraint if exists training_plans_aerobic_efficiency_summary_is_object;

alter table public.training_plans
  add constraint training_plans_aerobic_efficiency_summary_is_object
    check (
      aerobic_efficiency_summary is null
      or jsonb_typeof(aerobic_efficiency_summary) = 'object'
    );
