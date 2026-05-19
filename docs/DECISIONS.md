# Decisions

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
Add a secondary local-only Garmin export path using a Python bridge and community Garmin Connect tooling.

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
Direct Garmin is useful for personal local testing and pace-target preservation. It is not a public production integration.

Implementation rule:
The app should present Direct Garmin as experimental, local-only, and secondary. Do not remove or weaken the Intervals.icu export path.

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
