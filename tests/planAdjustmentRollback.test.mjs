import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRollbackUpdatesFromAdjustments,
  extractRollbackUpdatesFromAdjustment,
  filterRollbackUpdatesBlockedByNewerAdjustments,
} from "../lib/training/planAdjustmentRollback.ts";

const baseAdjustment = {
  id: "adjustment-1",
  profile_id: "profile-1",
  race_goal_id: "goal-1",
  training_plan_id: "plan-1",
  logged_workout_id: "logged-1",
  workout_evaluation_id: "evaluation-1",
  adjustment_type: "reduce_next_intensity",
  reason: "Latest workout was high risk.",
  explanation: "The next hard session was reduced.",
  affected_workout_ids: ["planned-2"],
  before_snapshot: {
    workouts: [
      {
        id: "planned-2",
        workout_date: "2026-05-07",
        workout_type: "tempo",
        title: "Tempo run",
        description: "Original tempo workout.",
        distance_km: 8,
        duration_min: 50,
        target_pace_min_sec_per_km: 320,
        target_pace_max_sec_per_km: 340,
        target_hr_zone: "Zone 3",
        purpose: "Build threshold fitness.",
        instructions: "Run controlled tempo intervals.",
        structured_workout: null,
      },
    ],
  },
  after_snapshot: null,
  created_at: "2026-05-05T12:00:00.000Z",
};

describe("plan adjustment rollback helpers", () => {
  it("extracts valid before_snapshot workouts", () => {
    const result = extractRollbackUpdatesFromAdjustment(baseAdjustment);

    assert.equal(result.needsRegenerationWarning, false);
    assert.deepEqual(result.rollbackUpdates, [
      {
        id: "planned-2",
        source_adjustment_id: "adjustment-1",
        source_adjustment_created_at: "2026-05-05T12:00:00.000Z",
        workout_type: "tempo",
        title: "Tempo run",
        description: "Original tempo workout.",
        distance_km: 8,
        duration_min: 50,
        target_pace_min_sec_per_km: 320,
        target_pace_max_sec_per_km: 340,
        target_hr_zone: "Zone 3",
        purpose: "Build threshold fitness.",
        instructions: "Run controlled tempo intervals.",
        structured_workout: null,
      },
    ]);
  });

  it("ignores malformed snapshots and requests a regeneration warning", () => {
    const result = extractRollbackUpdatesFromAdjustment({
      ...baseAdjustment,
      before_snapshot: { workouts: "not an array" },
    });

    assert.deepEqual(result.rollbackUpdates, []);
    assert.equal(result.needsRegenerationWarning, true);
  });

  it("builds rollback updates only for affected workouts", () => {
    const result = buildRollbackUpdatesFromAdjustments([
      {
        ...baseAdjustment,
        before_snapshot: {
          workouts: [
            ...baseAdjustment.before_snapshot.workouts,
            {
              id: "unaffected-workout",
              workout_type: "easy",
              title: "Unchanged easy run",
            },
          ],
        },
      },
    ]);

    assert.deepEqual(
      result.rollbackUpdates.map((rollbackUpdate) => rollbackUpdate.id),
      ["planned-2"],
    );
    assert.equal(result.needsRegenerationWarning, false);
  });

  it("skips rollback when a newer remaining adjustment touched the workout", () => {
    const rollbackResult = buildRollbackUpdatesFromAdjustments([baseAdjustment]);
    const filterResult = filterRollbackUpdatesBlockedByNewerAdjustments(
      rollbackResult.rollbackUpdates,
      [
        {
          ...baseAdjustment,
          id: "adjustment-2",
          logged_workout_id: "logged-2",
          affected_workout_ids: ["planned-2"],
          created_at: "2026-05-06T12:00:00.000Z",
        },
      ],
    );

    assert.deepEqual(filterResult.rollbackUpdates, []);
    assert.deepEqual(filterResult.skippedWorkoutIds, ["planned-2"]);
  });
});
