# Production Deployment Checklist

Milestone 10 made the app safer to deploy on Vercel/Supabase. Milestone 11B
adds the private hosted Direct Garmin bridge option. This document is the
beginner-readable checklist for what to configure and what to smoke test.

Direct Garmin remains experimental and private. Intervals.icu remains the
primary supported planned-workout export path and the rollback/fallback path.

Current production app URL used during Milestone 10 setup:

```text
https://run-coach-tau.vercel.app
```

If you move to a different Vercel domain later, replace that URL everywhere in
Vercel, Supabase, and Strava settings.

For local development setup, use
[`docs/LOCAL_DEVELOPMENT.md`](LOCAL_DEVELOPMENT.md).

## Environment Variables

Rule of thumb:

- Variables starting with `NEXT_PUBLIC_` can be read by browser code.
- Variables without `NEXT_PUBLIC_` must stay server-only unless this file says
  otherwise.
- Never create `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
- Garmin bridge variables may exist in Vercel only as server-only variables for
  the private hosted bridge. Never prefix Garmin bridge variables with
  `NEXT_PUBLIC_`.

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

### Direct Garmin Bridge Variables

Local development can use only these values:

```text
GARMIN_BRIDGE_URL=http://127.0.0.1:8765
GARMIN_BRIDGE_API_KEY=replace-with-a-long-random-local-key
```

No Cloudflare Access values are required for local development.

Hosted production now uses a private Oracle Cloud Ubuntu VPS bridge behind
Cloudflare Tunnel and Cloudflare Access Service Auth:

```text
GARMIN_BRIDGE_URL=https://garmin-bridge.runbitchapp.com
GARMIN_BRIDGE_API_KEY=replace-with-a-long-random-bridge-key
GARMIN_BRIDGE_ACCESS_CLIENT_ID=from-cloudflare-access-service-auth
GARMIN_BRIDGE_ACCESS_CLIENT_SECRET=from-cloudflare-access-service-auth
GARMIN_BRIDGE_REQUEST_TIMEOUT_MS=15000
```

The production bridge server stores only:

```text
GARMIN_BRIDGE_API_KEY=replace-with-the-same-long-random-bridge-key
GARMIN_TOKEN_DIR=/var/lib/run-coach-garmin/.garminconnect
GARMIN_BRIDGE_ENV=production
```

Sensitive values include the bridge API key, Cloudflare Access service-token
client id/secret, Cloudflare tunnel token, Garmin session files/tokens/cookies,
Garmin passwords, and full Garmin responses. Do not commit them, paste them
into docs/issues/screenshots, log them, or store them in Supabase.

The normal production app domain is separate from the bridge domain.
`runbitchapp.com` is currently used for bridge infrastructure and does not by
itself mean the main app uses that domain.

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
GARMIN_BRIDGE_URL
GARMIN_BRIDGE_API_KEY
GARMIN_BRIDGE_ACCESS_CLIENT_ID
GARMIN_BRIDGE_ACCESS_CLIENT_SECRET
GARMIN_BRIDGE_REQUEST_TIMEOUT_MS
```

Never create these variables in Vercel:

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

Vercel lets each environment variable apply to Production, Preview,
Development, or custom environments. For this milestone, configure Production
first. Add Preview variables only when you are ready to test preview deploys.

## Dashboard Setup Steps

### Vercel

1. Open the Vercel project.
2. Go to Settings -> Environment Variables.
3. Add the Production variables listed above.
4. If using the hosted Garmin bridge, add the Garmin bridge variables as
   Production server-only variables. If not, leave them unset and use
   Intervals.icu.
5. Deploy from the production branch.
6. After deploy, open the production domain and run the production smoke tests
   below.

### Production Hosted Garmin Bridge

The hosted Garmin bridge production deployment is complete. This was an
infrastructure-only change: no app UI, app behavior, plan generation, or GitHub
application code changed during the deployment.

Current production architecture:

```text
Vercel Next.js server route
  -> Cloudflare Access protected hostname
  -> Cloudflare Tunnel
  -> Python FastAPI bridge on Oracle Cloud Ubuntu VPS
  -> Garmin Connect through python-garminconnect
```

Current production facts:

- Bridge hostname: `https://garmin-bridge.runbitchapp.com`
- VPS provider/OS: Oracle Cloud Ubuntu
- SSH/admin user: `ubuntu`
- Dedicated bridge service user: `garmin-bridge`
- Bridge systemd service: `runcoach-garmin-bridge`
- Tunnel systemd service: `cloudflared`
- Bridge bind address: `127.0.0.1:8765`
- Firewall: UFW active, only OpenSSH allowed inbound
- Port `8765`: not publicly open
- Garmin token/session directory:
  `/var/lib/run-coach-garmin/.garminconnect`

Expected external access behavior:

- Without Cloudflare Access service-token headers, Cloudflare returns
  `403 Forbidden`.
- With Cloudflare Access but without `X-Garmin-Bridge-Key`, the bridge returns
  unauthorized.
- With both Cloudflare Access service-token headers and `X-Garmin-Bridge-Key`,
  `/garmin/status` returns authenticated when the saved Garmin session is valid.

Production operations:

```bash
sudo systemctl status runcoach-garmin-bridge
sudo systemctl status cloudflared
sudo systemctl restart runcoach-garmin-bridge
```

Use `journalctl` only for high-level troubleshooting. Do not paste logs into
issues or docs if they include request headers, tokens, session paths, Garmin
account details, cookies, or provider response bodies.

Garmin authentication was completed manually over SSH. In production mode,
`/docs`, `/redoc`, `/openapi.json`, and `/garmin/auth/start` are restricted or
hidden. Future Garmin re-authentication should be done over SSH only with a
temporary local-mode bridge process bound to `127.0.0.1`, never through a
public browser route.

Rotate the bridge API key:

1. Generate a new long random bridge key locally.
2. Update the VPS bridge env file with the new `GARMIN_BRIDGE_API_KEY`.
3. Update Vercel Production `GARMIN_BRIDGE_API_KEY` with the same new value.
4. Restart `runcoach-garmin-bridge`.
5. Redeploy Vercel so the server routes use the new value.
6. Verify Settings -> Direct Garmin Bridge status from the production app.

Rotate the Cloudflare Access service token:

1. Create a new Cloudflare Access service token for the bridge application.
2. Update Vercel Production `GARMIN_BRIDGE_ACCESS_CLIENT_ID` and
   `GARMIN_BRIDGE_ACCESS_CLIENT_SECRET`.
3. Redeploy Vercel.
4. Verify production Garmin status from the app.
5. Revoke the old Cloudflare Access service token after the new one works.

Rotate the Cloudflare tunnel token:

1. Rotate or recreate the tunnel token in Cloudflare.
2. Update the `cloudflared` service configuration on the VPS without writing
   the token into this repo or docs.
3. Restart `cloudflared`.
4. Confirm the bridge hostname still reaches the local bridge through
   Cloudflare Access.
5. Revoke the old tunnel token after the new tunnel is healthy.

Rollback:

1. Remove the Vercel Garmin bridge env vars:

```bash
vercel env rm GARMIN_BRIDGE_URL production
vercel env rm GARMIN_BRIDGE_API_KEY production
vercel env rm GARMIN_BRIDGE_ACCESS_CLIENT_ID production
vercel env rm GARMIN_BRIDGE_ACCESS_CLIENT_SECRET production
vercel env rm GARMIN_BRIDGE_REQUEST_TIMEOUT_MS production
```

2. Redeploy Vercel.
3. Confirm Direct Garmin shows unavailable in the app.
4. Continue using Intervals.icu as the fallback export path.
5. Optionally stop bridge infrastructure if you want it offline:

```bash
sudo systemctl stop cloudflared
sudo systemctl stop runcoach-garmin-bridge
```

Architecture limitation:

This setup uses one Garmin session on the VPS. It is suitable for
private/personal/friends-and-family MVP use, but it is not a true per-user
Garmin OAuth integration. Do not let multiple users connect separate Garmin
accounts through this bridge until per-user Garmin session isolation is
designed.

Post-deployment validation passed:

- Production Garmin status works from the app.
- Production Garmin publish works from the app.
- Garmin pace targets appear correctly.
- Intervals.icu fallback still works.
- Manual logging, workout scoring, adaptive adjustment, dashboard/readiness,
  workout deletion, Strava manual import, and Strava webhook/fallback
  processing still work.

### Supabase

Before first production use:

1. Confirm migrations through Milestone 9.5 have already been applied.
2. Keep the Email provider enabled.
3. Keep email signups enabled if you want trusted first-time users to create
   their own account through the OTP login form. The app calls `signInWithOtp`
   with `shouldCreateUser: true`.
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

Webhook behavior to remember:

- `activity/create` events are stored and processed/imported when possible.
- `activity/update` and `activity/delete` events are stored as ignored events.
- The app does not trust `user_id` from incoming webhook payloads. It derives
  ownership from the saved Strava connection's athlete id.
- The Settings webhook status shows events matched to the signed-in user's
  saved Strava athlete id. If Strava sends an event for a different athlete id,
  it may be stored but not shown to that user.

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
    If testing a private hosted bridge, confirm Settings shows bridge status
    without exposing the bridge key, Cloudflare Access values, token paths, or
    filesystem paths.
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

1. Sign in with the email you want to use in production.
2. If this is the first time that email is used, confirm the OTP login creates
   the account and opens the app.
3. Open Dashboard, Profile, Goal, Plan, Workouts, and Settings.
4. Confirm Dashboard and Plan show the active plan.
5. Log one manual workout.
6. Confirm workout scoring works.
7. If the log should trigger an adaptive adjustment, confirm the adjustment is
   shown and future planned workouts are updated.
8. Test deletion only on a disposable plan or data you are comfortable removing.
9. Confirm Intervals export works for one future planned workout.
10. In Settings, confirm Direct Garmin either says unavailable when Garmin
    bridge env vars are unset, or shows reachable/authenticated when the
    private hosted bridge is configured. It must not expose the bridge key,
    Cloudflare Access values, token paths, or filesystem paths.
11. Connect Strava.
12. Run manual Strava import for the latest 7 days.
13. Create/check the Strava webhook subscription from Settings.
14. Create a small new Strava test activity, then confirm webhook status shows
    a recent stored event. Editing an old activity is useful only for checking
    ignored `activity/update` events; it should not import a workout.
15. Confirm automatic webhook processing imported, skipped, or safely ignored
    the new-activity event.
16. Use Process pending webhook events as the manual fallback if any event is
    pending or failed.
17. Check `/api/supabase-test` while signed in.
18. Check Vercel logs only for high-level errors. Do not paste secrets, request
    headers, provider tokens, Garmin credentials, or full provider responses
    into issues or docs.

## Verification Commands

Run these after Milestone 11B changes:

```bash
npm run typecheck
npm run lint
npm run test
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
