-- Milestone 13 Change 3: persist the selected fitness-anchor audit summary.
-- This is additive only and does not change RLS, exports, or plan generation enums.

alter table public.training_plans
  add column if not exists fitness_anchor_summary jsonb;

alter table public.training_plans
  drop constraint if exists training_plans_fitness_anchor_summary_is_object;

alter table public.training_plans
  add constraint training_plans_fitness_anchor_summary_is_object
    check (
      fitness_anchor_summary is null
      or jsonb_typeof(fitness_anchor_summary) = 'object'
    );
