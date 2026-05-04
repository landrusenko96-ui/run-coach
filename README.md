# Run.B*tch.app

Internal repo name: `run-coach`

Run.B*tch.app is a private web app for adaptive marathon preparation. The long-term product loop is:

Runner profile -> Race goal -> Training plan -> Workout logging -> Workout evaluation -> Plan adjustment -> Updated plan

The most important future feature is the adaptive training plan. This repository currently contains only the initial app skeleton.

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
```

## Current status

- Next.js App Router project structure is in place.
- TypeScript is configured.
- Tailwind CSS is configured for minimal styling.
- Basic navigation exists for Dashboard, Profile, Goal, Plan, Workouts, and Settings.
- Each page contains placeholder content only.
- Shared training-related types are defined in `/types`.
- Training logic files exist as placeholders in `/lib/training`.
- Supabase, Strava, authentication, and real training logic are not connected yet.

## Folder structure

```text
/app               Next.js App Router pages and root layout
/components        Shared React components
/lib               Shared application utilities
/lib/training      Future training plan, scoring, adjustment, and prediction logic
/lib/db            Future database utilities
/lib/strava        Future Strava import utilities
/types             Shared TypeScript types
```

## Next planned milestone

Build the Profile milestone:

- Add a simple runner profile form.
- Store profile data locally in component state or a temporary mock object.
- Keep all profile types in `/types`.
- Keep any non-UI profile logic outside React components.
