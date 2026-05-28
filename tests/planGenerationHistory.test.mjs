import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPlanGenerationHistorySummary,
  hasCompleteSixWeekCoverage,
} from "../lib/training/planGenerationHistory.ts";

function makeLoggedWorkout(date, distanceKm = 8, source = "manual") {
  return {
    id: `log-${date}`,
    user_id: "user-1",
    profile_id: "profile-1",
    race_goal_id: "goal-1",
    training_plan_id: null,
    planned_workout_id: null,
    workout_date: date,
    workout_type: "run",
    source,
    source_activity_id: source === "strava" ? `activity-${date}` : null,
    distance_km: distanceKm,
    duration_sec: distanceKm * 360,
    avg_pace_sec_per_km: 360,
    avg_heart_rate: null,
    max_heart_rate: null,
    cadence: null,
    elevation_gain_m: null,
    rpe: null,
    notes: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
  };
}

function makeManualWeeks(runCounts = [1, 1, 1, 1, 1, 1]) {
  return runCounts.map((runCount, index) => ({
    week_start_date: `2030-03-${String(1 + index * 7).padStart(2, "0")}`,
    week_end_date: `2030-03-${String(7 + index * 7).padStart(2, "0")}`,
    distance_km: runCount > 0 ? 20 + index : 0,
    duration_sec: runCount > 0 ? (20 + index) * 360 : null,
    run_count: runCount,
    longest_run_km: runCount > 0 ? 10 : null,
    longest_run_duration_sec: runCount > 0 ? 3600 : null,
    source: "manual",
  }));
}

function makeProfile(manualHistory = null) {
  return {
    id: "profile-1",
    manual_six_week_history: manualHistory,
  };
}

describe("plan generation history summary", () => {
  it("uses internal app logs when all six weeks have run coverage", () => {
    const summary = buildPlanGenerationHistorySummary({
      profile: makeProfile(),
      windowEndDate: "2030-04-11",
      appLoggedWorkouts: [
        makeLoggedWorkout("2030-03-01"),
        makeLoggedWorkout("2030-03-08"),
        makeLoggedWorkout("2030-03-15"),
        makeLoggedWorkout("2030-03-22"),
        makeLoggedWorkout("2030-03-29"),
        makeLoggedWorkout("2030-04-05"),
      ],
    });

    assert.equal(summary.coverage, "complete");
    assert.equal(summary.app_workouts_used.length, 6);
    assert.equal(summary.strava_workouts_imported.length, 0);
    assert.equal(summary.needs_strava_connection, false);
    assert.equal(summary.needs_manual_history, false);
    assert.equal(hasCompleteSixWeekCoverage(summary.weeks), true);
  });

  it("marks partial coverage when a week has no run", () => {
    const summary = buildPlanGenerationHistorySummary({
      profile: makeProfile(),
      windowEndDate: "2030-04-11",
      appLoggedWorkouts: [
        makeLoggedWorkout("2030-03-01"),
        makeLoggedWorkout("2030-03-08"),
        makeLoggedWorkout("2030-03-22"),
        makeLoggedWorkout("2030-03-29"),
        makeLoggedWorkout("2030-04-05"),
      ],
    });

    assert.equal(summary.coverage, "partial");
    assert.equal(hasCompleteSixWeekCoverage(summary.weeks), false);
  });

  it("uses manual fallback history only when every manual week has coverage", () => {
    const completeManualSummary = buildPlanGenerationHistorySummary({
      profile: makeProfile(makeManualWeeks()),
      windowEndDate: "2030-04-11",
      appLoggedWorkouts: [],
      forceManual: true,
    });
    const incompleteManualSummary = buildPlanGenerationHistorySummary({
      profile: makeProfile(makeManualWeeks([1, 1, 0, 1, 1, 1])),
      windowEndDate: "2030-04-11",
      appLoggedWorkouts: [],
      forceManual: true,
    });

    assert.equal(completeManualSummary.coverage, "manual");
    assert.equal(completeManualSummary.manual_weeks_used.length, 6);
    assert.equal(completeManualSummary.needs_manual_history, false);
    assert.equal(incompleteManualSummary.coverage, "partial");
    assert.equal(incompleteManualSummary.needs_manual_history, true);
  });
});
