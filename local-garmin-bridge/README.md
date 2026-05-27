# Garmin Bridge

This is an experimental private bridge for Direct Garmin export.

It is separate from the Next.js app. It must stay private and is not a public
Garmin integration.

Local development runs it on `127.0.0.1:8765`. Hosted production runs on an
Oracle Cloud Ubuntu VPS bound to `127.0.0.1:8765`, exposed only through
Cloudflare Tunnel and Cloudflare Access Service Auth at
`https://garmin-bridge.runbitchapp.com`. The bridge still requires
`X-Garmin-Bridge-Key`.

## Current Status

This checkpoint uses `python-garminconnect==0.3.3` for Garmin authentication, workout upload, and calendar scheduling.

- Garmin authentication happens from the bridge terminal or an SSH session on
  the bridge host.
- Local Garmin session tokens are saved only in
  `local-garmin-bridge/.garminconnect/garmin_tokens.json`.
- Hosted Garmin session tokens are saved only in `GARMIN_TOKEN_DIR`, usually
  `/var/lib/run-coach-garmin/.garminconnect`.
- Production currently runs as the `runcoach-garmin-bridge` systemd service
  under the `garmin-bridge` service user. Cloudflare Tunnel runs as the
  `cloudflared` systemd service. SSH/admin access uses the `ubuntu` user.
- Production re-authentication must be done over SSH only. Do not use public
  browser routes for Garmin login.
- The previous Garth new-login path is retired for this bridge because new login failed.
- The bridge can preview and publish one running workout per request.
- The bridge supports pace targets in `sec_per_km`, including simple runs and one-level interval repeats.
- The Next.js app now has single-workout Direct Garmin preview/publish UI.
- The Next.js app now has Plan-page bulk Direct Garmin preview/publish for the next 7 or 14 days. Bulk publish calls this bridge sequentially, one workout at a time.
- The Next.js app records Direct Garmin export attempts in `workout_exports`.
- The Next.js app has duplicate, stale, partial, manual update, manual delete, and local deleted-status guardrails.
- Manual bridge-level Garmin workout deletion is available through `POST /garmin/workouts/delete`.
- Manual app-driven Garmin delete and stale-update are built.
- Known limitation: automatic Garmin delete/update is not built; Garmin cleanup stays explicit and user-confirmed.
- Intervals.icu remains the primary supported export path.

## Validated Checkpoint

On 2026-05-13, the bridge uploaded and scheduled one simple running workout named `Run Coach Garmin Pace Test May 13`.

- Garmin workout ID: `1566821421`
- Garmin schedule ID: `1648396171`
- Manual verification: the workout appeared on the Forerunner and showed pace targets on the watch, not `No Target`.

This validates the first narrow pace-target export path. The bridge remains experimental because it uses unofficial Garmin Connect internals and because Garmin cleanup still requires explicit user action and manual verification.

## Important Constraints

- Private only.
- Personal use only.
- Uses unofficial Garmin Connect APIs.
- Unofficial Garmin APIs can break without notice.
- Do not store Garmin usernames, passwords, tokens, or session data in Supabase or the Next.js app.
- Do not log secrets, tokens, passwords, request headers, response headers, Cloudflare Access values, or full Garmin responses.
- Do not commit `local-garmin-bridge/.garminconnect/`; it contains private local Garmin session tokens after login.
- Do not commit `local-garmin-bridge/.garminconnect-spike/` or `local-garmin-bridge/.garth/` if they exist from earlier experiments.
- Do not put Garmin credentials in `.env.example`, screenshots, issue comments, or docs.
- Do not expose this bridge publicly or run it as a public unauthenticated service.
- Do not deploy this Python bridge to Vercel.
- Keep Intervals.icu as the fallback export path.
- Treat Garmin API success as incomplete until Garmin Connect and the watch are manually checked.
- Do not expect the app to silently delete or update existing Garmin workouts. Manual update, manual delete, bulk maintenance, and plan-deletion cleanup choices require user action.
- Do not delete past Garmin workouts by default. The manual delete endpoint requires `schedule_date` and blocks past dates before calling Garmin.

## Setup

From this directory:

```bash
python3.14 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

The bridge needs Python 3.12 or newer. This local machine currently uses Python 3.14.

Create a local API key for the bridge before running it:

```bash
export GARMIN_BRIDGE_API_KEY="replace-with-a-long-random-local-key"
```

The `.env.example` file shows the required variable name only. It must not contain Garmin credentials.

Hosted production variables on the bridge server:

```text
GARMIN_BRIDGE_API_KEY=replace-with-the-vps-bridge-key
GARMIN_TOKEN_DIR=/var/lib/run-coach-garmin/.garminconnect
GARMIN_BRIDGE_ENV=production
```

When `GARMIN_BRIDGE_ENV=production`, `/docs` and `/openapi.json` return 404,
`/redoc` returns 404, and `/garmin/auth/start` is disabled. Do the initial
Garmin login or any future re-auth through a temporary interactive local-mode
bridge process over SSH, then restart the systemd service in production mode.

The production VPS should keep UFW active with only OpenSSH allowed inbound.
Port `8765` must not be publicly open.

## Run

Use this command from `local-garmin-bridge/`:

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

The `127.0.0.1` host is intentional. It keeps the bridge bound to your own computer. Do not run it on `0.0.0.0` and do not expose it publicly.

If your shell says `python: command not found`, activate the bridge virtual environment first:

```bash
source .venv/bin/activate
```

After activation, `python` should point to the Python inside `.venv`. If needed, use your installed Python command directly, for example:

```bash
python3.14 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

Then open:

```text
http://127.0.0.1:8765/health
```

`GET /health` is public so you can confirm the bridge is running without a key.

All other endpoints require this request header:

```text
X-Garmin-Bridge-Key: your-local-api-key
```

## First Garmin Login

For the first Garmin login, use two terminals.

In terminal 1, start the bridge without `--reload` so credential and MFA prompts work reliably:

```bash
cd local-garmin-bridge
source .venv/bin/activate
export GARMIN_BRIDGE_API_KEY="replace-with-a-long-random-local-key"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

In terminal 2, trigger login:

```bash
curl -X POST \
  -H "X-Garmin-Bridge-Key: replace-with-a-long-random-local-key" \
  http://127.0.0.1:8765/garmin/auth/start
```

Then go back to terminal 1. The bridge will ask for Garmin email, password, and MFA code if Garmin requires MFA.

The password is read only in the terminal and is not saved by the bridge. If login succeeds, `python-garminconnect` saves session tokens in:

```text
local-garmin-bridge/.garminconnect/garmin_tokens.json
```

Those token files are private. They are ignored by git and must not be committed or shared.

Verify the saved session:

```bash
curl \
  -H "X-Garmin-Bridge-Key: replace-with-a-long-random-local-key" \
  http://127.0.0.1:8765/garmin/status
```

## Direct Garmin Publish Contract

The bridge accepts one flat app-native request shape. The Next.js server-side routes should send this shape to the bridge; the bridge does not query Supabase and does not need a Supabase client, URL, key, or user session.

The Next.js app must not send Garmin usernames, passwords, cookies, tokens, or session files. Garmin authentication stays local to the bridge.

Supported checkpoint shape:

- sport is `Run`;
- executable steps use time in seconds or distance in meters;
- open duration is allowed only on repeat wrapper steps, not leaf workout steps;
- pace targets use `sec_per_km`;
- one-level repeat blocks are supported for interval workouts;
- nested repeats are not supported;
- heart-rate and RPE targets may be counted for diagnostics but are not supported for Direct Garmin upload in this bridge checkpoint.

Request fields:

```json
{
  "planned_workout_id": "manual-garmin-test-1",
  "workout_name": "Run Coach Garmin Pace Test",
  "workout_date": "2026-05-20",
  "sport": "Run",
  "source_app_version": "0.1.0",
  "dry_run": true,
  "structured_workout": {
    "version": 1,
    "sport": "Run",
    "name": "Run Coach Garmin Pace Test",
    "description": "Optional workout description.",
    "exportSafe": true,
    "exportWarnings": [],
    "steps": [
      {
        "id": "easy-run",
        "type": "work",
        "name": "Easy run",
        "durationType": "time",
        "durationValue": 1800,
        "durationUnit": "seconds",
        "targetType": "pace",
        "targetMin": 360,
        "targetMax": 420,
        "targetUnit": "sec_per_km",
        "notes": "Optional coach notes."
      }
    ]
  }
}
```

Response fields:

```json
{
  "ok": true,
  "status": "DRY_RUN",
  "planned_workout_id": "manual-garmin-test-1",
  "garmin_workout_id": null,
  "garmin_schedule_id": null,
  "scheduled_date": "2026-05-20",
  "schedule_summary": null,
  "warnings": [
    "Experimental Garmin direct export: API success still requires manual Garmin Connect and watch verification.",
    "Dry run only: no Garmin API call was made."
  ],
  "error": null,
  "target_summary": {
    "target_type": "pace",
    "target_min": 360,
    "target_max": 420,
    "target_unit": "sec_per_km",
    "display": "pace: 360-420 sec_per_km"
  },
  "debug_summary": {
    "dry_run": true,
    "client_library": "python-garminconnect",
    "client_version": "0.3.3",
    "generated_step_count": 1
  }
}
```

`debug_summary` is for safe local diagnostics only. It must not include secrets, tokens, cookies, request headers, Garmin response bodies, or credentials.

Allowed publish statuses:

- `PUBLISHED`
- `DRY_RUN`
- `INVALID_WORKOUT`
- `AUTH_REQUIRED`
- `GARMIN_REJECTED`
- `UPLOADED_NOT_SCHEDULED`

For real publish, `ok` is `true` only when both upload and schedule succeed. If upload succeeds but schedule fails, the bridge returns `UPLOADED_NOT_SCHEDULED` with the Garmin workout ID and a warning that manual cleanup may be needed in Garmin Connect.

## Garmin Payload Preview

`POST /garmin/workouts/preview` accepts the same request shape as publish. It validates and converts the workout to a local Garmin payload preview, but it never authenticates with Garmin, uploads, or schedules anything.

Preview response fields:

```json
{
  "ok": true,
  "target_summary": {
    "target_type": "pace",
    "target_min": 360,
    "target_max": 420,
    "target_unit": "sec_per_km",
    "display": "pace: 360-420 sec_per_km"
  },
  "step_count": 1,
  "repeat_count": 0,
  "pace_target_count": 1,
  "hr_target_count": 0,
  "warnings": [
    "Experimental Garmin direct export: API success still requires manual Garmin Connect and watch verification."
  ],
  "error": null,
  "garmin_payload_preview": {
    "workoutName": "Run Coach Garmin Pace Test"
  }
}
```

Use preview before real publish. It proves the bridge can see pace targets before Garmin is called.

## Dry-Run Test

Dry-run validates and maps the request without calling Garmin:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Garmin-Bridge-Key: replace-with-a-long-random-local-key" \
  -d '{
    "planned_workout_id": "manual-garmin-test-1",
    "workout_name": "Run Coach Garmin Pace Test",
    "workout_date": "2026-05-20",
    "sport": "Run",
    "source_app_version": "0.1.0",
    "dry_run": true,
    "structured_workout": {
      "version": 1,
      "sport": "Run",
      "name": "Run Coach Garmin Pace Test",
      "exportSafe": true,
      "exportWarnings": [],
      "steps": [
        {
          "id": "easy-run",
          "type": "work",
          "name": "Easy run",
          "durationType": "time",
          "durationValue": 1800,
          "durationUnit": "seconds",
          "targetType": "pace",
          "targetMin": 360,
          "targetMax": 420,
          "targetUnit": "sec_per_km"
        }
      ]
    }
  }' \
  http://127.0.0.1:8765/garmin/workouts/publish
```

To check only the Garmin payload preview, send the same body to:

```text
http://127.0.0.1:8765/garmin/workouts/preview
```

## Simple Publish Test

Real publish uses the same request shape with `dry_run` set to `false` or omitted:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Garmin-Bridge-Key: replace-with-a-long-random-local-key" \
  -d '{
    "planned_workout_id": "manual-garmin-test-1",
    "workout_name": "Run Coach Garmin Pace Test",
    "workout_date": "2026-05-20",
    "sport": "Run",
    "structured_workout": {
      "version": 1,
      "sport": "Run",
      "name": "Run Coach Garmin Pace Test",
      "exportSafe": true,
      "exportWarnings": [],
      "steps": [
        {
          "id": "easy-run",
          "type": "work",
          "name": "Easy run",
          "durationType": "time",
          "durationValue": 1800,
          "durationUnit": "seconds",
          "targetType": "pace",
          "targetMin": 360,
          "targetMax": 420,
          "targetUnit": "sec_per_km"
        }
      ]
    }
  }' \
  http://127.0.0.1:8765/garmin/workouts/publish
```

Repeated direct publish calls to this bridge can create duplicate Garmin workouts. The Next.js app blocks republish when a Garmin workout ID already exists and uses manual update/delete flows for already-exported workouts. The bridge publish endpoint itself still does not de-duplicate Garmin workouts.

After publishing, manually verify:

1. Garmin Connect shows the workout on the scheduled date.
2. The Forerunner receives the workout after sync.
3. The watch shows a pace target, not `No Target`.

## Manual Delete Test

`POST /garmin/workouts/delete` manually deletes a Garmin workout by `garmin_workout_id` when the installed `python-garminconnect` client supports `delete_workout`.

This is bridge-level support. The Next.js app uses it only through explicit user actions such as Delete from Garmin, Update Garmin Export, selected bulk maintenance, or the plan-deletion cleanup choice. The app does not silently delete old Garmin workouts when a planned workout changes.

Safety behavior:

- `schedule_date` is optional in the request model but required by the endpoint in this first safe version.
- If `schedule_date` is missing, the bridge returns `SCHEDULE_DATE_REQUIRED` and does not call Garmin.
- If `schedule_date` is in the past, the bridge returns `PAST_WORKOUT_BLOCKED` and does not call Garmin.
- Today and future dates are allowed.
- The bridge cannot know whether a Garmin workout was completed, so later app integration must avoid calling this endpoint for completed app workouts.
- If full workout deletion is not available but safe unscheduling is available, the bridge can unschedule the workout and returns `UNSCHEDULED_ONLY`.
- If neither deletion nor safe unscheduling is available, the bridge returns `NOT_SUPPORTED`.

Request:

```json
{
  "planned_workout_id": "manual-garmin-test-1",
  "garmin_workout_id": "12345",
  "schedule_date": "2026-05-20"
}
```

Response:

```json
{
  "ok": true,
  "status": "DELETED",
  "planned_workout_id": "manual-garmin-test-1",
  "garmin_workout_id": "12345",
  "warnings": [
    "Garmin delete request completed.",
    "The bridge cannot verify completed-workout status; callers must avoid deleting completed workouts.",
    "Manual verification recommended: confirm the workout is gone from Garmin Connect and the watch."
  ],
  "error": null
}
```

Example:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Garmin-Bridge-Key: replace-with-a-long-random-local-key" \
  -d '{
    "planned_workout_id": "manual-garmin-test-1",
    "garmin_workout_id": "12345",
    "schedule_date": "2026-05-20"
  }' \
  http://127.0.0.1:8765/garmin/workouts/delete
```

Never treat a delete response as final until Garmin Connect and the watch have been checked manually.

## API Docs

In local development, the docs routes are protected by the bridge key:

```text
http://127.0.0.1:8765/docs
http://127.0.0.1:8765/openapi.json
```

A normal browser tab cannot attach `X-Garmin-Bridge-Key` to the `/openapi.json` request that the docs page makes. For protected docs, use a header-aware client such as curl, Postman, or an API client extension.

In `GARMIN_BRIDGE_ENV=production`, `/docs`, `/redoc`, and `/openapi.json`
return 404.

## Endpoints

- `GET /health` - public
- `GET /garmin/status` - requires `X-Garmin-Bridge-Key`
- `POST /garmin/auth/start` - requires `X-Garmin-Bridge-Key` and prompts in the bridge terminal in local mode; disabled in hosted production mode
- `POST /garmin/workouts/preview` - requires `X-Garmin-Bridge-Key`
- `POST /garmin/workouts/publish` - requires `X-Garmin-Bridge-Key`
- `POST /garmin/workouts/delete` - requires `X-Garmin-Bridge-Key`

## Local Browser Access

Only the local Next.js development origins are allowed by CORS:

```text
http://localhost:3000
http://127.0.0.1:3000
```

Allowed browser methods are `GET`, `POST`, and `OPTIONS`. Allowed browser headers are `X-Garmin-Bridge-Key` and `Content-Type`.

## Next.js App Integration

The Next.js app talks to this bridge only from server-side routes and helpers. The browser must never call this bridge directly because the browser must never receive `GARMIN_BRIDGE_API_KEY`.

Local app environment:

```text
GARMIN_BRIDGE_URL=http://127.0.0.1:8765
GARMIN_BRIDGE_API_KEY=replace-with-the-same-local-key-used-to-start-the-bridge
```

Hosted Vercel server-only environment:

```text
GARMIN_BRIDGE_URL=https://garmin-bridge.runbitchapp.com
GARMIN_BRIDGE_API_KEY=replace-with-the-same-key-used-on-the-bridge-host
GARMIN_BRIDGE_ACCESS_CLIENT_ID=from-cloudflare-access-service-auth
GARMIN_BRIDGE_ACCESS_CLIENT_SECRET=from-cloudflare-access-service-auth
GARMIN_BRIDGE_REQUEST_TIMEOUT_MS=15000
```

The browser must never receive those values. Do not create any
`NEXT_PUBLIC_GARMIN_*` variables.

Built app behavior:

- Settings shows Direct Garmin Bridge troubleshooting status.
- Workouts can preview and publish one planned workout directly to Garmin.
- Plan can preview and publish the next 7 or 14 days of eligible active-plan workouts.
- Bulk publish is sequential and includes a small delay between requests.
- Already synced Direct Garmin exports are skipped by default.
- Failed Direct Garmin exports can be retried only when no Garmin workout ID was created.
- Stale and partial Direct Garmin exports use manual update/delete flows instead of duplicate publish.
- Every real publish attempt is stored in `workout_exports`.
- If a future planned workout changes after Direct Garmin export, the app can mark that export stale.
- If a local active plan is deleted, the user can choose app-only deletion or best-effort future Garmin cleanup first.
- Manual app-driven Garmin delete/update is built; automatic silent Garmin cleanup is still avoided.

## Hosted Production Operations

Production status checks over SSH:

```bash
sudo systemctl status runcoach-garmin-bridge
sudo systemctl status cloudflared
```

Restart the bridge after a safe bridge-side configuration change:

```bash
sudo systemctl restart runcoach-garmin-bridge
```

Expected external behavior:

- without Cloudflare Access service-token headers, Cloudflare returns
  `403 Forbidden`;
- with Cloudflare Access but without `X-Garmin-Bridge-Key`, the bridge returns
  unauthorized;
- with both Cloudflare Access and the bridge key, `/garmin/status` returns the
  authenticated bridge status.

Sensitive production values include the bridge API key, Cloudflare Access
service-token values, the Cloudflare tunnel token, Garmin session files, Garmin
cookies/tokens/passwords, and full Garmin responses. Do not paste these into
docs, GitHub, screenshots, terminal transcripts, Supabase, Vercel logs, or app
responses.

This production bridge uses one Garmin session on the VPS. It is suitable for a
private personal or friends-and-family MVP, not for true multi-user Garmin OAuth
or multiple separate Garmin accounts.

## Troubleshooting

Check the Settings page first. It shows:

- configured or not configured;
- bridge reachable or not reachable;
- authenticated or not authenticated;
- `python-garminconnect` client version if available;
- a safe last error.

Common fixes:

- Bridge not configured: set `GARMIN_BRIDGE_URL` and `GARMIN_BRIDGE_API_KEY` in the Next.js `.env.local`.
- Bridge not running: start it with `cd local-garmin-bridge && source .venv/bin/activate && python -m uvicorn app.main:app --host 127.0.0.1 --port 8765`.
- Hosted bridge not reachable: check `sudo systemctl status
  runcoach-garmin-bridge`, `sudo systemctl status cloudflared`, Cloudflare
  Access Service Auth values, and the bridge API key.
- Auth missing: run `POST /garmin/auth/start` and complete Garmin login in the bridge terminal.
- Hosted auth missing: SSH to the VPS, temporarily run an interactive local-mode
  bridge process for re-auth, then return the systemd service to
  `GARMIN_BRIDGE_ENV=production`. Do not expose auth endpoints through the
  public hostname.
- Token invalid: re-authenticate with Garmin.
- API key rejected: make sure the key exported in the bridge terminal matches `GARMIN_BRIDGE_API_KEY` in the Next.js `.env.local`.
- Publish returns `UPLOADED_NOT_SCHEDULED`: the workout may exist in Garmin but may not be scheduled; manual cleanup in Garmin Connect may be needed.
- Delete returns `SCHEDULE_DATE_REQUIRED`: add the workout's date as `schedule_date`.
- Delete returns `PAST_WORKOUT_BLOCKED`: the bridge blocked the request before Garmin was called because past workout deletion is disabled by default.
- Delete returns `UNSCHEDULED_ONLY`: the workout was removed from the Garmin calendar, but it may still exist in the Garmin workout library.
- Delete returns `NOT_SUPPORTED`: the installed Garmin client does not expose a supported delete or safe unschedule path.
- Garmin rejects or rate-limits the request: wait, do not retry repeatedly, and check the safe error message.

Never paste Garmin passwords, Garmin tokens, bridge API keys, cookies, or full Garmin responses into screenshots, docs, issues, or commits.
