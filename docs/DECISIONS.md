# Decisions

## 2026-05-02 — Use Strava before Garmin

Decision: Use Strava as the first activity import source.
Reason: Garmin API access is more restricted, while Strava OAuth/import is more beginner-friendly.
Tradeoff: Direct Garmin API workout push is postponed; planned-workout publishing can use an approved bridge instead.

## 2026-05-04 — Use Intervals.icu for MVP planned-workout publishing

Decision: Add Intervals.icu planned-workout publishing to the MVP as the bridge from generated Run.B*tch.app workouts to Garmin Connect and the Garmin Forerunner 265.
Reason: Intervals.icu has a calendar API for planned workouts and can sync eligible planned workouts to Garmin Connect, avoiding direct Garmin Training API access for the private MVP.
Tradeoff: The app must generate structured workout documents that are compatible with Intervals.icu and Garmin, and the user must enable Intervals.icu's Garmin planned-workout upload setting. Strava remains the first completed-activity import source; direct Garmin API work remains postponed.
