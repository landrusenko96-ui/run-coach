# Production Deployment Checklist

Milestone 10 makes the app safer to deploy on Vercel/Supabase while keeping
local development unchanged. This document is the beginner-readable checklist
for what to configure and what to smoke test.

Direct Garmin remains local-only and experimental. Intervals.icu remains the
primary supported planned-workout export path.

## Environment Variables

Rule of thumb:

- Variables starting with `NEXT_PUBLIC_` can be read by browser code.
- Variables without `NEXT_PUBLIC_` must stay server-only unless this file says
  otherwise.
- Never create `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
- Never put Garmin bridge variables in Vercel.

### Browser-Safe `NEXT_PUBLIC` Variables

Set these in `.env.local` for local development and in Vercel for production:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL
```

`NEXT_PUBLIC_APP_URL` should be the exact app base URL:

```text
# Local
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Production
NEXT_PUBLIC_APP_URL=https://your-production-domain.example
```

Optional legacy fallback:

```text
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as the preferred public Supabase key.
Only keep `NEXT_PUBLIC_SUPABASE_ANON_KEY` if an older local setup still needs
it.

### Server-Only Variables

Set these in `.env.local` when you use the matching integration locally. Set
them in Vercel Production when you want that integration to work in production.

```text
SUPABASE_SERVICE_ROLE_KEY
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
STRAVA_WEBHOOK_VERIFY_TOKEN
STRAVA_WEBHOOK_CALLBACK_URL
INTERVALS_ATHLETE_ID
INTERVALS_API_KEY
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is used only by trusted
  server-side Strava token and webhook routes.
- `STRAVA_CLIENT_ID` is not highly secret, but this app reads it on the server.
- `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, and
  `INTERVALS_API_KEY` are secrets.
- `STRAVA_WEBHOOK_CALLBACK_URL` is a public URL, but keep it server-side because
  only server routes need it.
- If an optional integration is missing, the app should show a clear
  "not configured" message instead of crashing the whole app.

### Local-Only Garmin Bridge Variables

Set these only in local development when running the local Python bridge:

```text
GARMIN_BRIDGE_URL=http://127.0.0.1:8765
GARMIN_BRIDGE_API_KEY=replace-with-a-long-random-local-key
```

Also export the same bridge key in the local bridge terminal:

```bash
cd local-garmin-bridge
source .venv/bin/activate
export GARMIN_BRIDGE_API_KEY="replace-with-a-long-random-local-key"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

Do not configure these in Vercel:

```text
GARMIN_BRIDGE_URL
GARMIN_BRIDGE_API_KEY
```

In production, Direct Garmin should show as unavailable. That is expected.

### Production Vercel Variables

In Vercel Project Settings -> Environment Variables, set these for Production:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=https://your-production-domain.example
SUPABASE_SERVICE_ROLE_KEY
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
STRAVA_WEBHOOK_VERIFY_TOKEN
STRAVA_WEBHOOK_CALLBACK_URL=https://your-production-domain.example/api/strava/webhook
INTERVALS_ATHLETE_ID
INTERVALS_API_KEY
```

Optional:

```text
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Leave these unset in Vercel:

```text
GARMIN_BRIDGE_URL
GARMIN_BRIDGE_API_KEY
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
```

Vercel lets each environment variable apply to Production, Preview,
Development, or custom environments. For this milestone, configure Production
first. Add Preview variables only when you are ready to test preview deploys.

## Dashboard Setup Steps

### Vercel

1. Open the Vercel project.
2. Go to Settings -> Environment Variables.
3. Add the Production variables listed above.
4. Confirm no Garmin bridge variables are set in Vercel.
5. Deploy from the production branch.
6. After deploy, open the production domain and run the production smoke tests
   below.

### Supabase

Before first production use:

1. Confirm migrations through Milestone 9.5 have already been applied.
2. Create the app owner user manually in Supabase Auth.
3. Keep production signup closed to unapproved users. The app calls
   `signInWithOtp` with `shouldCreateUser: false`, so unknown emails cannot
   create accounts through the login form.
4. Go to Authentication -> URL Configuration.
5. Set Site URL to:

```text
https://your-production-domain.example
```

6. Add redirect URLs for production and local development:

```text
https://your-production-domain.example/**
http://localhost:3000/**
```

Use exact production redirect URLs where possible. Use wildcards mainly for
local development and Vercel preview URLs.

7. Go to Authentication -> Email Templates -> Magic Link.
8. Make sure the email contains the one-time code token:

```html
<h2>Your Run.B*tch.app sign-in code</h2>
<p>Enter this code in the app:</p>
<p>{{ .Token }}</p>
```

9. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never add a
   `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` variable.

### Strava

In the Strava API app settings:

1. Set Authorization Callback Domain to the production domain host, without
   protocol. Example:

```text
your-production-domain.example
```

2. Keep local development allowed with `localhost` when testing locally.
3. Set the app callback URL through the Vercel env var:

```text
STRAVA_WEBHOOK_CALLBACK_URL=https://your-production-domain.example/api/strava/webhook
```

4. After deployment, use Settings in the app to create/check the webhook
   subscription.
5. The webhook endpoint is public because Strava does not send the app's
   Supabase session cookie. It stores events with the server-only service-role
   key and then processes them against the matching saved Strava connection.
6. The app must continue to derive ownership from the saved Strava connection's
   athlete id. Do not trust a `user_id` from any incoming webhook body.

Strava validates webhooks by sending a GET request with `hub.challenge`. The app
must respond quickly with the same challenge in JSON.

## Local Smoke Tests

Run these before deploying when you want confidence that local development still
works:

1. Start the app:

```bash
npm run dev
```

2. Sign in with a Supabase user that already exists.
3. Open Dashboard, Profile, Goal, Plan, Workouts, and Settings.
4. Confirm the active plan loads on Dashboard and Plan.
5. Log a manual workout from Workouts.
6. Confirm the workout receives a score.
7. If the workout score should trigger an adaptive adjustment, confirm the
   adjustment appears and future planned workouts are updated.
8. Test deletion only on a disposable plan or data you are comfortable removing.
9. If Intervals env vars are configured, publish one future planned workout. If
   they are not configured, confirm the app shows a clear missing-config
   message.
10. With Garmin bridge env vars unset, confirm Direct Garmin shows unavailable.
11. If testing Direct Garmin locally, start the Python bridge and confirm
    Settings shows the bridge status without exposing the bridge key.
12. If Strava env vars are configured, connect Strava and run manual import for
    the latest 7 days.
13. For local webhook testing, use a public callback URL or tunnel only if you
    intentionally configured one. Confirm a webhook event can be stored and
    processed, or rely on the automated webhook tests if local public callback
    testing is not set up.
14. Use Settings -> Process pending webhook events to confirm the manual
    fallback still works.

## Production Smoke Tests

Run these after a Vercel production deploy:

1. Sign in with the manually-created owner email.
2. Confirm an unknown/unapproved email cannot create a new app account from the
   login form.
3. Open Dashboard, Profile, Goal, Plan, Workouts, and Settings.
4. Confirm Dashboard and Plan show the active plan.
5. Log one manual workout.
6. Confirm workout scoring works.
7. If the log should trigger an adaptive adjustment, confirm the adjustment is
   shown and future planned workouts are updated.
8. Test deletion only on a disposable plan or data you are comfortable removing.
9. Confirm Intervals export works for one future planned workout.
10. In Settings, confirm Direct Garmin says unavailable in hosted production.
11. Connect Strava.
12. Run manual Strava import for the latest 7 days.
13. Create/check the Strava webhook subscription from Settings.
14. Record or update a small Strava test activity, then confirm webhook status
    shows a recent stored event.
15. Confirm automatic webhook processing imported, skipped, or safely ignored
    the event.
16. Use Process pending webhook events as the manual fallback if any event is
    pending or failed.
17. Check `/api/supabase-test` while signed in.
18. Check Vercel logs only for high-level errors. Do not paste secrets, request
    headers, provider tokens, Garmin credentials, or full provider responses
    into issues or docs.

## Verification Commands

Run these after Milestone 10 changes:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Known note: `npm run build` can fail inside a restricted sandbox because
Turbopack may bind an internal local port. If that happens, rerun the same
command in a normal local terminal.

Next.js currently prints a middleware-to-proxy deprecation warning during
build. Treat that as a future cleanup task, not a Milestone 10 blocker.

## Reference Docs

- Vercel environment variables:
  `https://vercel.com/docs/environment-variables`
- Supabase Auth redirect URLs:
  `https://supabase.com/docs/guides/auth/redirect-urls`
- Supabase passwordless email/OTP:
  `https://supabase.com/docs/guides/auth/auth-email-passwordless`
- Strava OAuth:
  `https://developers.strava.com/docs/authentication/`
- Strava webhooks:
  `https://developers.strava.com/docs/webhooks/`
