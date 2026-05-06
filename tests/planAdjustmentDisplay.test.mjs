import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPlanAdjustmentByLoggedWorkoutId,
  filterPlanChangingAdjustments,
  formatAdjustmentTypeLabel,
  formatAffectedWorkoutLabels,
} from "../lib/training/planAdjustmentDisplay.ts";

const baseAdjustment = {
  id: "adjustment-1",
  profile_id: "profile-1",
  race_goal_id: "goal-1",
  training_plan_id: "plan-1",
  logged_workout_id: "logged-1",
  workout_evaluation_id: "evaluation-1",
  adjustment_type: "reduce_next_intensity",
  reason: "High risk workout.",
  explanation: "The next quality workout was reduced.",
  affected_workout_ids: ["planned-2"],
  before_snapshot: null,
  after_snapshot: null,
  created_at: "2026-05-05T12:00:00.000Z",
};

const baseWorkout = {
  id: "planned-2",
  workout_date: "2026-05-07",
  workout_type: "recovery",
  title: "Recovery run",
};

describe("plan adjustment display helpers", () => {
  it("formats adjustment type labels for the UI", () => {
    assert.equal(
      formatAdjustmentTypeLabel("protect_long_run_progression"),
      "Protect long run progression",
    );
  });

  it("keeps only real plan-changing adjustments for the Plan page", () => {
    const noneAdjustment = {
      ...baseAdjustment,
      id: "adjustment-2",
      adjustment_type: "none",
      affected_workout_ids: [],
    };

    assert.deepEqual(filterPlanChangingAdjustments([
      baseAdjustment,
      noneAdjustment,
    ]), [baseAdjustment]);
  });

  it("uses the latest adjustment record for each logged workout", () => {
    const olderAdjustment = {
      ...baseAdjustment,
      id: "adjustment-older",
      reason: "Older decision.",
      created_at: "2026-05-05T11:00:00.000Z",
    };
    const adjustmentByLoggedWorkoutId = buildPlanAdjustmentByLoggedWorkoutId([
      olderAdjustment,
      baseAdjustment,
    ]);

    assert.equal(
      adjustmentByLoggedWorkoutId.get("logged-1")?.id,
      "adjustment-1",
    );
  });

  it("formats affected workout labels and falls back to a short id", () => {
    const labels = formatAffectedWorkoutLabels(
      {
        ...baseAdjustment,
        affected_workout_ids: ["planned-2", "12345678-missing"],
      },
      new Map([["planned-2", baseWorkout]]),
    );

    assert.deepEqual(labels, [
      "2026-05-07 - Recovery run (Recovery)",
      "Workout 12345678",
    ]);
  });
});
