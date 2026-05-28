-- Milestone 12F: persist initial plan-generation metadata for auditability.
-- This is additive only: existing plans keep working with conservative defaults.

alter table public.training_plans
  add column if not exists generator_version text not null default 'rule_based_v1',
  add column if not exists feasibility_rating text,
  add column if not exists fitness_confidence text,
  add column if not exists generation_assumptions jsonb not null default '[]'::jsonb,
  add column if not exists generation_warnings jsonb not null default '[]'::jsonb,
  add column if not exists phase_summaries jsonb not null default '[]'::jsonb,
  add column if not exists weekly_summaries jsonb not null default '[]'::jsonb,
  add column if not exists peak_summary jsonb,
  add column if not exists taper_summary jsonb;

alter table public.training_plans
  drop constraint if exists training_plans_generator_version_valid,
  drop constraint if exists training_plans_feasibility_rating_valid,
  drop constraint if exists training_plans_fitness_confidence_valid,
  drop constraint if exists training_plans_generation_assumptions_is_array,
  drop constraint if exists training_plans_generation_warnings_is_array,
  drop constraint if exists training_plans_phase_summaries_is_array,
  drop constraint if exists training_plans_weekly_summaries_is_array,
  drop constraint if exists training_plans_peak_summary_is_object,
  drop constraint if exists training_plans_taper_summary_is_object;

alter table public.training_plans
  add constraint training_plans_generator_version_valid
    check (generator_version in ('rule_based_v1')),
  add constraint training_plans_feasibility_rating_valid
    check (
      feasibility_rating is null
      or feasibility_rating in (
        'finish_only',
        'realistic',
        'ambitious',
        'very_ambitious',
        'low_confidence',
        'not_credible'
      )
    ),
  add constraint training_plans_fitness_confidence_valid
    check (
      fitness_confidence is null
      or fitness_confidence in ('low', 'medium', 'high')
    ),
  add constraint training_plans_generation_assumptions_is_array
    check (jsonb_typeof(generation_assumptions) = 'array'),
  add constraint training_plans_generation_warnings_is_array
    check (jsonb_typeof(generation_warnings) = 'array'),
  add constraint training_plans_phase_summaries_is_array
    check (jsonb_typeof(phase_summaries) = 'array'),
  add constraint training_plans_weekly_summaries_is_array
    check (jsonb_typeof(weekly_summaries) = 'array'),
  add constraint training_plans_peak_summary_is_object
    check (
      peak_summary is null
      or jsonb_typeof(peak_summary) = 'object'
    ),
  add constraint training_plans_taper_summary_is_object
    check (
      taper_summary is null
      or jsonb_typeof(taper_summary) = 'object'
    );
