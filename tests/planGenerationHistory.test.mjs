import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCanonicalPlanGenerationHistory,
  buildPlanGenerationHistorySummary,
  getPlanGenerationEvidenceWorkouts,
  hasCompleteSixWeekCoverage,
  importMissingStravaHistoryRuns,
  shouldFetchStravaHistoryForPlanGeneration,
} from "../lib/training/planGenerationHistory.ts";

function makeLoggedWorkout(date, distanceKm = 8, source = "manual", overrides = {}) {
  return {
    id: overrides.id ?? `log-${date}`,
    user_id: "user-1",
    profile_id: "profile-1",
    race_goal_id: "goal-1",
    training_plan_id: overrides.training_plan_id ?? null,
    planned_workout_id: overrides.planned_workout_id ?? null,
    workout_date: date,
    workout_type: "run",
    source,
    source_activity_id:
      overrides.source_activity_id ??
      (source === "strava" ? `activity-${date}` : null),
    distance_km: overrides.distance_km ?? distanceKm,
    duration_sec: overrides.duration_sec ?? distanceKm * 360,
    avg_pace_sec_per_km: overrides.avg_pace_sec_per_km ?? 360,
    avg_heart_rate: overrides.avg_heart_rate ?? null,
    max_heart_rate: overrides.max_heart_rate ?? null,
    cadence: null,
    elevation_gain_m: overrides.elevation_gain_m ?? null,
    rpe: overrides.rpe ?? null,
    notes: overrides.notes ?? null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
  };
}

function makeStravaActivity(overrides = {}) {
  const date = overrides.date ?? "2030-03-08";

  return {
    id: overrides.id ?? "activity-1",
    name: overrides.name ?? "Morning Run",
    sportType: overrides.sportType ?? "Run",
    startDate: overrides.startDate ?? `${date}T12:00:00Z`,
    startDateLocal: overrides.startDateLocal ?? `${date}T08:00:00`,
    distanceM: overrides.distanceM ?? 8000,
    movingTimeSec: overrides.movingTimeSec ?? 2880,
    elapsedTimeSec: overrides.elapsedTimeSec ?? 2920,
    totalElevationGainM: overrides.totalElevationGainM ?? 80,
    averageHeartRate: overrides.averageHeartRate ?? 145,
    maxHeartRate: overrides.maxHeartRate ?? 168,
    rawSummary: overrides.rawSummary ?? { id: overrides.id ?? "activity-1" },
  };
}

function makeStravaEvidence(overrides = {}) {
  return {
    stravaActivityId: overrides.stravaActivityId ?? "activity-1",
    activityDate: overrides.activityDate ?? "2030-03-08",
    distanceKm: overrides.distanceKm ?? 8,
    durationSec: overrides.durationSec ?? 2880,
    avgPaceSecPerKm: overrides.avgPaceSecPerKm ?? 360,
    averageHeartRate: overrides.averageHeartRate ?? 145,
    maxHeartRate: overrides.maxHeartRate ?? 168,
    averagePowerWatts: overrides.averagePowerWatts ?? null,
    weightedAveragePowerWatts: overrides.weightedAveragePowerWatts ?? null,
    hasDetail: overrides.hasDetail ?? true,
    hasStreams: overrides.hasStreams ?? true,
    hasHeartRateStream: overrides.hasHeartRateStream ?? true,
    hasPowerStream: overrides.hasPowerStream ?? false,
    achievementCount: overrides.achievementCount ?? 0,
    bestEffortCount: overrides.bestEffortCount ?? 0,
    prCount: overrides.prCount ?? 0,
    perceivedExertion: overrides.perceivedExertion ?? null,
    workoutType: overrides.workoutType ?? null,
    paceFadePercent: overrides.paceFadePercent ?? null,
    heartRateDriftPercent: overrides.heartRateDriftPercent ?? null,
    negativeSplit: overrides.negativeSplit ?? null,
    splitPaceVariationPercent: overrides.splitPaceVariationPercent ?? null,
    sustainedHardSectionCount: overrides.sustainedHardSectionCount ?? 0,
    elevationGainM: overrides.elevationGainM ?? 80,
    altitudeRangeM: overrides.altitudeRangeM ?? null,
    gradeRangePercent: overrides.gradeRangePercent ?? null,
    effortSignals: overrides.effortSignals ?? [],
    classificationHint: overrides.classificationHint ?? "easy_non_limit",
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
  it("fetches Strava history in auto mode even when app coverage is complete", () => {
    assert.equal(
      shouldFetchStravaHistoryForPlanGeneration({
        historyMode: "auto",
        hasCompleteAppCoverage: true,
      }),
      true,
    );
    assert.equal(
      shouldFetchStravaHistoryForPlanGeneration({
        historyMode: "manual",
        hasCompleteAppCoverage: false,
      }),
      false,
    );
  });

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
    assert.equal(summary.strava_workouts_merged.length, 0);
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

  it("returns the logged workouts that should feed generation evidence", () => {
    const appWorkout = makeLoggedWorkout("2030-03-01", 8, "manual");
    const importedWorkout = makeLoggedWorkout("2030-03-08", 10, "strava");

    assert.deepEqual(
      getPlanGenerationEvidenceWorkouts({
        historyMode: "auto",
        appLoggedWorkouts: [appWorkout],
        importedStravaWorkouts: [importedWorkout],
      }),
      [appWorkout, importedWorkout],
    );
    assert.deepEqual(
      getPlanGenerationEvidenceWorkouts({
        historyMode: "manual",
        appLoggedWorkouts: [appWorkout],
        importedStravaWorkouts: [importedWorkout],
      }),
      [],
    );
  });

  it("merges duplicate app and Strava evidence without replacing app identity", () => {
    const appWorkout = makeLoggedWorkout("2030-03-08", 8, "manual", {
      id: "app-log-1",
      planned_workout_id: "planned-1",
      notes: "Felt easy",
      rpe: 3,
    });
    const canonical = buildCanonicalPlanGenerationHistory({
      historyMode: "auto",
      appLoggedWorkouts: [appWorkout],
      importedStravaWorkouts: [
        makeLoggedWorkout("2030-03-08", 8, "strava", {
          id: "strava-log-1",
          source_activity_id: "activity-merge",
        }),
      ],
      stravaActivityEvidence: [
        makeStravaEvidence({
          stravaActivityId: "activity-merge",
          activityDate: "2030-03-08",
          distanceKm: 8.03,
          durationSec: 2890,
          elevationGainM: 120,
        }),
      ],
    });

    assert.equal(canonical.workouts.length, 1);
    assert.equal(canonical.workouts[0].id, "app-log-1");
    assert.equal(canonical.workouts[0].planned_workout_id, "planned-1");
    assert.equal(canonical.workouts[0].notes, "Felt easy");
    assert.equal(canonical.workouts[0].rpe, 3);
    assert.equal(canonical.workouts[0].source_activity_id, "activity-merge");
    assert.equal(canonical.workouts[0].elevation_gain_m, 120);
    assert.equal(appWorkout.source_activity_id, null);
    assert.equal(canonical.mergedStravaWorkouts.length, 1);
    assert.equal(
      canonical.mergedStravaWorkouts[0].merged_strava_activity_id,
      "activity-merge",
    );
  });

  it("records merged Strava audit metadata instead of importing duplicate logs", async () => {
    const calls = {
      upserts: [],
    };
    const supabase = makeHistorySupabaseMock(calls);
    const appWorkout = makeLoggedWorkout("2030-03-08", 8, "manual", {
      id: "app-log-1",
      planned_workout_id: "planned-1",
    });
    const result = await importMissingStravaHistoryRuns({
      userId: "user-1",
      profile: makeProfile(),
      raceGoal: { id: "goal-1" },
      appLoggedWorkouts: [appWorkout],
      stravaActivities: [
        makeStravaActivity({
          id: "activity-merge",
          date: "2030-03-08",
          distanceM: 8030,
          movingTimeSec: 2890,
        }),
      ],
      windowStartDate: "2030-03-01",
      windowEndDate: "2030-04-11",
      supabase,
    });

    assert.equal(result.importedWorkouts.length, 0);
    assert.equal(result.skippedActivities.length, 1);
    assert.equal(result.skippedActivities[0].reason, "merged with app history log");
    assert.equal(calls.upserts.length, 1);
    assert.equal(calls.upserts[0].logged_workout_id, "app-log-1");
    assert.equal(calls.upserts[0].planned_workout_id, "planned-1");
    assert.equal(calls.upserts[0].raw_summary_json.history_merge.source, "app_log");
    assert.equal(
      calls.upserts[0].raw_summary_json.history_merge.reason,
      "same date, planned workout link, and similar distance or duration",
    );
  });

  it("fills only remaining gaps with manual weeks after app and Strava merge", () => {
    const appLoggedWorkouts = [
      makeLoggedWorkout("2030-03-01"),
      makeLoggedWorkout("2030-03-08"),
      makeLoggedWorkout("2030-03-22"),
      makeLoggedWorkout("2030-03-29"),
    ];
    const importedStravaWorkouts = [
      makeLoggedWorkout("2030-03-15", 9, "strava", {
        source_activity_id: "activity-2030-03-15",
      }),
    ];
    const canonical = buildCanonicalPlanGenerationHistory({
      historyMode: "auto",
      appLoggedWorkouts,
      importedStravaWorkouts,
      stravaActivityEvidence: [],
    });
    const summary = buildPlanGenerationHistorySummary({
      profile: makeProfile(makeManualWeeks([0, 0, 0, 0, 0, 1])),
      windowEndDate: "2030-04-11",
      appLoggedWorkouts,
      importedStravaWorkouts,
      canonicalWorkouts: canonical.workouts,
      mergedStravaWorkouts: canonical.mergedStravaWorkouts,
      fillManualGaps: true,
    });

    assert.equal(hasCompleteSixWeekCoverage(summary.weeks), true);
    assert.equal(summary.manual_weeks_used.length, 1);
    assert.equal(summary.manual_weeks_used[0].week_start_date, "2030-04-05");
    assert.equal(summary.weeks[2].source, "strava");
    assert.equal(summary.weeks[5].source, "manual");
  });
});

function makeHistorySupabaseMock(calls) {
  return {
    from(table) {
      if (table === "strava_activities") {
        return {
          select() {
            return {
              eq() {
                return {
                  in: async () => ({ data: [], error: null }),
                };
              },
            };
          },
          upsert: async (payload) => {
            calls.upserts.push(payload);

            return { error: null };
          },
        };
      }

      if (table === "logged_workouts") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      in: async () => ({ data: [], error: null }),
                    };
                  },
                };
              },
            };
          },
          insert() {
            throw new Error("Duplicate merge test should not insert a log.");
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}
