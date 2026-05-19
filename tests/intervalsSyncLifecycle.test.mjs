import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deleteTrainingPlanWithIntervalsCleanup } from "../lib/intervals/deleteCleanup.ts";
import {
  getFutureIntervalsSyncDeleteCandidates,
  getSyncsToMarkNeedsResync,
} from "../lib/intervals/syncLifecycle.ts";

function syncRow(overrides = {}) {
  const plannedWorkoutId = overrides.planned_workout_id ?? "workout-1";

  return {
    id: overrides.id ?? "sync-1",
    planned_workout_id: plannedWorkoutId,
    training_plan_id: "plan-1",
    profile_id: "profile-1",
    intervals_external_id: overrides.intervals_external_id ?? plannedWorkoutId,
    intervals_event_id: 123,
    sync_status: overrides.sync_status ?? "synced",
    last_synced_at: "2026-05-11T12:00:00.000Z",
    last_error: null,
    created_at: "2026-05-11T12:00:00.000Z",
    updated_at: "2026-05-11T12:00:00.000Z",
  };
}

function plannedWorkout(overrides = {}) {
  return {
    id: overrides.id ?? "workout-1",
    training_plan_id: "plan-1",
    profile_id: "profile-1",
    race_goal_id: "goal-1",
    workout_date: overrides.workout_date ?? "2026-05-13",
    week_number: 1,
    day_label: "wednesday",
    workout_type: overrides.workout_type ?? "easy",
    title: overrides.title ?? "Easy run",
    description: null,
    distance_km: null,
    duration_min: null,
    target_pace_min_sec_per_km: null,
    target_pace_max_sec_per_km: null,
    target_hr_zone: null,
    terrain: null,
    purpose: null,
    instructions: null,
    structured_workout: null,
    status: overrides.status ?? "planned",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
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
    sync_status: overrides.sync_status ?? "synced",
    scheduled_date: "2026-05-13",
    last_synced_at: "2026-05-11T12:00:00.000Z",
    last_verified_at: null,
    last_error: null,
    warnings: [],
    payload_snapshot: {},
    created_at: "2026-05-11T12:00:00.000Z",
    updated_at: "2026-05-11T12:00:00.000Z",
  };
}

function deletePlanResult() {
  return {
    deleted_training_plan_id: "plan-1",
    deleted_plan_name: "Example plan",
    was_active: true,
    deleted_planned_workout_count: 2,
    deleted_workout_evaluation_count: 0,
    unlinked_logged_workout_count: 0,
  };
}

describe("Intervals sync lifecycle helpers", () => {
  it("selects only synced rows for needs_resync invalidation", () => {
    const syncs = [
      syncRow({ id: "synced", planned_workout_id: "workout-1" }),
      syncRow({
        id: "not-synced",
        planned_workout_id: "workout-2",
        sync_status: "not_synced",
      }),
      syncRow({
        id: "failed",
        planned_workout_id: "workout-3",
        sync_status: "failed",
      }),
      syncRow({
        id: "deleted",
        planned_workout_id: "workout-4",
        sync_status: "deleted",
      }),
    ];

    assert.deepEqual(
      getSyncsToMarkNeedsResync(syncs, [
        "workout-1",
        "workout-2",
        "workout-3",
        "workout-4",
      ]).map((sync) => sync.id),
      ["synced"],
    );
  });

  it("builds Intervals delete candidates for synced and stale future workouts", () => {
    const candidates = getFutureIntervalsSyncDeleteCandidates({
      todayDateText: "2026-05-12",
      plannedWorkouts: [
        plannedWorkout({ id: "future-synced", workout_date: "2026-05-13" }),
        plannedWorkout({ id: "future-stale", workout_date: "2026-05-14" }),
        plannedWorkout({ id: "past-synced", workout_date: "2026-05-11" }),
        plannedWorkout({ id: "future-failed", workout_date: "2026-05-15" }),
      ],
      syncs: [
        syncRow({
          id: "sync-future",
          planned_workout_id: "future-synced",
          intervals_external_id: "future-synced",
          sync_status: "synced",
        }),
        syncRow({
          id: "sync-stale",
          planned_workout_id: "future-stale",
          intervals_external_id: "future-stale",
          sync_status: "needs_resync",
        }),
        syncRow({
          id: "sync-past",
          planned_workout_id: "past-synced",
          intervals_external_id: "past-synced",
          sync_status: "synced",
        }),
        syncRow({
          id: "sync-failed",
          planned_workout_id: "future-failed",
          intervals_external_id: "future-failed",
          sync_status: "failed",
        }),
      ],
    });

    assert.deepEqual(candidates, [
      {
        syncId: "sync-future",
        externalId: "future-synced",
        plannedWorkoutId: "future-synced",
      },
      {
        syncId: "sync-stale",
        externalId: "future-stale",
        plannedWorkoutId: "future-stale",
      },
    ]);
  });

  it("deletes future Intervals events before deleting the local plan", async () => {
    const deleteInputs = [];
    let localDeleteCalled = false;

    const result = await deleteTrainingPlanWithIntervalsCleanup(
      {
        trainingPlanId: "plan-1",
        todayDateText: "2026-05-12",
      },
      {
        fetchPlannedWorkouts: async () => [
          plannedWorkout({ id: "workout-1", workout_date: "2026-05-13" }),
          plannedWorkout({ id: "workout-2", workout_date: "2026-05-14" }),
        ],
        fetchIntervalsWorkoutSyncsForTrainingPlan: async () => [
          syncRow({ id: "sync-1", planned_workout_id: "workout-1" }),
          syncRow({
            id: "sync-2",
            planned_workout_id: "workout-2",
            sync_status: "needs_resync",
          }),
        ],
        markIntervalsWorkoutSyncsFailedByIds: async () => [],
        bulkDeleteCalendarEvents: async (inputs) => {
          deleteInputs.push(...inputs);
          return inputs.length;
        },
        deleteTrainingPlanAndRelatedData: async () => {
          localDeleteCalled = true;
          return deletePlanResult();
        },
      },
    );

    assert.equal(localDeleteCalled, true);
    assert.deepEqual(deleteInputs, [
      { external_id: "workout-1" },
      { external_id: "workout-2" },
    ]);
    assert.equal(result.intervals_delete_attempt_count, 2);
    assert.equal(result.intervals_deleted_event_count, 2);
    assert.equal(result.garmin_direct_exports_marked_deleted_count, 0);
  });

  it("deletes app plan only and marks future Garmin exports deleted locally without calling Garmin", async () => {
    const callOrder = [];
    const updatedExports = [];

    const result = await deleteTrainingPlanWithIntervalsCleanup(
      {
        trainingPlanId: "plan-1",
        garminCleanupMode: "app_only",
        todayDateText: "2026-05-12",
      },
      {
        fetchPlannedWorkouts: async () => [
          plannedWorkout({ id: "future", workout_date: "2026-05-13" }),
        ],
        fetchIntervalsWorkoutSyncsForTrainingPlan: async () => [],
        markIntervalsWorkoutSyncsFailedByIds: async () => [],
        fetchWorkoutExportsForTrainingPlan: async () => [
          workoutExport({ id: "export-future", planned_workout_id: "future" }),
          workoutExport({
            id: "export-future-duplicate",
            planned_workout_id: "future",
            provider_workout_id: "garmin-duplicate",
            created_at: "2026-05-11T13:00:00.000Z",
          }),
        ],
        updateGarminWorkoutExportAfterDelete: async (workoutExportUpdate) => {
          callOrder.push(`mark:${workoutExportUpdate.id}`);
          updatedExports.push(workoutExportUpdate);
          return workoutExport({
            id: workoutExportUpdate.id,
            planned_workout_id: "future",
            sync_status: workoutExportUpdate.sync_status,
          });
        },
        deleteDirectGarminWorkout: async () => {
          throw new Error("Garmin should not be called for app-only deletion.");
        },
        deleteTrainingPlanAndRelatedData: async () => {
          callOrder.push("delete-plan");
          return deletePlanResult();
        },
      },
    );

    assert.deepEqual(callOrder, [
      "mark:export-future",
      "mark:export-future-duplicate",
      "delete-plan",
    ]);
    assert.equal(result.garmin_cleanup_mode, "app_only");
    assert.equal(result.garmin_future_export_count, 2);
    assert.equal(result.garmin_delete_attempt_count, 0);
    assert.equal(result.garmin_direct_exports_marked_deleted_count, 2);
    assert.equal(updatedExports[0].sync_status, "deleted");
    assert.match(
      updatedExports[0].warnings[0],
      /Garmin cleanup was not attempted/,
    );
  });

  it("does not delete the local plan when app-only Garmin tracking fails", async () => {
    let localDeleteCalled = false;

    await assert.rejects(
      () =>
        deleteTrainingPlanWithIntervalsCleanup(
          {
            trainingPlanId: "plan-1",
            garminCleanupMode: "app_only",
            todayDateText: "2026-05-12",
          },
          {
            fetchPlannedWorkouts: async () => [
              plannedWorkout({ id: "future", workout_date: "2026-05-13" }),
            ],
            fetchIntervalsWorkoutSyncsForTrainingPlan: async () => [],
            markIntervalsWorkoutSyncsFailedByIds: async () => [],
            fetchWorkoutExportsForTrainingPlan: async () => [
              workoutExport({ id: "export-future", planned_workout_id: "future" }),
            ],
            updateGarminWorkoutExportAfterDelete: async () => {
              throw new Error("Could not update workout_exports.");
            },
            deleteTrainingPlanAndRelatedData: async () => {
              localDeleteCalled = true;
              return deletePlanResult();
            },
          },
        ),
      /Could not update workout_exports/,
    );

    assert.equal(localDeleteCalled, false);
  });

  it("attempts Garmin deletion only for future eligible exports and still deletes the app plan after recorded failures", async () => {
    const garminDeleteIds = [];
    const updatedExports = [];
    let localDeleteCalled = false;

    const result = await deleteTrainingPlanWithIntervalsCleanup(
      {
        trainingPlanId: "plan-1",
        garminCleanupMode: "attempt_future_delete",
        todayDateText: "2026-05-12",
      },
      {
        fetchPlannedWorkouts: async () => [
          plannedWorkout({ id: "future-synced", workout_date: "2026-05-13" }),
          plannedWorkout({ id: "future-partial", workout_date: "2026-05-14" }),
          plannedWorkout({ id: "future-failed", workout_date: "2026-05-15" }),
          plannedWorkout({ id: "past", workout_date: "2026-05-11" }),
          plannedWorkout({ id: "completed", status: "completed" }),
          plannedWorkout({ id: "missed", status: "missed" }),
          plannedWorkout({ id: "skipped", status: "skipped" }),
        ],
        fetchIntervalsWorkoutSyncsForTrainingPlan: async () => [],
        markIntervalsWorkoutSyncsFailedByIds: async () => [],
        fetchWorkoutExportsForTrainingPlan: async () => [
          workoutExport({
            id: "export-future-synced",
            planned_workout_id: "future-synced",
            sync_status: "synced",
          }),
          workoutExport({
            id: "export-future-synced-duplicate",
            planned_workout_id: "future-synced",
            provider_workout_id: "garmin-duplicate-future-synced",
            sync_status: "synced",
          }),
          workoutExport({
            id: "export-future-partial",
            planned_workout_id: "future-partial",
            sync_status: "partial",
          }),
          workoutExport({
            id: "export-future-failed",
            planned_workout_id: "future-failed",
            sync_status: "stale",
          }),
          workoutExport({ id: "export-past", planned_workout_id: "past" }),
          workoutExport({
            id: "export-completed",
            planned_workout_id: "completed",
          }),
          workoutExport({ id: "export-missed", planned_workout_id: "missed" }),
          workoutExport({ id: "export-skipped", planned_workout_id: "skipped" }),
        ],
        updateGarminWorkoutExportAfterDelete: async (workoutExportUpdate) => {
          updatedExports.push(workoutExportUpdate);
          return workoutExport({
            id: workoutExportUpdate.id,
            sync_status: workoutExportUpdate.sync_status,
          });
        },
        deleteDirectGarminWorkout: async (plannedWorkoutId, candidate) => {
          garminDeleteIds.push(
            `${plannedWorkoutId}:${candidate?.garminWorkoutId ?? "missing"}`,
          );

          if (plannedWorkoutId === "future-synced") {
            return {
              ok: true,
              status: "DELETED",
              plannedWorkoutId,
              message: "Deleted.",
              deleteResult: null,
              exportRecord: null,
              trackingError: null,
            };
          }

          if (plannedWorkoutId === "future-partial") {
            return {
              ok: false,
              status: "UNSCHEDULED_ONLY",
              plannedWorkoutId,
              message: "Unscheduled only.",
              deleteResult: null,
              exportRecord: null,
              trackingError: null,
            };
          }

          return {
            ok: false,
            status: "GARMIN_REJECTED",
            plannedWorkoutId,
            message: "Garmin rejected the delete request.",
            deleteResult: null,
            exportRecord: null,
            trackingError: null,
          };
        },
        deleteTrainingPlanAndRelatedData: async () => {
          localDeleteCalled = true;
          return deletePlanResult();
        },
      },
    );

    assert.equal(localDeleteCalled, true);
    assert.deepEqual(garminDeleteIds, [
      "future-synced:garmin-future-synced",
      "future-synced:garmin-duplicate-future-synced",
      "future-partial:garmin-future-partial",
      "future-failed:garmin-future-failed",
    ]);
    assert.equal(result.garmin_delete_attempt_count, 4);
    assert.equal(result.garmin_deleted_count, 2);
    assert.equal(result.garmin_partial_count, 1);
    assert.equal(result.garmin_failed_count, 1);
    assert.deepEqual(
      updatedExports.map((workoutExportUpdate) => workoutExportUpdate.sync_status),
      ["deleted", "deleted", "partial", "failed"],
    );
    assert.match(updatedExports[3].last_error, /Garmin rejected/);
  });

  it("blocks local plan deletion when Intervals delete fails and marks rows failed", async () => {
    const failedSyncUpdates = [];
    let localDeleteCalled = false;

    await assert.rejects(
      () =>
        deleteTrainingPlanWithIntervalsCleanup(
          {
            trainingPlanId: "plan-1",
            todayDateText: "2026-05-12",
          },
          {
            fetchPlannedWorkouts: async () => [
              plannedWorkout({ id: "workout-1", workout_date: "2026-05-13" }),
            ],
            fetchIntervalsWorkoutSyncsForTrainingPlan: async () => [
              syncRow({ id: "sync-1", planned_workout_id: "workout-1" }),
            ],
            markIntervalsWorkoutSyncsFailedByIds: async (syncIds, lastError) => {
              failedSyncUpdates.push({ syncIds, lastError });
              return [];
            },
            bulkDeleteCalendarEvents: async () => {
              throw new Error("Intervals rejected the delete.");
            },
            deleteTrainingPlanAndRelatedData: async () => {
              localDeleteCalled = true;
              return deletePlanResult();
            },
          },
        ),
      /Local plan was not deleted/,
    );

    assert.equal(localDeleteCalled, false);
    assert.equal(failedSyncUpdates.length, 1);
    assert.deepEqual(failedSyncUpdates[0].syncIds, ["sync-1"]);
    assert.match(
      failedSyncUpdates[0].lastError,
      /Intervals rejected the delete/,
    );
  });
});
