import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGarminBulkPublishCandidates,
  isGarminBulkPublishEligible,
  isWorkoutInGarminBulkPublishWindow,
} from "../lib/garminBridge/publishSelection.ts";

function structuredWorkout() {
  return {
    version: 1,
    sport: "Run",
    name: "Easy run",
    exportSafe: true,
    exportWarnings: [],
    steps: [
      {
        id: "main",
        type: "work",
        name: "Easy run",
        durationType: "time",
        durationValue: 1800,
        durationUnit: "seconds",
        targetType: "pace",
        targetMin: 360,
        targetMax: 420,
        targetUnit: "sec_per_km",
      },
    ],
  };
}

function plannedWorkout(overrides = {}) {
  return {
    id: overrides.id ?? "workout-1",
    training_plan_id: "plan-1",
    profile_id: "profile-1",
    workout_date: overrides.workout_date ?? "2026-05-17",
    workout_type: overrides.workout_type ?? "easy",
    status: overrides.status ?? "planned",
    title: overrides.title ?? "Easy run",
    structured_workout:
      "structured_workout" in overrides
        ? overrides.structured_workout
        : structuredWorkout(),
  };
}

function workoutExport(overrides = {}) {
  return {
    id: overrides.id ?? "export-1",
    planned_workout_id: overrides.planned_workout_id ?? "workout-1",
    training_plan_id: "plan-1",
    profile_id: "profile-1",
    export_provider: overrides.export_provider ?? "garmin_direct",
    export_mode: "single_publish",
    provider_workout_id:
      "provider_workout_id" in overrides
        ? overrides.provider_workout_id
        : "garmin-1",
    provider_schedule_id: overrides.provider_schedule_id ?? "schedule-1",
    sync_status: overrides.sync_status ?? "synced",
    scheduled_date: "2026-05-17",
    last_synced_at: "2026-05-17T12:00:00.000Z",
    last_verified_at: null,
    last_error: overrides.last_error ?? null,
    warnings: [],
    payload_snapshot: {},
    created_at: overrides.created_at ?? "2026-05-17T12:00:00.000Z",
    updated_at: "2026-05-17T12:00:00.000Z",
  };
}

describe("Garmin bulk publish selection", () => {
  it("treats today through day 6 as the next 7 calendar days", () => {
    assert.equal(
      isWorkoutInGarminBulkPublishWindow(
        plannedWorkout({ workout_date: "2026-05-17" }),
        "2026-05-17",
        7,
      ),
      true,
    );
    assert.equal(
      isWorkoutInGarminBulkPublishWindow(
        plannedWorkout({ workout_date: "2026-05-23" }),
        "2026-05-17",
        7,
      ),
      true,
    );
    assert.equal(
      isWorkoutInGarminBulkPublishWindow(
        plannedWorkout({ workout_date: "2026-05-24" }),
        "2026-05-17",
        7,
      ),
      false,
    );
  });

  it("includes today and future planned run workouts with structured workouts", () => {
    const workouts = [
      plannedWorkout({ id: "today", workout_date: "2026-05-17" }),
      plannedWorkout({
        id: "future",
        workout_date: "2026-05-20",
        workout_type: "long_run",
      }),
    ];

    assert.deepEqual(
      buildGarminBulkPublishCandidates({
        workouts,
        workoutExports: [],
        todayDateText: "2026-05-17",
        windowDays: 7,
      }).map((candidate) => candidate.workout.id),
      ["today", "future"],
    );
  });

  it("excludes past, completed, missed, skipped, non-run, and missing-structure workouts", () => {
    const excludedWorkouts = [
      plannedWorkout({ id: "past", workout_date: "2026-05-16" }),
      plannedWorkout({ id: "completed", status: "completed" }),
      plannedWorkout({ id: "missed", status: "missed" }),
      plannedWorkout({ id: "skipped", status: "skipped" }),
      plannedWorkout({ id: "rest", workout_type: "rest" }),
      plannedWorkout({
        id: "strength",
        workout_type: "strength_optional",
      }),
      plannedWorkout({ id: "cross-training", workout_type: "cross_training" }),
      plannedWorkout({ id: "missing-structure", structured_workout: null }),
    ];

    for (const workout of excludedWorkouts) {
      assert.equal(
        isGarminBulkPublishEligible(workout, "2026-05-17"),
        false,
        workout.id,
      );
    }
  });

  it("skips synced workouts and blocks stale workouts from duplicate publish", () => {
    const candidates = buildGarminBulkPublishCandidates({
      workouts: [
        plannedWorkout({ id: "synced" }),
        plannedWorkout({ id: "stale", workout_date: "2026-05-18" }),
        plannedWorkout({ id: "ready", workout_date: "2026-05-19" }),
      ],
      workoutExports: [
        workoutExport({ planned_workout_id: "synced", sync_status: "synced" }),
        workoutExport({ planned_workout_id: "stale", sync_status: "stale" }),
      ],
      todayDateText: "2026-05-17",
      windowDays: 7,
    });

    assert.deepEqual(
      candidates.map((candidate) => [candidate.workout.id, candidate.action]),
      [
        ["synced", "skip_synced"],
        ["stale", "invalid"],
        ["ready", "publish"],
      ],
    );
    assert.deepEqual(candidates[1].warnings, [
      "Changed after Garmin export — use bulk maintenance to update it.",
    ]);
  });

  it("includes failed retries when confirmation is enabled but still blocks partial existing exports", () => {
    const candidates = buildGarminBulkPublishCandidates({
      workouts: [
        plannedWorkout({ id: "failed" }),
        plannedWorkout({ id: "partial", workout_date: "2026-05-18" }),
      ],
      workoutExports: [
        workoutExport({
          planned_workout_id: "failed",
          sync_status: "failed",
          provider_workout_id: null,
        }),
        workoutExport({ planned_workout_id: "partial", sync_status: "partial" }),
      ],
      todayDateText: "2026-05-17",
      windowDays: 7,
      includeRetryStatuses: true,
    });

    assert.deepEqual(
      candidates.map((candidate) => [candidate.workout.id, candidate.action]),
      [
        ["failed", "publish"],
        ["partial", "invalid"],
      ],
    );
  });
});
