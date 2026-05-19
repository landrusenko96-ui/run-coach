import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isGarminExportDeletedEligible,
  isGarminExportStaleEligible,
} from "../lib/garminBridge/exportLifecycle.ts";

function workoutExport(overrides = {}) {
  return {
    id: overrides.id ?? "export-1",
    planned_workout_id:
      "planned_workout_id" in overrides
        ? overrides.planned_workout_id
        : "workout-1",
    training_plan_id:
      "training_plan_id" in overrides ? overrides.training_plan_id : "plan-1",
    profile_id: "profile-1",
    export_provider: overrides.export_provider ?? "garmin_direct",
    export_mode: "single_publish",
    provider_workout_id: overrides.provider_workout_id ?? "garmin-1",
    provider_schedule_id: overrides.provider_schedule_id ?? "schedule-1",
    sync_status: overrides.sync_status ?? "synced",
    scheduled_date: "2026-05-20",
    last_synced_at: "2026-05-20T12:00:00.000Z",
    last_verified_at: null,
    last_error: overrides.last_error ?? null,
    warnings: [],
    payload_snapshot: {},
    created_at: "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-20T12:00:00.000Z",
  };
}

describe("Garmin export lifecycle helpers", () => {
  it("marks synced and partial Garmin exports stale for changed workouts", () => {
    assert.equal(
      isGarminExportStaleEligible(
        workoutExport({ sync_status: "synced" }),
        ["workout-1"],
      ),
      true,
    );
    assert.equal(
      isGarminExportStaleEligible(
        workoutExport({ sync_status: "partial" }),
        ["workout-1"],
      ),
      true,
    );
  });

  it("does not mark failed Garmin exports stale", () => {
    assert.equal(
      isGarminExportStaleEligible(
        workoutExport({ sync_status: "failed" }),
        ["workout-1"],
      ),
      false,
    );
  });

  it("does not mark unrelated providers or deleted plan rows stale", () => {
    assert.equal(
      isGarminExportStaleEligible(
        workoutExport({ export_provider: "intervals_icu" }),
        ["workout-1"],
      ),
      false,
    );
    assert.equal(
      isGarminExportStaleEligible(
        workoutExport({ planned_workout_id: null }),
        ["workout-1"],
      ),
      false,
    );
  });

  it("selects direct Garmin exports for local deleted marking", () => {
    assert.equal(
      isGarminExportDeletedEligible(workoutExport(), "plan-1"),
      true,
    );
    assert.equal(
      isGarminExportDeletedEligible(
        workoutExport({ sync_status: "deleted" }),
        "plan-1",
      ),
      false,
    );
    assert.equal(
      isGarminExportDeletedEligible(
        workoutExport({ training_plan_id: null }),
        "plan-1",
      ),
      false,
    );
  });
});
