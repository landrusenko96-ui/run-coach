# Run.B*tch.app

Internal repo name: `run-coach`

Run.B*tch.app is a private web app for adaptive marathon preparation. The long-term product loop is:

Runner profile -> Race goal -> Training plan -> Workout logging -> Workout evaluation -> Plan adjustment -> Updated plan

The most important feature is the adaptive training plan. This repository now contains the early private MVP flow for profile setup, race goals, rule-based plan generation, manual workout logging, workout scoring, plan adjustment, dashboard status, Intervals.icu planned-workout publishing, an experimental local-only direct Garmin export bridge, and manual Strava run import.

## How to run locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the app:

```text
http://localhost:3000
```

Useful checks after dependencies are installed:

```bash
npm run typecheck
npm run lint
npm test
```

## Current status

- Next.js App Router, TypeScript, and Tailwind CSS are configured.
- Basic navigation exists for Dashboard, Profile, Goal, Plan, Workouts, and Settings.
- Profile and race goal forms save to Supabase.
- Rule-based plan generation creates planned workouts and structured workout documents.
- New plans start today by default, can start on a selected future date, and block starts that are in the past or too close to race day.
- Manual workout logging saves completed workouts and generates rule-based workout scores.
- Plan adjustment logic can update future planned workouts with an audit record.
- Dashboard acts as a weekly command center with today's workout, the next workout, this-week status, export health, attention items, recent logs, recent scores, and plan-change summaries.
- Intervals.icu publishing exists for planned run workouts using server-only environment variables. It remains the primary export path.
- Direct Garmin publishing exists as an experimental local-only bridge in `local-garmin-bridge/`.
- The Direct Garmin bridge uses `python-garminconnect==0.3.3`, a locally saved Garmin session, and a FastAPI service bound to `127.0.0.1`.
- Direct Garmin publishing has been manually verified to create Garmin workouts with pace targets visible on a Forerunner watch.
- The app can preview, single-publish, and bulk-publish upcoming eligible workouts to the local Garmin bridge through server routes.
- Garmin direct export attempts are tracked in `workout_exports`, including success, failure, partial, stale, and locally deleted states.
- Direct Garmin duplicate guardrails are built: already-exported workouts are not republished into Garmin; stale workouts use the manual update flow instead.
- Direct Garmin manual delete, manual stale-update, bulk publish, bulk maintenance, and explicit plan-deletion cleanup choices are available.
- Known limitation: automatic Garmin deletion/update is not built. The app only changes Garmin workouts after a direct user action.
- Settings includes a Direct Garmin Bridge troubleshooting panel.
- Strava OAuth connection and manual run import are available from Settings and Workouts.
- Strava import skips duplicate activities, non-runs, invalid runs, pre-plan runs, and active-plan days already covered by logged workouts.
- Gear tracking and AI feedback are not built yet.

## Environment variables

Copy `.env.example` to `.env.local` and fill in your own values.

Supabase:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not prefix it with
`NEXT_PUBLIC_`, never log it, and never use it in browser/client components.
It bypasses RLS and is only for trusted server-side tasks such as future
Strava webhook processing.

Intervals.icu:

```text
INTERVALS_ATHLETE_ID
INTERVALS_API_KEY
```

Keep `INTERVALS_API_KEY` server-only. Do not prefix it with `NEXT_PUBLIC_`.

Direct Garmin local bridge:

```text
GARMIN_BRIDGE_URL
GARMIN_BRIDGE_API_KEY
```

For local development, the usual bridge URL is:

```text
GARMIN_BRIDGE_URL=http://127.0.0.1:8765
```

Keep `GARMIN_BRIDGE_API_KEY` server-only. Do not prefix it with `NEXT_PUBLIC_`. The browser must never receive the bridge key.

The bridge has its own local-only environment variable with the same key value:

```bash
cd local-garmin-bridge
source .venv/bin/activate
export GARMIN_BRIDGE_API_KEY="replace-with-a-long-random-local-key"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

Garmin login happens only in the local bridge terminal. Do not store Garmin usernames, passwords, tokens, cookies, or session files in Supabase, Next.js, `.env.local`, screenshots, docs, or commits.

Strava import:

```text
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
NEXT_PUBLIC_APP_URL
STRAVA_WEBHOOK_VERIFY_TOKEN
STRAVA_WEBHOOK_CALLBACK_URL
```

For local development:

```text
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Keep `STRAVA_CLIENT_SECRET` server-only. Do not prefix it with `NEXT_PUBLIC_`. The browser should only start the connect flow and read safe connection status; access tokens and refresh tokens stay in server routes and Supabase.

Keep `STRAVA_WEBHOOK_VERIFY_TOKEN` and `STRAVA_WEBHOOK_CALLBACK_URL`
server-only too. Do not prefix them with `NEXT_PUBLIC_`, never log them, and do
not read them from browser/client components. `STRAVA_WEBHOOK_CALLBACK_URL`
must be a public URL when webhooks are enabled; plain `localhost` cannot receive
Strava webhook calls directly.

## Strava Import Setup

Manual Strava import lets you connect Strava, then import recent runs from the last 7 or 14 days. It does not use Strava webhooks.

To set it up locally:

1. Create a Strava API app at `https://www.strava.com/settings/api`.
2. Set the authorization callback domain to your local app host, usually `localhost`.
3. Put these values in `.env.local`:

```text
STRAVA_CLIENT_ID=your-strava-client-id
STRAVA_CLIENT_SECRET=your-strava-client-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRAVA_WEBHOOK_VERIFY_TOKEN=replace-with-a-long-random-token
STRAVA_WEBHOOK_CALLBACK_URL=https://your-public-app-url.example.com/api/strava/webhook
SUPABASE_SERVICE_ROLE_KEY=your-server-only-supabase-service-role-or-secret-key
```

4. Make sure the Supabase migration for Milestone 7 has been applied so `strava_connections`, `strava_activities`, and `logged_workouts.source_activity_id` exist.
5. In Supabase Auth settings, make sure anonymous sign-ins are enabled for this MVP auth flow.
6. Start the app with `npm run dev`.
7. Open Settings, click Connect Strava, approve `read` and `activity:read_all`, then return to the app.
8. Click Import latest Strava runs from Settings or Workouts.

Manual test expectations:

- Running activities with sport type `Run`, `TrailRun`, or `VirtualRun` can import.
- Rides, swims, walks, hikes, strength workouts, and unknown sport types are skipped.
- Runs before the active plan start are skipped as before-plan.
- A day that already has a manual logged workout is skipped as already logged.
- Already imported Strava activities are skipped as duplicates.
- The import summary lists each pulled Strava activity with name, date, distance, average pace, and status.

## Direct Garmin Bridge Notes

Intervals.icu remains the primary supported export path. The Direct Garmin bridge is experimental, local-only, and personal-use only.

Use it when you specifically need Garmin pace targets that Intervals.icu does not preserve reliably. The Direct Garmin path has been manually verified to publish pace targets to a Forerunner watch, but it uses unofficial Garmin Connect internals through `python-garminconnect==0.3.3`, so it can break without notice.

To use Direct Garmin locally:

1. Start the bridge from `local-garmin-bridge/`.
2. Make sure `GARMIN_BRIDGE_API_KEY` is exported in the bridge terminal.
3. Make sure the Next.js `.env.local` has matching `GARMIN_BRIDGE_URL` and `GARMIN_BRIDGE_API_KEY`.
4. Authenticate Garmin once through the bridge terminal.
5. Check Settings -> Direct Garmin Bridge status before publishing.

Common fixes:

- Bridge not configured: set `GARMIN_BRIDGE_URL` and `GARMIN_BRIDGE_API_KEY` in `.env.local`.
- Bridge not running: run `cd local-garmin-bridge && source .venv/bin/activate && python -m uvicorn app.main:app --host 127.0.0.1 --port 8765`.
- Auth missing or token invalid: run the Garmin auth helper and complete login/MFA in the bridge terminal.
- Already exported workout: use Update Garmin Export for stale workouts or Delete from Garmin before publishing again. The app intentionally does not offer duplicate-creating republish.

## Folder structure

```text
/app               Next.js App Router pages and root layout
/components        Shared React components
/lib               Shared application utilities
/lib/training      Rule-based plan, scoring, adjustment, and dashboard logic
/lib/db            Supabase database utilities
/lib/intervals     Intervals.icu publishing utilities
/lib/garminBridge  Server-only Next.js client for the local Garmin bridge
/lib/strava        Server-only Strava OAuth and manual import utilities
/local-garmin-bridge  Separate local Python FastAPI Garmin bridge
/supabase          Database migrations
/tests             Node test suite for training and integration helpers
/types             Shared TypeScript types
```

## Next planned milestone

Continue tightening the adaptive training loop before adding broad new features:

- keep training logic deterministic and rule-based;
- keep tightening the dashboard and active-plan reliability work;
- keep Intervals.icu as the primary workout export path;
- treat the direct Garmin local bridge as experimental even though pace-target publishing has been manually verified;
- keep Garmin cleanup explicit and user-confirmed; do not add silent automatic Garmin deletion/update.
