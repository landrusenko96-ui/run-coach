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
Intervals.icu remains the primary export path. Direct Garmin is experimental until pace targets, scheduling, duplicate prevention, and re-export behavior are manually verified.

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
Keep this path experimental. Next work should add duplicate prevention, safer re-export behavior, and app-side export status before using it for normal planned workouts.
