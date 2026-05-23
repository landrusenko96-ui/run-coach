# Auth + RLS Notes

## What RLS Means

Row Level Security, or RLS, is a PostgreSQL safety layer that Supabase applies inside the database. When RLS is enabled, a signed-in user can only read or change rows allowed by database policies.

For this app, user-owned rows use `user_id`. The main policy pattern is:

- `auth.uid() = user_id`

That means the database checks the signed-in Supabase user ID before allowing access to a row.

## Protected Tables

Milestone 9.5 protects these user-owned tables:

- `profiles`
- `race_goals`
- `training_plans`
- `planned_workouts`
- `logged_workouts`
- `workout_evaluations`
- `plan_adjustments`
- `intervals_connections`
- `intervals_workout_syncs`
- `workout_exports`
- `strava_connections`
- `strava_activities`
- `strava_webhook_events`

`strava_connections` is special because it stores Strava OAuth tokens. Browser clients may only read safe connection fields. Token reads and writes must stay in server routes that verify the signed-in user first, then use the server-only Supabase service-role client.

`strava_webhook_events` is also special because Strava webhook calls do not include this app's Supabase session cookie. Webhook inserts and processing use the server-only service-role client, then assign `user_id` from the matching Strava connection when possible.

## If Data Looks Missing

After RLS is enabled, data can appear missing when the database is doing its job. Check these in order:

1. Confirm you are signed in with the same email/user that owns the rows.
2. Confirm the migration was applied successfully.
3. Confirm new rows have the correct `user_id`.
4. Confirm old anonymous MVP data was expected to be deleted by the migration.
5. Confirm the route or helper is using the authenticated Supabase client, not a public unauthenticated client.
6. Confirm service-role code only runs on the server.

This app does not add its own session expiry timer. It relies on Supabase sessions and refresh tokens.

## Email Login

This app uses Supabase email one-time codes for login. The login page sends a code to the user's email address, then verifies the code in the same browser with Supabase Auth.

For hosted Supabase projects, the Magic Link email template must show the one-time code token:

```html
<h2>Your Run.B*tch.app sign-in code</h2>
<p>Enter this code in the app:</p>
<p>{{ .Token }}</p>
```

If emails still show a clickable sign-in link instead of a code, update the template in Supabase Dashboard under Authentication -> Email Templates -> Magic Link. Use `{{ .Token }}` for OTP-code login instead of relying on `{{ .ConfirmationURL }}`.
