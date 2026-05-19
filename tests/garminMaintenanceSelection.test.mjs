import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGarminBulkMaintenanceCandidates,
} from "../lib/garminBridge/maintenanceSelection.ts";

function plannedWorkout(overrides = {}) {
  return {
    id: overrides.id ?? "workout-1",
    training_plan_id: "plan-1",
    profile_id: "profile-1",
    workout_date: overrides.workout_date ?? "2026-05-17",
    workout_type: overrides.workout_type ?? "easy",
    status: overrides.status ?? "planned",
    title: overrides.title ?? "Easy run",
    structured_workout: {},
  };
}

function workoutExport(overrides = {}) {
  return {
    id: overrides.id ?? `export-${overrides.planned_workout_id ?? "workout-1"}`,
    planned_workout_id: overrides.planned_workout_id ?? "workout-1",
    training_plan_id: "plan-1",
    profile_id: "profile-1",
    export_provider: overrides.export_provider ?? "garmin_direct",
    export_mode: "single_publish",
    provider_workout_id:
      "provider_workout_id" in overrides
        ? overrides.provider_workout_id
        : `garmin-${overrides.planned_workout_id ?? "workout-1"}`,
    provider_schedule_id: "schedule-1",
    sync_status: overrides.sync_status ?? "stale",
    scheduled_date: "2026-05-17",
    last_synced_at: "2026-05-13T12:00:00.000Z",
    last_verified_at: null,
    last_error: null,
    warnings: [],
    payload_snapshot: {},
    created_at: overrides.created_at ?? "2026-05-13T12:00:00.000Z",
    updated_at: "2026-05-13T12:00:00.000Z",
  };
}

describe("Garmin bulk maintenance selection", () => {
  it("includes today and future stale exports for update", () => {
    const workouts = [
      plannedWorkout({ id: "today", workout_date: "2026-05-17" }),
      plannedWorkout({ id: "future", workout_date: "2026-05-20" }),
    ];
    const exports = [
      workoutExport({ planned_workout_id: "today", sync_status: "stale" }),
      workoutExport({ planned_workout_id: "future", sync_status: "stale" }),
    ];

    assert.deepEqual(
      buildGarminBulkMaintenanceCandidates({
        mode: "update_stale",
        workouts,
        workoutExports: exports,
        todayDateText: "2026-05-17",
        windowDays: 7,
      }).map((candidate) => [
        candidate.workout.id,
        candidate.plannedAction,
      ]),
      [
        ["today", "update"],
        ["future", "update"],
      ],
    );
  });

  it("excludes non-stale, no-export, no-provider, past, completed, missed, and skipped workouts from update", () => {
    const workouts = [
      plannedWorkout({ id: "synced" }),
      plannedWorkout({ id: "partial" }),
      plannedWorkout({ id: "failed" }),
      plannedWorkout({ id: "deleted" }),
      plannedWorkout({ id: "no-export" }),
      plannedWorkout({ id: "no-provider" }),
      plannedWorkout({ id: "past", workout_date: "2026-05-16" }),
      plannedWorkout({ id: "completed", status: "completed" }),
      plannedWorkout({ id: "missed", status: "missed" }),
      plannedWorkout({ id: "skipped", status: "skipped" }),
    ];
    const exports = [
      workoutExport({ planned_workout_id: "synced", sync_status: "synced" }),
      workoutExport({ planned_workout_id: "partial", sync_status: "partial" }),
      workoutExport({ planned_workout_id: "failed", sync_status: "failed" }),
      workoutExport({ planned_workout_id: "deleted", sync_status: "deleted" }),
      workoutExport({
        planned_workout_id: "no-provider",
        provider_workout_id: null,
      }),
      workoutExport({ planned_workout_id: "past", sync_status: "stale" }),
      workoutExport({ planned_workout_id: "completed", sync_status: "stale" }),
      workoutExport({ planned_workout_id: "missed", sync_status: "stale" }),
      workoutExport({ planned_workout_id: "skipped", sync_status: "stale" }),
    ];

    assert.deepEqual(
      buildGarminBulkMaintenanceCandidates({
        mode: "update_stale",
        workouts,
        workoutExports: exports,
        todayDateText: "2026-05-17",
        windowDays: 7,
      }),
      [],
    );
  });

  it("includes synced, stale, and partial future exports for delete", () => {
    const workouts = [
      plannedWorkout({ id: "synced", workout_date: "2026-05-17" }),
      plannedWorkout({ id: "stale", workout_date: "2026-05-18" }),
      plannedWorkout({ id: "partial", workout_date: "2026-05-19" }),
    ];
    const exports = [
      workoutExport({ planned_workout_id: "synced", sync_status: "synced" }),
      workoutExport({ planned_workout_id: "stale", sync_status: "stale" }),
      workoutExport({ planned_workout_id: "partial", sync_status: "partial" }),
    ];

    assert.deepEqual(
      buildGarminBulkMaintenanceCandidates({
        mode: "delete_selected",
        workouts,
        workoutExports: exports,
        todayDateText: "2026-05-17",
        windowDays: 7,
      }).map((candidate) => [
        candidate.workout.id,
        candidate.currentStatus,
        candidate.plannedAction,
      ]),
      [
        ["synced", "synced", "delete"],
        ["stale", "stale", "delete"],
        ["partial", "partial", "delete"],
      ],
    );
  });

  it("delete selection respects 7-day and 14-day windows", () => {
    const workouts = [
      plannedWorkout({ id: "day-7", workout_date: "2026-05-23" }),
      plannedWorkout({ id: "day-8", workout_date: "2026-05-24" }),
      plannedWorkout({ id: "day-14", workout_date: "2026-05-30" }),
      plannedWorkout({ id: "day-15", workout_date: "2026-05-31" }),
    ];
    const exports = workouts.map((workout) =>
      workoutExport({
        planned_workout_id: workout.id,
        sync_status: "synced",
      }),
    );
    const buildIds = (windowDays) =>
      buildGarminBulkMaintenanceCandidates({
        mode: "delete_selected",
        workouts,
        workoutExports: exports,
        todayDateText: "2026-05-17",
        windowDays,
      }).map((candidate) => candidate.workout.id);

    assert.deepEqual(buildIds(7), ["day-7"]);
    assert.deepEqual(buildIds(14), ["day-7", "day-8", "day-14"]);
  });
});
