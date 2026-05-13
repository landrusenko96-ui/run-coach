# Local Garmin Bridge

This is a local-only experimental bridge for Direct Garmin Local Bridge export.

It is separate from the Next.js app. It is not deployed, not public, and not a supported production integration.

## Current Status

This checkpoint uses `python-garminconnect==0.3.3` for Garmin authentication, workout upload, and calendar scheduling.

- Garmin authentication can be attempted locally from the bridge terminal.
- Garmin session tokens are saved only in `local-garmin-bridge/.garminconnect/garmin_tokens.json`.
- The previous Garth new-login path is retired for this bridge because new login failed.
- One simple future running workout with one time-based pace-targeted work step can be previewed and published.
- Bulk publishing, duplicate prevention, delete, update, and app integration are not built yet.
- Intervals.icu remains the primary supported export path.

## Validated Checkpoint

On 2026-05-13, the bridge uploaded and scheduled one simple running workout named `Run Coach Garmin Pace Test May 13`.

- Garmin workout ID: `1566821421`
- Garmin schedule ID: `1648396171`
- Manual verification: the workout appeared on the Forerunner and showed pace targets on the watch, not `No Target`.

This validates the first narrow pace-target export path. The bridge remains experimental until duplicate prevention, re-export behavior, and app-side export status are built.

## Important Constraints

- Local-only.
- Personal use only.
- Uses unofficial Garmin Connect APIs.
- Unofficial Garmin APIs can break without notice.
- Do not store Garmin usernames, passwords, tokens, or session data in Supabase or the Next.js app.
- Do not log secrets, tokens, passwords, or full Garmin responses.
- Do not commit `local-garmin-bridge/.garminconnect/`; it contains private local Garmin session tokens after login.
- Do not put Garmin credentials in `.env.example`, screenshots, issue comments, or docs.
- Do not expose this bridge publicly.
- Keep Intervals.icu as the fallback export path.
- Do not claim Garmin pace-target success until Garmin Connect and the watch are manually checked.

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

## Run

Use this command from `local-garmin-bridge/`:

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

The `127.0.0.1` host is intentional. It keeps the bridge bound to your own computer. Do not run it on `0.0.0.0` and do not expose it publicly.

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

## Simple Publish Test

This checkpoint only supports one simple easy run:

- sport is `Run`;
- exactly one `work` step;
- duration is time in seconds;
- target is pace in `sec_per_km`;
- publish date is in the future.

Example preview:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Garmin-Bridge-Key: replace-with-a-long-random-local-key" \
  -d '{
    "workout": {
      "planned_workout_id": "manual-garmin-test-1",
      "title": "Run Coach Garmin Pace Test",
      "workout_date": "2026-05-20",
      "workout_type": "easy",
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
    }
  }' \
  http://127.0.0.1:8765/garmin/workouts/preview
```

Example publish:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Garmin-Bridge-Key: replace-with-a-long-random-local-key" \
  -d '{
    "workout": {
      "planned_workout_id": "manual-garmin-test-1",
      "title": "Run Coach Garmin Pace Test",
      "workout_date": "2026-05-20",
      "workout_type": "easy",
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
    }
  }' \
  http://127.0.0.1:8765/garmin/workouts/publish
```

Repeated publish calls can create duplicate Garmin workouts. Duplicate prevention is not implemented yet.

After publishing, manually verify:

1. Garmin Connect shows the workout on the scheduled date.
2. The Forerunner receives the workout after sync.
3. The watch shows a pace target, not `No Target`.

## API Docs

The docs routes are protected:

```text
http://127.0.0.1:8765/docs
http://127.0.0.1:8765/openapi.json
```

A normal browser tab cannot attach `X-Garmin-Bridge-Key` to the `/openapi.json` request that the docs page makes. For protected docs, use a header-aware client such as curl, Postman, or an API client extension.

## Endpoints

- `GET /health` - public
- `GET /garmin/status` - requires `X-Garmin-Bridge-Key`
- `POST /garmin/auth/start` - requires `X-Garmin-Bridge-Key` and prompts in the bridge terminal
- `POST /garmin/workouts/preview` - requires `X-Garmin-Bridge-Key`
- `POST /garmin/workouts/publish` - requires `X-Garmin-Bridge-Key`

## Local Browser Access

Only the local Next.js development origins are allowed by CORS:

```text
http://localhost:3000
http://127.0.0.1:3000
```

Allowed browser methods are `GET`, `POST`, and `OPTIONS`. Allowed browser headers are `X-Garmin-Bridge-Key` and `Content-Type`.
