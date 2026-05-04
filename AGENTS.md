# AGENTS.md

## Project

This repository is for Run.B*tch.app, internal repo name `run-coach`.

The app is a private adaptive marathon preparation web app. The core product loop is:

Runner profile → Race goal → Training plan → Workout logging → Workout evaluation → Plan adjustment → Updated plan

The most important feature is the adaptive training plan. All other features are secondary.

## Developer context

The project owner is a beginner developer. Code should be simple, explicit, readable, and easy to modify.

Avoid over-engineering. Prefer boring, standard solutions.

## Tech stack

Use:
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui only where useful
- Supabase later for database/auth
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
9. Strava import
10. Gear tracking
11. AI-generated feedback

Do not build these until explicitly requested:
- Garmin API integration
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

Strava logic should live in:

- `/lib/strava`

Shared types should live in:

- `/types`

## Training logic rules

The first version should be deterministic and rule-based.

Do not use AI as the core plan generator.

Every plan adjustment must have a reason.

AI will later be used to make this training plans and adjustments fully AI driven

Do not rewrite completed workouts.

Do not compensate for missed workouts by stacking extra intensity.

Be conservative with injury, fatigue, and high-effort signals.

## UI rules

Keep UI minimal and easy to replace later.

Do not spend time on branding, animations, complex visuals, or final design polish unless explicitly requested.

Use clear layouts and placeholder copy.

## Data/privacy rules

Do not store unnecessary sensitive health data.

Never hardcode secrets, API keys, tokens, Supabase keys, Strava credentials, or passwords.

Use environment variables for secrets.

Do not commit `.env` files.

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
