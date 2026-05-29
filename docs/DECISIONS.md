# Decisions

## 2026-05-29 — Treat Initial Plan Generator As Complete For Current Product State

Decision:
Treat the Milestone 12B-12L initial plan generator as the current source of
truth for new marathon and half-marathon plan creation.

Reason:
The generator now follows the external plan-generation specification closely
enough for the current product constraints: server-side generation, six-week
app/Strava/manual history assembly, richer evidence analysis, feasibility
confirmation, persisted metadata, variable-driven workout prescriptions,
intensity and load-risk enforcement, terrain/course specificity, and a
conformance regression harness.

Status:
Milestone 12L adds `tests/planGeneratorConformance.test.mjs` and documents the
full generator architecture in `docs/PLAN_GENERATOR_LOGIC.md`. The conformance
estimate is about 88%, with remaining gaps intentionally deferred because they
require larger product changes: full aerobic-efficiency modeling, true
power-zone modeling, detailed weather modeling, persisted fueling/nutrition,
true double-run scheduling, and adaptive adjustment understanding the richer
prescriptions.

Implementation rule:
Do not rewrite the initial generator again unless a specific spec regression or
production issue is found. The next training milestone should improve
adjustment logic so it understands generated workout intent, weekly caps,
terrain load, and metadata while preserving completed workouts and export
contracts.

## 2026-05-28 — Persist Plan Generator Metadata Before Further Intelligence

Decision:
Store initial plan-generation metadata on `training_plans` so generated plans
remain auditable after reloads and before future evidence/model changes.

Reason:
The generator now makes important decisions about feasibility, fitness
confidence, phase structure, weekly load, long-run progression, peak week,
taper, assumptions, and warnings. Keeping those decisions only in the transient
API response makes later milestones harder to verify and compare.

Status:
A local migration adds additive metadata columns to `training_plans`, and the
Plan page displays the active plan's persisted generation summary. The
migration has not been applied remotely in the same turn it was created.

Implementation rule:
Persist metadata for explainability only. Do not use this milestone to change
workout generation behavior, exports, scoring, adjustment, Strava webhooks,
auth, RLS, or deployment behavior.

## 2026-05-28 — Add Spec Workout Library Behind Existing Plan Contracts

Decision:
Use an internal workout subtype library for initial plan generation while
continuing to persist only existing DB-safe workout types and structured
workout version 1.

Reason:
The external plan-generation spec requires workouts to be selected and resolved
from variables such as weekly volume, run frequency, phase, long-run target,
fitness confidence, terrain, feasibility, and max session duration. Persisting
new workout enum values would add schema/export risk, so subtype meaning is
encoded through generated titles, descriptions, purposes, instructions, pace
targets, terrain, and structured workout steps.

Status:
Initial plan generation now resolves subtypes such as cruise intervals,
fartlek, hill strides/repeats, medium-long variants, race-pace steady work,
half-marathon pace blocks, and long runs with steady or race-pace blocks. No
Supabase migration, UI redesign, export rewrite, scoring change, adjustment
rewrite, auth/RLS change, or Strava webhook change is part of this milestone.

Implementation rule:
Initial-plan workouts should be variable-driven. Warmups, cooldowns, repeats,
recoveries, work duration, distance, pace targets, and duration caps should be
derived from the generated week and athlete evidence rather than fixed
template constants whenever the workout type expects a variable prescription.

## 2026-05-28 — Add Six-Week Evidence Layer Without Changing Plan Storage

Decision:
Move six-week history interpretation into a dedicated training evidence module
behind the existing plan generator entrypoint.

Reason:
Milestone 12C collects and loads more plan inputs, but raw weekly summaries and
logged workouts need to become load, durability, effort-quality, and confidence
signals before the generator can safely follow the external plan-generation
spec. The production app loop is already working, so 12D preserves
`generateTrainingPlan(profile, raceGoal, options)`, `training_plans`,
`planned_workouts`, structured workout version 1, scoring, adjustment, exports,
auth, and RLS contracts.

Status:
The generator now consumes evidence for six-week load metrics, recent ramp,
long-run share, HR/elevation availability, cautious effort classification,
fitness confidence, max session duration caps, beginner/low-base caution,
injury mode blocking, and hilly-course warnings. No Supabase migration or
database output shape change is part of this milestone.

Implementation rule:
Do not treat the fastest recent activity as proof of fitness unless effort
evidence supports it. Missing or weak evidence should reduce confidence and
show warnings through the existing generated-plan assumptions/warnings fields.

## 2026-05-28 — Keep Plan-Input Expansion Behind Existing Contracts

Decision:
Collect the missing plan-generation spec inputs through the existing Profile and
Race Goal forms, then generate plans through a server route that assembles six
weeks of history before calling the existing generator entrypoint.

Reason:
The app is production deployed and the workout loop is working. The safer
change is to preserve `generateTrainingPlan(profile, raceGoal, options)`,
`training_plans`, `planned_workouts`, scoring, adjustment, exports, and auth
contracts while adding better inputs around them.

Status:
A local Supabase migration adds the new profile and race-goal fields and
migrates plan aggressiveness values from `conservative/balanced` to
`relaxed/moderate`. The migration is intentionally not applied remotely in the
same turn it was created.

Implementation rule:
Initial plan generation should call `POST /api/training-plans/generate`, not
the old client-side save helper. The route may use secure Strava token access
to fetch the last 42 days when app logs do not cover all six history weeks.
Imported pre-generation Strava history remains unlinked to active planned
workouts and must not trigger scoring or adaptive adjustment.

## 2026-05-02 — Use Strava before Garmin

Decision: Use Strava as the first activity import source.
Reason: Garmin API access is more restricted, while Strava OAuth/import is more beginner-friendly.
Tradeoff: Direct Garmin API workout push is postponed; planned-workout publishing can use an approved bridge instead.

## 2026-05-04 — Use Intervals.icu for MVP planned-workout publishing

Decision: Add Intervals.icu planned-workout publishing to the MVP as the bridge from generated Run.B*tch.app workouts to Garmin Connect and the Garmin Forerunner 265.
Reason: Intervals.icu has a calendar API for planned workouts and can sync eligible planned workouts to Garmin Connect, avoiding direct Garmin Training API access for the private MVP.
Tradeoff: The app must generate structured workout documents that are compatible with Intervals.icu and Garmin, and the user must enable Intervals.icu's Garmin planned-workout upload setting. Strava remains the first completed-activity import source; direct Garmin API work remains postponed.

## Decision — Add Direct Garmin Local Bridge as Experimental Export Path

Decision:
Add a secondary private Garmin export path using a Python bridge and community Garmin Connect tooling. The first implementation is local-only; later hosted use must stay private.

Reason:
Intervals.icu syncs workouts to Garmin but does not reliably transfer pace targets. Direct Garmin workout creation may preserve pace targets because Garmin Connect itself supports pace targets in structured workouts.

Tradeoff:
This uses unofficial Garmin Connect internal APIs. It may break without notice, may require re-authentication, and is not suitable for public multi-user release.

Implementation rule:
Intervals.icu remains the primary export path. Direct Garmin remains experimental even after pace-target validation because it depends on unofficial Garmin Connect internals. Garmin delete/update actions must stay explicit and user-confirmed; do not run silent automatic Garmin cleanup.

## Decision — Resume Direct Garmin Local Bridge Using python-garminconnect

Decision:
Continue Milestone 6C using python-garminconnect 0.3.3 instead of garth for new authentication.

Reason:
The garth path failed for new login, but the python-garminconnect spike successfully authenticated and saved a local session.

Status:
Experimental but unblocked.

Validation:
On 2026-05-13, the bridge uploaded and scheduled one simple running workout named "Run Coach Garmin Pace Test May 13" using python-garminconnect. Garmin returned workout ID 1566821421 and schedule ID 1648396171. Manual verification confirmed the workout appeared on the Forerunner and the watch showed pace targets, not "No Target".

Implementation rule:
Keep this path experimental. Duplicate prevention, app-side export status, stale/partial guardrails, manual delete, and manual stale-update now exist, but automatic Garmin delete/update behavior is intentionally not built.

## Decision — Keep Intervals.icu Primary After Garmin Pace Target Validation

Decision:
Keep Intervals.icu as the primary supported planned-workout export path even though the direct Garmin local bridge can publish pace-targeted workouts.

Reason:
Intervals.icu is a public supported integration path and remains safer for normal export behavior. The direct Garmin bridge uses unofficial Garmin Connect internals through `python-garminconnect`, so it can break without notice.

Status:
Direct Garmin is useful for personal testing and pace-target preservation. It is not a public production integration.

Implementation rule:
The app should present Direct Garmin as experimental, private, and secondary. Do not remove or weaken the Intervals.icu export path.

## Decision — Track Direct Garmin Exports In workout_exports

Decision:
Record Direct Garmin export attempts in the generic `workout_exports` table while keeping the existing `intervals_workout_syncs` table for Intervals.icu.

Reason:
Direct Garmin needs history for success, failure, partial upload/schedule results, duplicate prevention, stale plan changes, and troubleshooting. Keeping `intervals_workout_syncs` avoids changing the working Intervals.icu path during Garmin experimentation.

Status:
`workout_exports` stores Direct Garmin metadata such as provider workout ID, provider schedule ID, sync status, warnings, and a sanitized payload snapshot. It must not store Garmin tokens, cookies, passwords, API keys, request headers, or full Garmin responses.

Implementation rule:
Every real Direct Garmin publish attempt should create an export row. Blocked duplicate checks do not create a row because no Garmin publish attempt happened.

## Decision — Use Guardrails Instead Of Automatic Garmin Cleanup

Decision:
Prevent accidental Garmin clutter with app-side duplicate, stale, partial, update, and deleted-status guardrails.

Reason:
Direct republish creates duplicate Garmin workouts. The safer app behavior is to block republish when a Garmin workout ID already exists, update stale exports through the manual replacement flow, and preserve local export history.

Status:
Single-workout Direct Garmin publishing blocks already-exported workouts instead of offering "Republish anyway". Stale exports use "Update Garmin Export", which removes/unschedules the old Garmin workout before publishing the current app version. Bulk Direct Garmin publishing skips already synced workouts and blocks stale/partial existing exports from duplicate publish; bulk maintenance handles stale update and selected delete workflows. Future plan changes can mark synced/partial Garmin exports stale. Active plan deletion can optionally attempt future Garmin cleanup.

Implementation rule:
Do not create duplicate Garmin workouts through republish. If a publish succeeds but scheduling fails, show `partial` status and warn that manual cleanup in Garmin Connect may be needed.

## Decision — Remove Direct Garmin Republish

Decision:
Remove the duplicate-creating "Republish anyway" path for Direct Garmin exports.

Reason:
Republishing an already-exported workout creates a second Garmin workout on the same day. That adds clutter, makes plan deletion cleanup harder, and conflicts with the app's safer behavior: the current app version should replace the old Garmin version when a workout changes.

Status:
Single-workout Direct Garmin publish now blocks already-exported `synced`, `stale`, and `partial` rows. Stale workouts use "Update Garmin Export", which removes or unschedules the old Garmin workout before publishing the current app version. Bulk publish blocks stale/partial existing exports from duplicate publishing; bulk maintenance handles stale updates and selected deletes.

Implementation rule:
If a Garmin workout ID already exists, do not publish another copy. Use manual update for stale exports, manual delete for cleanup, or retry only failed exports that did not create a Garmin workout ID.

## Decision — Add Local Garmin Troubleshooting UI

Decision:
Show Direct Garmin Bridge diagnostics on the Settings page through the Next.js server route.

Reason:
The bridge has several local moving pieces: `.env.local`, the Python service, the saved Garmin session, and Garmin's own availability. A beginner-friendly status panel makes the likely problem visible without exposing secrets.

Status:
Settings shows whether the bridge is configured, reachable, authenticated, the `python-garminconnect` client version if available, and a safe last error. Suggested fixes are shown for missing config, bridge not running, missing auth, invalid token, or key mismatch.

Implementation rule:
The browser must call only the Next.js status route. It must never call the Python bridge directly and must never receive `GARMIN_BRIDGE_API_KEY`, Garmin tokens, cookies, passwords, or full Garmin responses.

## 2026-05-25 — Milestone 11B Private Hosted Garmin Bridge MVP

Decision:
Support Direct Garmin from production only through a private hosted bridge:
Python FastAPI bridge on a VPS bound to `127.0.0.1:8765`, Cloudflare Tunnel
HTTPS hostname, Cloudflare Access Service Auth, and the existing
`X-Garmin-Bridge-Key`.

Reason:
Intervals.icu remains the safer supported export path, but it does not reliably
deliver pace targets to Garmin. The private hosted bridge keeps Garmin pace
target export available without exposing Garmin credentials, bridge keys, or
session files to the browser, Supabase, Vercel logs, or a public unauthenticated
endpoint.

Status:
MVP architecture support is implemented in code and docs. Deployment remains a
manual user action.

Implementation rule:
The browser must call only Next.js server routes. Vercel may store server-only
`GARMIN_BRIDGE_URL`, `GARMIN_BRIDGE_API_KEY`,
`GARMIN_BRIDGE_ACCESS_CLIENT_ID`, `GARMIN_BRIDGE_ACCESS_CLIENT_SECRET`, and
optional `GARMIN_BRIDGE_REQUEST_TIMEOUT_MS`. The VPS stores only
`GARMIN_BRIDGE_API_KEY`, `GARMIN_TOKEN_DIR`, and
`GARMIN_BRIDGE_ENV=production`. Garmin passwords, cookies, tokens, request
headers, response headers, Cloudflare Access values, and full Garmin responses
must not be stored in Supabase or returned to the browser. No Supabase migration
is required.

## 2026-05-26 — Hosted Direct Garmin Bridge Production Deployment Complete

Decision:
Keep the deployed Direct Garmin production bridge as a private infrastructure
service: Oracle Cloud Ubuntu VPS, `runcoach-garmin-bridge` systemd service,
`cloudflared` tunnel, Cloudflare Access Service Auth, and
`X-Garmin-Bridge-Key`.

Reason:
Production smoke testing confirmed the hosted bridge can publish Garmin
workouts with pace targets while Vercel still mediates browser actions through
server routes. Intervals.icu remains the fallback export path.

Status:
Deployment is complete at `https://garmin-bridge.runbitchapp.com`. The bridge
binds only to `127.0.0.1:8765`; UFW allows only OpenSSH inbound; Garmin session
files live only in `/var/lib/run-coach-garmin/.garminconnect`. This was an
infrastructure-only deployment. No app UI, plan generation, or application
behavior changed as part of the deployment.

Security note:
`GARMIN_BRIDGE_API_KEY`, Cloudflare Access service-token values, and the
Cloudflare tunnel token were rotated after setup. Documentation must never
preserve old or current secret values, Garmin account email, terminal output
that includes secrets, Garmin cookies/tokens, request/response headers, or full
Garmin responses.

Limitation:
This bridge uses one Garmin session on the VPS. It is appropriate for
private/personal/friends-and-family MVP use, but it is not a true per-user
Garmin OAuth integration. Do not allow multiple users to connect separate
Garmin accounts through this bridge until per-user session isolation is
designed.

## 2026-05-25 — Milestone 10 Production Deployment Readiness

Decision:
Prepare the app for Vercel/Supabase production deployment without changing the
core product flow.

Reason:
The MVP core loop works locally, so the next risk is unsafe or unclear
production configuration: missing env vars, browser-exposed secrets, Strava
callback mismatch, Supabase Auth redirect mismatch, and Direct Garmin failing
unclearly on hosted Vercel.

Status:
Production env vars, local env vars, Strava webhook setup, Supabase Auth setup,
and smoke tests are documented. Optional integrations should show clear
configuration messages when not set up. The app has a header sign-out button.

Implementation rule:
Keep secrets server-only. Do not log API keys, service-role keys, Strava tokens,
Intervals API keys, Garmin credentials, request headers, or full provider
responses. Keep Direct Garmin unavailable in hosted production unless the
private hosted bridge architecture is intentionally configured.

## 2026-05-25 — Trusted New Users Can Use OTP Signup

Decision:
Allow trusted first-time users to create accounts through Supabase email OTP
login.

Reason:
The current usage context assumes only verified/trusted users will use the app.
Making every user manually pre-created in Supabase is unnecessary friction for
that context.

Tradeoff:
Anyone who can access the app URL and receive an OTP for their email may create
an account while Supabase email signups are enabled. RLS still protects each
user's rows, but this is not a public launch posture.

Implementation rule:
Keep RLS enabled and keep service-role operations limited to documented
server-only routes. If the app becomes public, revisit signup restrictions
before inviting untrusted users.
