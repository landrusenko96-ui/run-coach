# Local Development Checklist

This document explains how to run Run.B*tch.app on your own computer without
changing production.

Local development means:

- the Next.js app runs at `http://localhost:3000`;
- secrets live in `.env.local`, which must not be committed;
- optional integrations can be tested one at a time;
- Direct Garmin can work only through the local Python bridge;
- production Vercel settings are not changed by local testing.

Direct Garmin remains experimental and private. In local development it works
only through the local Python bridge. Intervals.icu remains the primary
supported planned-workout export path.

## 1. Install And Run

Install dependencies:

```bash
npm install
```

Create local environment variables:

```bash
cp .env.example .env.local
```

Then edit `.env.local` with your own values.

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 2. Local Environment Variables

### Browser-Safe Local Variables

These can be used by browser code because they start with `NEXT_PUBLIC_`:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Optional legacy fallback:

```text
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as the preferred public Supabase
key. Keep `NEXT_PUBLIC_SUPABASE_ANON_KEY` only if an older local setup still
needs it.

Never create this variable:

```text
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
```

The service-role key must never be exposed to browser code.

### Server-Only Local Variables

These stay in `.env.local` and are read only by server routes:

```text
SUPABASE_SERVICE_ROLE_KEY
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
STRAVA_WEBHOOK_VERIFY_TOKEN
STRAVA_WEBHOOK_CALLBACK_URL
INTERVALS_ATHLETE_ID
INTERVALS_API_KEY
```

Use only the variables for integrations you are testing. Missing optional
integration variables should show a clear "not configured" message instead of
crashing the whole app.

Keep these values out of screenshots, commits, browser code, and logs:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRAVA_CLIENT_SECRET`
- Strava access/refresh tokens stored in Supabase
- `STRAVA_WEBHOOK_VERIFY_TOKEN`
- `INTERVALS_API_KEY`
- `GARMIN_BRIDGE_API_KEY`
- `GARMIN_BRIDGE_ACCESS_CLIENT_ID`
- `GARMIN_BRIDGE_ACCESS_CLIENT_SECRET`
- Garmin usernames, passwords, cookies, tokens, or session files

### Local-Only Garmin Bridge Variables

Only set these locally when you are running the Python bridge:

```text
GARMIN_BRIDGE_URL=http://127.0.0.1:8765
GARMIN_BRIDGE_API_KEY=replace-with-a-long-random-local-key
```

No Cloudflare Access variables are required for local development.

Also export the same key in the bridge terminal:

```bash
cd local-garmin-bridge
source .venv/bin/activate
export GARMIN_BRIDGE_API_KEY="replace-with-a-long-random-local-key"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

The bridge must stay bound to `127.0.0.1`. Do not expose it publicly and do not
deploy it to Vercel.

Do not create these local variables:

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

## 3. Supabase Local Notes

The local app can use the hosted Supabase project.

Before testing with a fresh Supabase project:

1. Apply migrations through Milestone 9.5.
2. Confirm Email provider is enabled in Supabase Auth.
3. Confirm the Magic Link email template includes `{{ .Token }}` so OTP login
   shows a code.
4. Add this redirect URL in Supabase Auth URL Configuration:

```text
http://localhost:3000/**
```

Email OTP login currently allows trusted first-time users to create their
account through the login form. RLS still protects user-owned rows by `user_id`.

## 4. Local Integration Notes

### Intervals.icu

Set these in `.env.local` only if testing Intervals export:

```text
INTERVALS_ATHLETE_ID
INTERVALS_API_KEY
```

If they are missing, Intervals export should show a clear missing-config
message.

### Strava

Set these in `.env.local` only if testing Strava manual import:

```text
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY
```

Add these only if testing or managing Strava webhooks:

```text
STRAVA_WEBHOOK_VERIFY_TOKEN
STRAVA_WEBHOOK_CALLBACK_URL
```

For local OAuth testing, set the Strava app Authorization Callback Domain to:

```text
localhost
```

Manual Strava import works from localhost after OAuth is configured.

Plain `localhost` cannot receive Strava webhook calls from the public internet.
For webhook testing, use the deployed Vercel URL or an intentional public
tunnel. Manual Strava import remains the fallback.

Webhook behavior to remember:

- new activity events, `activity/create`, are processed/imported when possible;
- activity update events are stored as ignored events;
- webhook status only shows events matched to the signed-in user's saved Strava
  athlete id.

### Direct Garmin

For local development, Direct Garmin uses the local Python bridge. The browser
calls only the Next.js server route. The Next.js server route calls the local
Python bridge. The browser must never call the Python bridge directly and must
never receive the bridge API key.

Use Direct Garmin only when:

- the local Python bridge is running;
- `GARMIN_BRIDGE_URL` and `GARMIN_BRIDGE_API_KEY` are set in `.env.local`;
- the same `GARMIN_BRIDGE_API_KEY` is exported in the bridge terminal;
- Garmin auth was completed in the bridge terminal.

## 5. Local Smoke Tests

Run these when you want to confirm local behavior still works:

1. Run `npm run dev`.
2. Sign in with email OTP.
3. Confirm the Sign out button appears in the header after login.
4. Open Dashboard, Profile, Goal, Plan, Workouts, and Settings.
5. Confirm Dashboard and Plan load the active plan.
6. Log one manual workout.
7. Confirm the workout receives a score.
8. If the workout should trigger an adaptive adjustment, confirm future
   planned workouts update and the reason is visible.
9. Test deletion only with disposable data.
10. If Intervals env vars are configured, publish one future planned workout.
11. If Intervals env vars are not configured, confirm the app shows a clear
    missing-config message.
12. With Garmin bridge env vars unset, confirm Direct Garmin shows unavailable.
13. If testing Direct Garmin locally, start the bridge and confirm Settings
    shows bridge status without exposing the bridge key.
14. If Strava env vars are configured, connect Strava and run manual import.
15. If webhook testing is configured with a public callback URL, create a new
    Strava activity and confirm a webhook event is stored or safely ignored.
16. Use Settings -> Process pending webhook events to confirm the fallback still
    works.

## 6. Local Verification Commands

Run these before committing meaningful code changes:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

If `npm run build` fails only because a restricted sandbox blocks Turbopack from
binding an internal local port, rerun it in a normal terminal.

## 7. Local Troubleshooting

- App cannot connect to Supabase: check `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Login email has a link but no code: update the Supabase Magic Link template
  to include `{{ .Token }}`.
- Strava OAuth redirects to the wrong place: check `NEXT_PUBLIC_APP_URL`.
- Manual Strava import works but webhooks do not show events: check whether
  Strava sent POST requests to the public callback URL, and remember that
  updates are ignored while new activity creates are processed.
- Intervals export fails immediately: check `INTERVALS_ATHLETE_ID` and
  `INTERVALS_API_KEY`.
- Direct Garmin unavailable locally: check `.env.local`, bridge terminal env,
  bridge process, and Garmin auth status.
