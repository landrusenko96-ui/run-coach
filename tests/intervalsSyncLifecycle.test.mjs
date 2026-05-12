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
    workout_date: overrides.workout_date ?? "2026-05-13",
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
