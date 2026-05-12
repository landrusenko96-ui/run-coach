import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIntervalsWorkoutSyncInput } from "../lib/db/intervalsWorkoutSyncShapes.ts";

const plannedWorkout = {
  id: "planned-workout-1",
  training_plan_id: "plan-1",
  profile_id: "profile-1",
};

describe("intervals workout sync database helpers", () => {
  it("builds a synced row from a planned workout", () => {
    const input = buildIntervalsWorkoutSyncInput({
      plannedWorkout,
      intervalsEventId: 123,
      syncStatus: "synced",
      lastSyncedAt: "2026-05-12T12:00:00.000Z",
      lastError: null,
    });

    assert.deepEqual(input, {
      planned_workout_id: "planned-workout-1",
      training_plan_id: "plan-1",
      profile_id: "profile-1",
      intervals_external_id: "planned-workout-1",
      intervals_event_id: 123,
      sync_status: "synced",
      last_synced_at: "2026-05-12T12:00:00.000Z",
      last_error: null,
    });
  });

  it("builds a failed row with the latest error", () => {
    const input = buildIntervalsWorkoutSyncInput({
      plannedWorkout,
      intervalsEventId: null,
      syncStatus: "failed",
      lastSyncedAt: null,
      lastError: "Intervals.icu rejected the workout.",
    });

    assert.equal(input.intervals_external_id, "planned-workout-1");
    assert.equal(input.intervals_event_id, null);
    assert.equal(input.sync_status, "failed");
    assert.equal(input.last_synced_at, null);
    assert.equal(input.last_error, "Intervals.icu rejected the workout.");
  });

  it("builds a needs_resync row for stale synced workouts", () => {
    const input = buildIntervalsWorkoutSyncInput({
      plannedWorkout,
      intervalsEventId: 123,
      syncStatus: "needs_resync",
      lastSyncedAt: "2026-05-12T12:00:00.000Z",
      lastError: null,
    });

    assert.equal(input.intervals_external_id, "planned-workout-1");
    assert.equal(input.intervals_event_id, 123);
    assert.equal(input.sync_status, "needs_resync");
    assert.equal(input.last_synced_at, "2026-05-12T12:00:00.000Z");
    assert.equal(input.last_error, null);
  });
});
