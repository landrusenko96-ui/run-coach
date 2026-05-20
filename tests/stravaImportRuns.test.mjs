import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStravaLoggedWorkoutInput,
  findExactDatePlannedWorkoutMatch,
  importStravaActivitiesForActivePlan,
  isSupportedStravaRun,
  isValidStravaRunActivity,
} from "../lib/strava/importRuns.ts";

const profile = {
  id: "profile-1",
};

const raceGoal = {
  id: "race-goal-1",
};

const plan = {
  id: "plan-1",
  profile_id: "profile-1",
  race_goal_id: "race-goal-1",
  start_date: "2026-05-18",
  end_date: "2026-06-18",
};

const plannedWorkout = {
  id: "planned-1",
  training_plan_id: "plan-1",
  profile_id: "profile-1",
  race_goal_id: "race-goal-1",
  workout_date: "2026-05-18",
  workout_type: "easy",
  status: "planned",
  terrain: null,
};

function plannedWorkoutRow(overrides = {}) {
  return {
    ...plannedWorkout,
    ...overrides,
  };
}

function activity(overrides = {}) {
  return {
    id: "strava-1",
    name: "Morning Run",
    sportType: "Run",
    startDate: "2026-05-18T11:00:00Z",
    startDateLocal: "2026-05-18T07:00:00",
    distanceM: 5000,
    movingTimeSec: 1800,
    elapsedTimeSec: 1900,
    totalElevationGainM: 20,
    averageHeartRate: 140,
    maxHeartRate: 170,
    rawSummary: {
      id: "strava-1",
      sport_type: "Run",
    },
    ...overrides,
  };
}

function createImportDependencies(overrides = {}) {
  const calls = {
    savedLoggedWorkoutInputs: [],
    savedAuditRows: [],
  };

  return {
    calls,
    dependencies: {
      isDuplicate: async () => false,
      saveLoggedWorkoutWithCompletion: async (input) => {
        calls.savedLoggedWorkoutInputs.push(input.loggedWorkoutInput);

        const savedLoggedWorkout = loggedWorkout({
          id: `logged-${input.loggedWorkoutInput.source_activity_id}`,
          training_plan_id: input.loggedWorkoutInput.training_plan_id,
          planned_workout_id: input.plannedWorkout?.id ?? null,
          workout_date: input.loggedWorkoutInput.workout_date,
          workout_type: input.loggedWorkoutInput.workout_type,
          source: input.loggedWorkoutInput.source,
          source_activity_id: input.loggedWorkoutInput.source_activity_id,
          distance_km: input.loggedWorkoutInput.distance_km,
          duration_sec: input.loggedWorkoutInput.duration_sec,
          avg_pace_sec_per_km: input.loggedWorkoutInput.avg_pace_sec_per_km,
          avg_heart_rate: input.loggedWorkoutInput.avg_heart_rate,
          max_heart_rate: input.loggedWorkoutInput.max_heart_rate,
        });

        return {
          ok: true,
          loggedWorkout: savedLoggedWorkout,
          workoutEvaluation: input.plannedWorkout
            ? workoutEvaluation({
                id: `evaluation-${input.loggedWorkoutInput.source_activity_id}`,
                logged_workout_id: savedLoggedWorkout.id,
              })
            : null,
          scored: Boolean(input.plannedWorkout),
          adjusted: false,
          message: "Imported.",
          followupError: null,
        };
      },
      saveStravaActivity: async (input) => {
        calls.savedAuditRows.push(input);
      },
      ...overrides,
    },
  };
}

function loggedWorkout(overrides = {}) {
  return {
    id: "logged-1",
    profile_id: "profile-1",
    race_goal_id: "race-goal-1",
    training_plan_id: "plan-1",
    planned_workout_id: null,
    workout_date: "2026-05-18",
    workout_type: "run",
    source: "strava",
    source_activity_id: "strava-1",
    distance_km: 5,
    duration_sec: 1800,
    avg_pace_sec_per_km: 360,
    avg_heart_rate: 140,
    max_heart_rate: 170,
    cadence: null,
    elevation_gain_m: 20,
    rpe: null,
    notes: "Imported from Strava: Morning Run",
    created_at: "2026-05-18T12:00:00.000Z",
    updated_at: "2026-05-18T12:00:00.000Z",
    ...overrides,
  };
}

function workoutEvaluation(overrides = {}) {
  return {
    id: "evaluation-1",
    logged_workout_id: "logged-1",
    planned_workout_id: "planned-1",
    profile_id: "profile-1",
    training_plan_id: "plan-1",
    overall_score: 90,
    completion_score: 90,
    pace_accuracy_score: 90,
    distance_completion_score: 90,
    effort_control_score: 90,
    training_value_score: 90,
    risk_level: "low",
    summary: null,
    created_at: "2026-05-18T12:00:00.000Z",
    updated_at: "2026-05-18T12:00:00.000Z",
    ...overrides,
  };
}

describe("Strava run import helpers", () => {
  it("imports Run, TrailRun, and VirtualRun sport types", () => {
    for (const sportType of ["Run", "TrailRun", "VirtualRun"]) {
      assert.equal(
        isSupportedStravaRun(activity({ sportType })),
        true,
        `${sportType} should be importable`,
      );
    }
  });

  it("does not import non-running Strava sport types", () => {
    for (const sportType of [
      "Ride",
      "Swim",
      "Walk",
      "Hike",
      "WeightTraining",
      "UnknownSport",
    ]) {
      assert.equal(
        isSupportedStravaRun(activity({ sportType })),
        false,
        `${sportType} should not be importable`,
      );
    }
  });

  it("rejects Strava runs with missing or zero distance or moving time", () => {
    assert.equal(isValidStravaRunActivity(activity()), true);
    assert.equal(isValidStravaRunActivity(activity({ distanceM: 0 })), false);
    assert.equal(isValidStravaRunActivity(activity({ distanceM: null })), false);
    assert.equal(isValidStravaRunActivity(activity({ movingTimeSec: 0 })), false);
    assert.equal(
      isValidStravaRunActivity(activity({ movingTimeSec: null })),
      false,
    );
  });

  it("matches exact-date unlogged planned run workouts", () => {
    const match = findExactDatePlannedWorkoutMatch({
      activity: activity(),
      plannedWorkouts: [
        {
          ...plannedWorkout,
          id: "planned-wrong-date",
          workout_date: "2026-05-17",
        },
        plannedWorkout,
      ],
      loggedPlannedWorkoutIds: new Set(),
    });

    assert.equal(match?.id, "planned-1");

    const noMatch = findExactDatePlannedWorkoutMatch({
      activity: activity(),
      plannedWorkouts: [plannedWorkout],
      loggedPlannedWorkoutIds: new Set(["planned-1"]),
    });

    assert.equal(noMatch, null);
  });

  it("never matches same-day rest or strength workouts", () => {
    const restMatch = findExactDatePlannedWorkoutMatch({
      activity: activity(),
      plannedWorkouts: [
        plannedWorkoutRow({
          id: "planned-rest",
          workout_type: "rest",
        }),
      ],
      loggedPlannedWorkoutIds: new Set(),
    });
    const strengthMatch = findExactDatePlannedWorkoutMatch({
      activity: activity(),
      plannedWorkouts: [
        plannedWorkoutRow({
          id: "planned-strength",
          workout_type: "strength_optional",
        }),
      ],
      loggedPlannedWorkoutIds: new Set(),
    });

    assert.equal(restMatch, null);
    assert.equal(strengthMatch, null);
  });

  it("builds a logged workout input from a Strava run", () => {
    const input = buildStravaLoggedWorkoutInput({
      activity: activity({
        sportType: "VirtualRun",
      }),
      profile,
      raceGoal,
      plan,
      plannedWorkout,
    });

    assert.deepEqual(input, {
      profile_id: "profile-1",
      race_goal_id: "race-goal-1",
      training_plan_id: "plan-1",
      planned_workout_id: "planned-1",
      workout_date: "2026-05-18",
      workout_type: "treadmill_run",
      source: "strava",
      source_activity_id: "strava-1",
      distance_km: 5,
      duration_sec: 1800,
      avg_pace_sec_per_km: 360,
      avg_heart_rate: 140,
      max_heart_rate: 170,
      cadence: null,
      elevation_gain_m: 20,
      rpe: null,
      notes: "Imported from Strava: Morning Run",
    });
  });

  it("maps missing heart rate to null and still imports the run", async () => {
    const { calls, dependencies } = createImportDependencies();

    const summary = await importStravaActivitiesForActivePlan({
      userId: "user-1",
      profile,
      raceGoal,
      plan,
      plannedWorkouts: [plannedWorkout],
      loggedWorkouts: [],
      workoutEvaluations: [],
      activities: [
        activity({
          id: "missing-heart-rate",
          averageHeartRate: null,
          maxHeartRate: null,
        }),
      ],
      dependencies,
    });

    assert.equal(summary.imported, 1);
    assert.equal(calls.savedLoggedWorkoutInputs.length, 1);
    assert.equal(calls.savedLoggedWorkoutInputs[0].avg_heart_rate, null);
    assert.equal(calls.savedLoggedWorkoutInputs[0].max_heart_rate, null);
    assert.equal(calls.savedAuditRows.length, 1);
    assert.equal(calls.savedAuditRows[0].average_heart_rate, null);
    assert.equal(calls.savedAuditRows[0].max_heart_rate, null);
  });

  it("skips zero-distance runs without saving rows", async () => {
    const { calls, dependencies } = createImportDependencies();

    const summary = await importStravaActivitiesForActivePlan({
      userId: "user-1",
      profile,
      raceGoal,
      plan,
      plannedWorkouts: [plannedWorkout],
      loggedWorkouts: [],
      workoutEvaluations: [],
      activities: [activity({ id: "zero-distance", distanceM: 0 })],
      dependencies,
    });

    assert.equal(summary.imported, 0);
    assert.equal(summary.skippedInvalid, 1);
    assert.equal(calls.savedLoggedWorkoutInputs.length, 0);
    assert.equal(calls.savedAuditRows.length, 0);
  });

  it("skips zero-moving-time runs without saving rows", async () => {
    const { calls, dependencies } = createImportDependencies();

    const summary = await importStravaActivitiesForActivePlan({
      userId: "user-1",
      profile,
      raceGoal,
      plan,
      plannedWorkouts: [plannedWorkout],
      loggedWorkouts: [],
      workoutEvaluations: [],
      activities: [activity({ id: "zero-moving-time", movingTimeSec: 0 })],
      dependencies,
    });

    assert.equal(summary.imported, 0);
    assert.equal(summary.skippedInvalid, 1);
    assert.equal(calls.savedLoggedWorkoutInputs.length, 0);
    assert.equal(calls.savedAuditRows.length, 0);
  });

  it("skips duplicate Strava activities without saving rows", async () => {
    const { calls, dependencies } = createImportDependencies({
      isDuplicate: async () => true,
    });

    const summary = await importStravaActivitiesForActivePlan({
      userId: "user-1",
      profile,
      raceGoal,
      plan,
      plannedWorkouts: [plannedWorkout],
      loggedWorkouts: [],
      workoutEvaluations: [],
      activities: [activity({ id: "already-imported" })],
      dependencies,
    });

    assert.equal(summary.imported, 0);
    assert.equal(summary.skippedDuplicates, 1);
    assert.deepEqual(summary.activityResults, [
      {
        stravaActivityId: "already-imported",
        name: "Morning Run",
        date: "2026-05-18",
        distanceKm: 5,
        avgPaceSecPerKm: 360,
        status: "skipped_duplicate",
        statusMessage: "Skipped: this Strava activity was already imported",
      },
    ]);
    assert.equal(calls.savedLoggedWorkoutInputs.length, 0);
    assert.equal(calls.savedAuditRows.length, 0);
  });

  it("reports an exact repeat Strava import as a duplicate before checking same-day coverage", async () => {
    const { calls, dependencies } = createImportDependencies({
      isDuplicate: async () => true,
    });

    const summary = await importStravaActivitiesForActivePlan({
      userId: "user-1",
      profile,
      raceGoal,
      plan,
      plannedWorkouts: [plannedWorkout],
      loggedWorkouts: [
        loggedWorkout({
          id: "logged-already-imported",
          source: "strava",
          source_activity_id: "already-imported",
          workout_date: "2026-05-18",
        }),
      ],
      workoutEvaluations: [],
      activities: [activity({ id: "already-imported" })],
      dependencies,
    });

    assert.equal(summary.imported, 0);
    assert.equal(summary.skippedDuplicates, 1);
    assert.equal(summary.skippedAlreadyLogged, 0);
    assert.equal(summary.activityResults[0].status, "skipped_duplicate");
    assert.equal(calls.savedLoggedWorkoutInputs.length, 0);
    assert.equal(calls.savedAuditRows.length, 0);
  });

  it("skips Strava runs before the active plan start", async () => {
    const { calls, dependencies } = createImportDependencies();

    const summary = await importStravaActivitiesForActivePlan({
      userId: "user-1",
      profile,
      raceGoal,
      plan,
      plannedWorkouts: [
        plannedWorkoutRow({
          id: "planned-before-start",
          workout_date: "2026-05-17",
        }),
      ],
      loggedWorkouts: [],
      workoutEvaluations: [],
      activities: [
        activity({
          id: "before-plan-start",
          startDate: "2026-05-17T11:00:00Z",
          startDateLocal: "2026-05-17T07:00:00",
        }),
      ],
      dependencies,
    });

    assert.equal(summary.imported, 0);
    assert.equal(summary.skippedBeforePlanStart, 1);
    assert.deepEqual(summary.activityResults, [
      {
        stravaActivityId: "before-plan-start",
        name: "Morning Run",
        date: "2026-05-17",
        distanceKm: 5,
        avgPaceSecPerKm: 360,
        status: "skipped_before_plan_start",
        statusMessage: "Skipped: before the active plan starts",
      },
    ]);
    assert.equal(calls.savedLoggedWorkoutInputs.length, 0);
    assert.equal(calls.savedAuditRows.length, 0);
  });

  it("reports before-plan Strava runs as before-plan even when an old audit row exists", async () => {
    const { calls, dependencies } = createImportDependencies({
      isDuplicate: async () => true,
    });

    const summary = await importStravaActivitiesForActivePlan({
      userId: "user-1",
      profile,
      raceGoal,
      plan,
      plannedWorkouts: [],
      loggedWorkouts: [],
      workoutEvaluations: [],
      activities: [
        activity({
          id: "old-audit-before-plan",
          startDate: "2026-05-17T11:00:00Z",
          startDateLocal: "2026-05-17T07:00:00",
        }),
      ],
      dependencies,
    });

    assert.equal(summary.imported, 0);
    assert.equal(summary.skippedBeforePlanStart, 1);
    assert.equal(summary.skippedDuplicates, 0);
    assert.equal(summary.activityResults[0].status, "skipped_before_plan_start");
    assert.equal(calls.savedLoggedWorkoutInputs.length, 0);
    assert.equal(calls.savedAuditRows.length, 0);
  });

  it("skips Strava runs on days already covered by a manual active-plan log", async () => {
    const { calls, dependencies } = createImportDependencies();

    const summary = await importStravaActivitiesForActivePlan({
      userId: "user-1",
      profile,
      raceGoal,
      plan,
      plannedWorkouts: [plannedWorkout],
      loggedWorkouts: [
        loggedWorkout({
          id: "manual-log-1",
          source: "manual",
          source_activity_id: null,
          planned_workout_id: null,
          workout_date: "2026-05-18",
        }),
      ],
      workoutEvaluations: [],
      activities: [activity({ id: "same-day-strava-run" })],
      dependencies,
    });

    assert.equal(summary.imported, 0);
    assert.equal(summary.skippedAlreadyLogged, 1);
    assert.deepEqual(summary.activityResults, [
      {
        stravaActivityId: "same-day-strava-run",
        name: "Morning Run",
        date: "2026-05-18",
        distanceKm: 5,
        avgPaceSecPerKm: 360,
        status: "skipped_already_logged",
        statusMessage:
          "Skipped: this active-plan day already has a logged workout",
      },
    ]);
    assert.equal(calls.savedLoggedWorkoutInputs.length, 0);
    assert.equal(calls.savedAuditRows.length, 0);
  });

  it("does not overwrite an already matched planned workout", async () => {
    const { calls, dependencies } = createImportDependencies();

    const summary = await importStravaActivitiesForActivePlan({
      userId: "user-1",
      profile,
      raceGoal,
      plan,
      plannedWorkouts: [plannedWorkout],
      loggedWorkouts: [
        loggedWorkout({
          id: "linked-log-1",
          planned_workout_id: "planned-1",
          workout_date: "2026-05-17",
        }),
      ],
      workoutEvaluations: [],
      activities: [activity({ id: "already-matched-planned-run" })],
      dependencies,
    });

    assert.equal(summary.imported, 0);
    assert.equal(summary.skippedAlreadyLogged, 1);
    assert.deepEqual(summary.activityResults, [
      {
        stravaActivityId: "already-matched-planned-run",
        name: "Morning Run",
        date: "2026-05-18",
        distanceKm: 5,
        avgPaceSecPerKm: 360,
        status: "skipped_already_logged",
        statusMessage:
          "Skipped: the planned workout is already matched to another log",
      },
    ]);
    assert.equal(calls.savedLoggedWorkoutInputs.length, 0);
    assert.equal(calls.savedAuditRows.length, 0);
  });

  it("imports same-day runs without planned workouts as unlinked and returns workout summaries", async () => {
    const { calls, dependencies } = createImportDependencies();

    const summary = await importStravaActivitiesForActivePlan({
      userId: "user-1",
      profile,
      raceGoal,
      plan,
      plannedWorkouts: [plannedWorkout],
      loggedWorkouts: [],
      workoutEvaluations: [],
      activities: [
        activity({
          id: "matched-list-run",
          name: "Morning Run",
          distanceM: 8200,
          movingTimeSec: 2657,
        }),
        activity({
          id: "unlinked-list-run",
          name: "Easy Run",
          startDate: "2026-05-19T11:00:00Z",
          startDateLocal: "2026-05-19T07:00:00",
          distanceM: 6000,
          movingTimeSec: 2088,
        }),
      ],
      dependencies,
    });

    assert.equal(summary.imported, 2);
    assert.equal(summary.linkedToPlanned, 1);
    assert.equal(summary.importedUnlinked, 1);
    assert.equal(calls.savedLoggedWorkoutInputs.length, 2);
    assert.equal(calls.savedLoggedWorkoutInputs[1].planned_workout_id, null);
    assert.deepEqual(summary.importedWorkouts, [
      {
        name: "Morning Run",
        date: "2026-05-18",
        distanceKm: 8.2,
        avgPaceSecPerKm: 324,
        matchStatus: "matched",
      },
      {
        name: "Easy Run",
        date: "2026-05-19",
        distanceKm: 6,
        avgPaceSecPerKm: 348,
        matchStatus: "unlinked",
      },
    ]);
    assert.deepEqual(summary.activityResults, [
      {
        stravaActivityId: "matched-list-run",
        name: "Morning Run",
        date: "2026-05-18",
        distanceKm: 8.2,
        avgPaceSecPerKm: 324,
        status: "imported_matched",
        statusMessage: "Imported: matched to planned workout",
      },
      {
        stravaActivityId: "unlinked-list-run",
        name: "Easy Run",
        date: "2026-05-19",
        distanceKm: 6,
        avgPaceSecPerKm: 348,
        status: "imported_unlinked",
        statusMessage: "Imported: no planned workout match",
      },
    ]);
  });

  it("counts duplicate, non-run, invalid, matched, scored, adjusted, and error outcomes", async () => {
    const savedAuditRows = [];
    const summary = await importStravaActivitiesForActivePlan({
      userId: "user-1",
      profile,
      raceGoal,
      plan,
      plannedWorkouts: [plannedWorkout],
      loggedWorkouts: [],
      workoutEvaluations: [],
      activities: [
        activity({ id: "duplicate-run" }),
        activity({ id: "ride-1", sportType: "Ride" }),
        activity({ id: "invalid-run", movingTimeSec: 0 }),
        activity({ id: "matched-run" }),
        activity({
          id: "unlinked-run",
          startDate: "2026-05-19T11:00:00Z",
          startDateLocal: "2026-05-19T07:00:00",
        }),
        activity({
          id: "error-run",
          startDate: "2026-05-20T11:00:00Z",
          startDateLocal: "2026-05-20T07:00:00",
        }),
      ],
      dependencies: {
        isDuplicate: async (stravaActivityId) =>
          stravaActivityId === "duplicate-run",
        saveLoggedWorkoutWithCompletion: async (input) => {
          if (input.loggedWorkoutInput.source_activity_id === "error-run") {
            throw new Error("Database insert failed.");
          }

          const savedLoggedWorkout = loggedWorkout({
            id: `logged-${input.loggedWorkoutInput.source_activity_id}`,
            planned_workout_id: input.plannedWorkout?.id ?? null,
            workout_date: input.loggedWorkoutInput.workout_date,
            distance_km: input.loggedWorkoutInput.distance_km,
            duration_sec: input.loggedWorkoutInput.duration_sec,
            avg_pace_sec_per_km: input.loggedWorkoutInput.avg_pace_sec_per_km,
            source_activity_id: input.loggedWorkoutInput.source_activity_id,
          });

          return {
            ok: true,
            loggedWorkout: savedLoggedWorkout,
            workoutEvaluation: input.plannedWorkout
              ? workoutEvaluation({
                  id: `evaluation-${input.loggedWorkoutInput.source_activity_id}`,
                  logged_workout_id: savedLoggedWorkout.id,
                })
              : null,
            scored: Boolean(input.plannedWorkout),
            adjusted:
              input.loggedWorkoutInput.source_activity_id === "matched-run",
            message: "Imported.",
            followupError: null,
          };
        },
        saveStravaActivity: async (input) => {
          savedAuditRows.push(input);
        },
      },
    });

    assert.equal(summary.ok, true);
    assert.equal(summary.imported, 2);
    assert.equal(summary.skippedDuplicates, 1);
    assert.equal(summary.skippedNonRuns, 1);
    assert.equal(summary.skippedInvalid, 1);
    assert.equal(summary.linkedToPlanned, 1);
    assert.equal(summary.importedUnlinked, 1);
    assert.equal(summary.scored, 1);
    assert.equal(summary.adjusted, 1);
    assert.equal(summary.importedWorkouts.length, 2);
    assert.equal(summary.activityResults.length, 6);
    assert.deepEqual(
      summary.activityResults.map((result) => result.status),
      [
        "skipped_duplicate",
        "skipped_non_run",
        "skipped_invalid",
        "imported_matched",
        "imported_unlinked",
        "skipped_error",
      ],
    );
    assert.equal(summary.errors.length, 1);
    assert.match(summary.errors[0], /error-run/);
    assert.equal(savedAuditRows.length, 2);
    assert.equal(savedAuditRows[0].strava_activity_id, "matched-run");
    assert.equal(savedAuditRows[0].planned_workout_id, "planned-1");
    assert.equal(savedAuditRows[1].strava_activity_id, "unlinked-run");
    assert.equal(savedAuditRows[1].planned_workout_id, null);
  });
});
