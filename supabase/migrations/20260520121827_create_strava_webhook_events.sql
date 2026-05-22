-- Milestone 9 database foundation: Strava webhook event inbox.
-- This stores incoming Strava webhook events so the app can safely process
-- activity/create events and audit ignored update/delete/deauthorization events.
-- It does not apply webhook processing logic and does not change manual import.

create table if not exists public.strava_webhook_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  user_id uuid references auth.users(id) on delete set null,
  owner_id bigint not null,
  object_type text not null,
  object_id bigint not null,
  aspect_type text not null,
  event_time bigint not null,
  subscription_id bigint,
  updates jsonb,
  raw_event jsonb not null,
  processing_status text not null default 'pending',
  action_taken text,
  attempts integer not null default 0,
  last_error text,
  import_summary jsonb,
  logged_workout_id uuid references public.logged_workouts(id) on delete set null,
  planned_workout_id uuid references public.planned_workouts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint strava_webhook_events_object_type_not_blank
    check (length(trim(object_type)) > 0),
  constraint strava_webhook_events_aspect_type_not_blank
    check (length(trim(aspect_type)) > 0),
  constraint strava_webhook_events_processing_status_valid
    check (
      processing_status in (
        'pending',
        'processing',
        'processed',
        'ignored',
        'failed'
      )
    ),
  constraint strava_webhook_events_attempts_non_negative
    check (attempts >= 0),
  constraint strava_webhook_events_updates_is_object
    check (
      updates is null
      or jsonb_typeof(updates) = 'object'
    ),
  constraint strava_webhook_events_raw_event_is_object
    check (jsonb_typeof(raw_event) = 'object'),
  constraint strava_webhook_events_import_summary_is_object
    check (
      import_summary is null
      or jsonb_typeof(import_summary) = 'object'
    )
);

comment on table public.strava_webhook_events is
  'Inbox and audit log for Strava webhook events. Server-side webhook processing writes here; browser clients may only read their own rows.';

create unique index if not exists strava_webhook_events_dedupe_key
  on public.strava_webhook_events(
    owner_id,
    object_type,
    object_id,
    aspect_type,
    event_time
  );

create index if not exists strava_webhook_events_user_id_idx
  on public.strava_webhook_events(user_id);

create index if not exists strava_webhook_events_owner_id_idx
  on public.strava_webhook_events(owner_id);

create index if not exists strava_webhook_events_object_id_idx
  on public.strava_webhook_events(object_id);

create index if not exists strava_webhook_events_processing_status_idx
  on public.strava_webhook_events(processing_status);

create index if not exists strava_webhook_events_received_at_idx
  on public.strava_webhook_events(received_at);

create index if not exists strava_webhook_events_processed_at_idx
  on public.strava_webhook_events(processed_at);

drop trigger if exists strava_webhook_events_set_updated_at
  on public.strava_webhook_events;
create trigger strava_webhook_events_set_updated_at
  before update on public.strava_webhook_events
  for each row
  execute function public.set_updated_at();

alter table public.strava_webhook_events enable row level security;

revoke all on table public.strava_webhook_events from anon;
revoke all on table public.strava_webhook_events from authenticated;

grant select
  on table public.strava_webhook_events
  to authenticated;

drop policy if exists "Users can view their own Strava webhook events."
  on public.strava_webhook_events;
create policy "Users can view their own Strava webhook events."
  on public.strava_webhook_events
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
