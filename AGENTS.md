# AGENTS.md

## Project

This repository is for Run.B*tch.app, internal repo name `run-coach`.

The app is a private adaptive marathon preparation web app. The core product loop is:

Runner profile → Race goal → Training plan → Workout logging → Workout evaluation → Plan adjustment → Updated plan

The most important feature is the adaptive training plan. All other features are secondary.

## Developer context

The project owner is a beginner developer. Code should be simple, explicit, readable, and easy to modify.

Avoid over-engineering. Prefer boring, standard solutions.

Everything developer does is first time ever. Explain every step accordingly. Do yourself as much as possible.

## Tech stack

Use:
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui only where useful
- Supabase for database/auth
- Vercel for deployment

Do not introduce other frameworks, paid services, or major dependencies unless explicitly approved.

## Scope control

Do not build the whole app at once.

Current build priority:
1. App skeleton
2. Profile
3. Race goal
4. Rule-based plan generator
5. Manual workout logging
6. Workout scoring
7. Plan adjustment
8. Dashboard
9. Intervals.icu planned-workout publishing
10. Direct Garmin local bridge lifecycle safety
11. Strava import
12. Strava webhooks
13. Production deployment readiness
14. Gear tracking
15. AI-generated feedback

Do not build these until explicitly requested:
- Official/public Direct Garmin API integration
- Spotify integration
- Route generation
- 3D avatar
- Gear price tracking
- Global marathon database
- Social sharing
- Nutrition module
- AI coach chat

## Architecture rules

Keep business logic out of React components.

Training logic should live in:

- `/lib/training/planGenerator.ts`
- `/lib/training/workoutScoring.ts`
- `/lib/training/planAdjustment.ts`
- `/lib/training/racePrediction.ts`

Database utilities should live in:

- `/lib/db`

Intervals.icu planned-workout publishing logic should live in:

- `/lib/intervals`

The experimental Direct Garmin bridge started as local-only in Milestone 6C and now supports a private hosted bridge architecture in Milestone 11B.

Direct Garmin rules:

- Keep Intervals.icu as the primary supported export path.
- Keep the Garmin bridge experimental and private.
- Do not deploy the Garmin bridge to Vercel or any fully public unauthenticated server.
- Hosted Direct Garmin may use a private VPS bridge bound to `127.0.0.1`, exposed only through Cloudflare Tunnel + Cloudflare Access Service Auth, with the bridge API key still required.
- In Vercel, Garmin bridge variables must be server-only: `GARMIN_BRIDGE_URL`, `GARMIN_BRIDGE_API_KEY`, optional `GARMIN_BRIDGE_ACCESS_CLIENT_ID`, optional `GARMIN_BRIDGE_ACCESS_CLIENT_SECRET`, and optional `GARMIN_BRIDGE_REQUEST_TIMEOUT_MS`.
- Bridge code lives in `/local-garmin-bridge`.
- Next.js server-only bridge helpers live in `/lib/garminBridge`.
- Do not expose `GARMIN_BRIDGE_API_KEY`, Cloudflare Access credentials, Garmin tokens, cookies, passwords, request headers, response headers, or full Garmin responses to the browser or database.
- Do not add official/public Garmin API integration unless explicitly requested later.
- Do not silently delete or update Garmin workouts; Garmin cleanup must remain explicit and user-confirmed.

Strava logic should live in:

- `/lib/strava`

Shared types should live in:

- `/types`

## Environment and deployment rules

Local development:

- Use `.env.local` and `docs/LOCAL_DEVELOPMENT.md`.
- Local app URL is usually `http://localhost:3000`.
- Optional integrations should fail with clear "not configured" messages when
  their env vars are missing.
- Direct Garmin may be used only through the local Python bridge bound to
  `127.0.0.1` in local development.

Production:

- Use Vercel for hosting and Supabase for database/auth.
- Use `docs/PRODUCTION_DEPLOYMENT.md` for Vercel, Supabase, Strava, Intervals,
  and production smoke-test setup.
- Direct Garmin may be available in hosted production only through the private
  hosted bridge architecture documented in `docs/PRODUCTION_DEPLOYMENT.md`.
- Intervals.icu remains the primary supported planned-workout export path.
- Strava webhooks are public inbound routes, but webhook ownership must be
  derived from saved Strava connection data, not from any incoming `user_id`.
- Supabase OTP login currently allows trusted first-time users to create
  accounts through the login form. Do not weaken RLS.

Documentation:

- When changing env vars, auth behavior, integration setup, deployment behavior,
  or Garmin/Strava/Intervals assumptions, update the relevant docs in the same
  task.

## Training logic rules

The first version should be deterministic and rule-based.

Do not use AI as the core plan generator.

Every plan adjustment must have a reason.

AI will later be used to make this training plans and adjustments fully AI driven

Do not rewrite completed workouts.

Do not compensate for missed workouts by stacking extra intensity.

Generated planned runs must have structured workout documents suitable for Intervals.icu and Garmin sync, not only freeform instructions.

For Garmin compatibility, use pace or HR target ranges, keep step counts conservative with repeats, avoid RPE-only primary targets, and do not publish rest days as Garmin workouts.

Be conservative with injury, fatigue, and high-effort signals.

## UI rules

Keep UI minimal and easy to replace later.

Do not spend time on branding, animations, complex visuals, or final design polish unless explicitly requested.

Use clear layouts and placeholder copy.

## Data/privacy rules

Do not store unnecessary sensitive health data.

Never hardcode secrets, API keys, tokens, Supabase keys, Intervals.icu credentials, Strava credentials, or passwords.

Use environment variables for secrets.

Do not commit `.env` files.

## Supabase change rules

Migration SQL files may be created or edited in the repo when a task needs database changes.

Remote Supabase schema changes require a two-turn workflow. Never create or edit a migration SQL file and push/apply it to Supabase in the same assistant execution turn, no matter how the user phrased the request. A user request such as "push this migration", "apply it", or "delete this table" is not enough to skip this rule.

After creating or editing a migration file, stop before any remote apply/push. Summarize the migration and ask for explicit approval to apply it in a later turn. Before asking for approval, explain:

1. what tables, columns, policies, functions, or data will change;
2. why the change is needed;
3. whether the change can affect existing app functionality or data;
4. how the change will be verified after applying.

Only apply/push a Supabase migration when all of these are true:

1. the migration file already existed before the current assistant execution turn started;
2. the user has explicitly approved applying that migration in the current turn;
3. the change is not critical, destructive, risky, or likely to break existing app functionality.

If a Supabase change is critical, destructive, risky, or may break existing app functionality, do not apply it automatically. Ask the user to apply it manually instead, and provide the exact migration file plus clear manual steps.

For tables in exposed schemas such as `public`, enable RLS by default unless there is a clear documented reason not to.

## Dependency rules

Before adding a dependency:
1. Explain why it is needed.
2. Check if the same result can be achieved simply without it.
3. Prefer stable, common packages.

## Testing/checking

After meaningful code changes:
- Run TypeScript checks if configured.
- Run lint if configured.
- Run tests if configured.
- If tests are not set up yet, explain how the change was manually checked.

## Git rules

Work in small increments.

After a stable milestone, suggest a Git commit.

Use clear commit messages.

Do not make large unrelated changes in one step.

## Response format after each task

After completing a task, summarize:

1. What changed
2. Files changed
3. How to run/check it
4. Any assumptions made
5. Recommended next step
