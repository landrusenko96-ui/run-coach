# Run.B*tch.app

Internal repo name: `run-coach`

Run.B*tch.app is a private web app for adaptive marathon preparation. The long-term product loop is:

Runner profile -> Race goal -> Training plan -> Workout logging -> Workout evaluation -> Plan adjustment -> Updated plan

The most important feature is the adaptive training plan. This repository now contains the early private MVP flow for profile setup, race goals, rule-based plan generation, manual workout logging, workout scoring, plan adjustment, dashboard status, Intervals.icu planned-workout publishing, an experimental private direct Garmin export bridge, manual Strava run import, Strava webhook intake/processing, and production deployment readiness docs.

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

For the full beginner-readable local setup checklist, use
[`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md).

Useful checks after dependencies are installed:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For production deployment setup and production smoke tests, use
[`docs/PRODUCTION_DEPLOYMENT.md`](docs/PRODUCTION_DEPLOYMENT.md).

## Current status

- Next.js App Router, TypeScript, and Tailwind CSS are configured.
- Basic navigation exists for Dashboard, Profile, Goal, Plan, Workouts, and Settings.
- Email one-time-code login uses Supabase Auth. App pages require a signed-in non-anonymous user.
- A header sign-out button signs out the current browser session and returns to `/login`.
- User-owned Supabase tables are protected with `user_id` ownership and RLS policies from Milestone 9.5.
- Profile and race goal forms save to Supabase.
- Rule-based initial plan generation is now treated as complete for the current product state. It creates planned workouts from six-week evidence, Strava detail/stream signals when available, feasibility checks, terrain/durability rules, intensity caps, and a variable-driven workout subtype library while preserving DB-safe workout types, structured workout documents, and persisted generation metadata.
- The detailed generator architecture and rule reference is in [`docs/PLAN_GENERATOR_LOGIC.md`](docs/PLAN_GENERATOR_LOGIC.md).
- New plans start today by default, can start on a selected future date, and block starts that are in the past or too close to race day.
- Manual workout logging saves completed workouts and generates rule-based workout scores.
- Plan adjustment logic can update future planned workouts with an audit record.
- Dashboard acts as a weekly command center with today's workout, the next workout, this-week status, export health, attention items, recent logs, recent scores, and plan-change summaries.
- Intervals.icu publishing exists for planned run workouts using server-only environment variables. It remains the primary export path.
- Direct Garmin publishing exists as an experimental private bridge in `local-garmin-bridge/`.
- The Direct Garmin bridge uses `python-garminconnect==0.3.3`, a saved Garmin session, and a FastAPI service that must bind to `127.0.0.1`.
- Hosted Direct Garmin now runs on an Oracle Cloud Ubuntu VPS behind Cloudflare Tunnel and Cloudflare Access Service Auth at `https://garmin-bridge.runbitchapp.com`. The browser never calls the bridge directly.
- Direct Garmin publishing has been manually verified from production to create Garmin workouts with pace targets visible on a Forerunner watch.
- The app can preview, single-publish, and bulk-publish upcoming eligible workouts to the Garmin bridge through server routes.
- Garmin direct export attempts are tracked in `workout_exports`, including success, failure, partial, stale, and locally deleted states.
- Direct Garmin duplicate guardrails are built: already-exported workouts are not republished into Garmin; stale workouts use the manual update flow instead.
- Direct Garmin manual delete, manual stale-update, bulk publish, bulk maintenance, and explicit plan-deletion cleanup choices are available.
- Known limitation: automatic Garmin deletion/update is not built. The app only changes Garmin workouts after a direct user action.
- Settings includes a Direct Garmin Bridge troubleshooting panel.
- Strava OAuth connection and manual run import are available from Settings and Workouts.
- Strava import skips duplicate activities, non-runs, invalid runs, pre-plan runs, and active-plan days already covered by logged workouts.
- Initial plan generation can also use the Strava connection to fetch the last 42 days when saved app workout history is incomplete.
- Strava webhooks can store new activity events, process them server-side, and fall back to manual pending-event processing.
- Production deployment readiness has been documented for Vercel, Supabase, Strava, Intervals.icu, and the private Garmin bridge.
- The hosted Garmin deployment was infrastructure-only. No app UI, plan generation, or product functionality changed for that deployment.
- Gear tracking and AI feedback are not built yet.

## Environment variables

Copy `.env.example` to `.env.local` and fill in your own values.

This README is the short reference. For environment variables split by local
development, production Vercel, browser-safe values, server-only secrets, and
private Garmin bridge variables, use:

- [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md)
- [`docs/PRODUCTION_DEPLOYMENT.md`](docs/PRODUCTION_DEPLOYMENT.md)

Supabase:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not prefix it with
`NEXT_PUBLIC_`, never log it, and never use it in browser/client components.
It bypasses RLS and is only for trusted server-side tasks such as Strava OAuth
token writes and Strava webhook processing.

## Supabase Auth + RLS Setup

Milestone 9.5 adds real Supabase Auth and Row Level Security.

Before using a fresh Supabase project:

1. Review and apply the local Supabase migrations, including
   `supabase/migrations/20260522125923_milestone_9_5_auth_rls_hardening.sql`.
2. In Supabase Dashboard, open Authentication -> Email Templates -> Magic Link.
3. Make sure the email template shows the one-time code token, for example:

```html
<h2>Your Run.B*tch.app sign-in code</h2>
<p>Enter this code in the app:</p>
<p>{{ .Token }}</p>
```

4. Sign in from `/login` with your email and the code from the email.
5. For production, keep Supabase email signups enabled if you want trusted
   first-time users to create their account through the OTP login form.

If app data looks missing after enabling RLS, check `docs/AUTH_RLS.md`.

Intervals.icu:

```text
INTERVALS_ATHLETE_ID
INTERVALS_API_KEY
```

Keep `INTERVALS_API_KEY` server-only. Do not prefix it with `NEXT_PUBLIC_`.

Direct Garmin bridge:

```text
GARMIN_BRIDGE_URL
GARMIN_BRIDGE_API_KEY
GARMIN_BRIDGE_ACCESS_CLIENT_ID
GARMIN_BRIDGE_ACCESS_CLIENT_SECRET
GARMIN_BRIDGE_REQUEST_TIMEOUT_MS
```

For local development, the usual bridge URL is:

```text
GARMIN_BRIDGE_URL=http://127.0.0.1:8765
```

Keep all Garmin bridge variables server-only. Do not prefix them with
`NEXT_PUBLIC_`. The browser must never receive the bridge key or Cloudflare
Access service-token values.

For hosted production, Vercel may store only the server-side bridge variables
above. The production bridge URL is:

```text
GARMIN_BRIDGE_URL=https://garmin-bridge.runbitchapp.com
```

The bridge itself runs on an Oracle Cloud Ubuntu VPS bound to
`127.0.0.1:8765`; a Cloudflare Tunnel exposes the HTTPS hostname protected by
Cloudflare Access Service Auth, and the bridge still requires
`X-Garmin-Bridge-Key`.

The bridge host has its own environment variables:

```bash
cd local-garmin-bridge
source .venv/bin/activate
export GARMIN_BRIDGE_API_KEY="replace-with-a-long-random-local-key"
export GARMIN_TOKEN_DIR="/var/lib/run-coach-garmin/.garminconnect"
export GARMIN_BRIDGE_ENV="production"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

For local development, `GARMIN_TOKEN_DIR` and Cloudflare Access variables are
not required. Garmin login happens only in the bridge terminal or SSH session.
Do not store Garmin usernames, passwords, tokens, cookies, session files,
request headers, response headers, Cloudflare Access credentials, Cloudflare
tunnel tokens, or full Garmin responses in Supabase, browser responses, Vercel
logs, GitHub, screenshots, docs, or commits.

Never create these variables:

```text
NEXT_PUBLIC_GARMIN_BRIDGE_API_KEY
NEXT_PUBLIC_GARMIN_BRIDGE_ACCESS_CLIENT_SECRET
NEXT_PUBLIC_GARMIN_*
GARMIN_USERNAME
GARMIN_PASSWORD
GARMIN_COOKIES
GARMIN_TOKENS
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
```

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
SUPABASE_SERVICE_ROLE_KEY=your-server-only-supabase-service-role-or-secret-key

# Only needed when testing/managing Strava webhooks:
STRAVA_WEBHOOK_VERIFY_TOKEN=replace-with-a-long-random-token
STRAVA_WEBHOOK_CALLBACK_URL=https://your-public-app-url.example.com/api/strava/webhook
```

4. Make sure the Supabase migrations for Milestone 7 and Milestone 9.5 have
   been applied so Strava tables exist and user-owned rows are protected by RLS.
5. Sign in to the app with the email one-time-code flow.
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

## Strava Webhook Notes

Strava webhooks are configured separately from manual import. They are useful
after deployment because Strava needs a public callback URL.

Production callback URL:

```text
https://your-production-domain.example/api/strava/webhook
```

For this app:

- `activity/create` webhook events are stored and processed/imported when possible.
- `activity/update` and `activity/delete` webhook events are stored as ignored events.
- Manual Strava import remains the fallback if webhook delivery is delayed or unclear.
- Webhook ownership is derived from the saved Strava connection's athlete id,
  not from any incoming `user_id`.
- The webhook route uses the server-only Supabase service-role key because
  Strava does not send the app's Supabase session cookie.

For production setup and smoke tests, use
[`docs/PRODUCTION_DEPLOYMENT.md`](docs/PRODUCTION_DEPLOYMENT.md).

## Direct Garmin Bridge Notes

Intervals.icu remains the primary supported fallback export path. The Direct Garmin bridge is experimental, private, and personal-use only.

Use it when you specifically need Garmin pace targets that Intervals.icu does not preserve reliably. The Direct Garmin path has been manually verified to publish pace targets to a Forerunner watch, but it uses unofficial Garmin Connect internals through `python-garminconnect==0.3.3`, so it can break without notice.

Production status:

- Production bridge hostname: `https://garmin-bridge.runbitchapp.com`.
- The normal app production domain is separate from the bridge domain. The `runbitchapp.com` bridge hostname is infrastructure for the bridge and does not by itself mean the main app uses that domain.
- Vercel calls the bridge from server routes only.
- A normal browser/user cannot use the bridge hostname directly: without Cloudflare Access service auth, Cloudflare returns `403 Forbidden`; with Access but without `X-Garmin-Bridge-Key`, the bridge returns unauthorized.
- Secrets were rotated after setup. Documentation must not preserve old or current bridge keys, Cloudflare service-token values, Cloudflare tunnel tokens, Garmin account details, or sensitive terminal output.
- This bridge uses one Garmin session on the VPS. It is suitable for private/personal/friends-and-family MVP use, not a true per-user Garmin OAuth integration. Do not let multiple users connect separate Garmin accounts through this bridge until per-user session isolation is designed.
- Post-deployment validation passed for Garmin status, Garmin publish, Garmin pace targets, Intervals.icu fallback, manual logging, workout scoring, adaptive adjustment, dashboard/readiness, workout deletion, Strava manual import, and Strava webhook/fallback processing.

To use Direct Garmin locally:

1. Start the bridge from `local-garmin-bridge/`.
2. Make sure `GARMIN_BRIDGE_API_KEY` is exported in the bridge terminal.
3. Make sure the Next.js `.env.local` has matching `GARMIN_BRIDGE_URL` and `GARMIN_BRIDGE_API_KEY`.
4. Authenticate Garmin once through the bridge terminal.
5. Check Settings -> Direct Garmin Bridge status before publishing.

Common fixes:

- Bridge not configured: set `GARMIN_BRIDGE_URL` and `GARMIN_BRIDGE_API_KEY` in `.env.local`.
- Bridge not running: run `cd local-garmin-bridge && source .venv/bin/activate && python -m uvicorn app.main:app --host 127.0.0.1 --port 8765`.
- Hosted bridge unavailable: check the VPS `runcoach-garmin-bridge` service, the `cloudflared` service, Cloudflare Access Service Auth values in Vercel, and the bridge API key.
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
/lib/garminBridge  Server-only Next.js client for the private Garmin bridge
/lib/strava        Server-only Strava OAuth and manual import utilities
/local-garmin-bridge  Separate Python FastAPI Garmin bridge
/supabase          Database migrations
/tests             Node test suite for training and integration helpers
/types             Shared TypeScript types
```

## Next planned milestone

The initial plan generator is complete enough to treat as the app's current
source of truth. The next safe training milestone is to teach adaptive
adjustment logic about the richer generated prescriptions and metadata before
adding broad new features:

- keep training logic deterministic and rule-based;
- keep tightening the dashboard and active-plan reliability work as needed;
- update adjustment logic gradually so it understands workout intent, weekly
  caps, terrain load, and generated metadata;
- keep Intervals.icu as the primary workout export path;
- treat the direct Garmin local bridge as experimental even though pace-target publishing has been manually verified;
- keep Garmin cleanup explicit and user-confirmed; do not add silent automatic Garmin deletion/update.
