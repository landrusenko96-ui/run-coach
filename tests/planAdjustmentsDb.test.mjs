import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPlannedWorkoutAdjustmentUpdate,
  buildSavePlanAdjustmentInput,
} from "../lib/db/planAdjustmentShapes.ts";
import { buildPlannedWorkoutRollbackUpdate } from "../lib/training/planAdjustmentRollback.ts";

const baseDecision = {
  adjustment_type: "reduce_next_intensity",
  reason: "Latest workout was high risk.",
  explanation: "The next hard session is reduced.",
  affected_workout_ids: ["planned-2"],
  before_snapshot: {
    workouts: [{ id: "planned-2", workout_type: "tempo" }],
  },
  after_snapshot: {
    workouts: [{ id: "planned-2", workout_type: "recovery" }],
  },
  updatedFuturePlannedWorkouts: [],
};

const basePlannedWorkout = {
  id: "planned-2",
  training_plan_id: "plan-1",
  profile_id: "profile-1",
  race_goal_id: "goal-1",
  workout_date: "2026-05-06",
  week_number: 1,
  day_label: "wednesday",
  workout_type: "recovery",
  title: "Recovery run",
  description: "A reduced easy run.",
  distance_km: 5.6,
  duration_min: 43,
  target_pace_min_sec_per_km: 420,
  target_pace_max_sec_per_km: 465,
  target_hr_zone: "Zone 1 to Zone 2",
  terrain: "flat",
  purpose: "Reduce fatigue.",
  instructions: "Keep this deliberately easy.",
  status: "planned",
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

describe("plan adjustment database helpers", () => {
  it("builds a plan_adjustments insert row from a decision", () => {
    const input = buildSavePlanAdjustmentInput({
      profileId: "profile-1",
      raceGoalId: "goal-1",
      trainingPlanId: "plan-1",
      loggedWorkoutId: "logged-1",
      workoutEvaluationId: "evaluation-1",
      decision: baseDecision,
    });

    assert.deepEqual(input, {
      profile_id: "profile-1",
      race_goal_id: "goal-1",
      training_plan_id: "plan-1",
      logged_workout_id: "logged-1",
      workout_evaluation_id: "evaluation-1",
      adjustment_type: "reduce_next_intensity",
      reason: "Latest workout was high risk.",
      explanation: "The next hard session is reduced.",
      affected_workout_ids: ["planned-2"],
      before_snapshot: {
        workouts: [{ id: "planned-2", workout_type: "tempo" }],
      },
      after_snapshot: {
        workouts: [{ id: "planned-2", workout_type: "recovery" }],
      },
    });
  });

  it("keeps planned workout adjustment updates scoped to editable fields", () => {
    const update = buildPlannedWorkoutAdjustmentUpdate(basePlannedWorkout);

    assert.deepEqual(Object.keys(update).sort(), [
      "description",
      "distance_km",
      "duration_min",
      "id",
      "instructions",
      "purpose",
      "structured_workout",
      "target_hr_zone",
      "target_pace_max_sec_per_km",
      "target_pace_min_sec_per_km",
      "title",
      "workout_type",
    ]);
    assert.equal(update.id, "planned-2");
    assert.equal(update.workout_type, "recovery");
    assert.equal(update.structured_workout.name, "Recovery run");
    assert.equal(update.structured_workout.exportSafe, true);
    assert.deepEqual(update.structured_workout.exportWarnings, []);
    assert.equal(update.structured_workout.steps[0].targetType, "pace");
    assert.equal(update.status, undefined);
    assert.equal(update.workout_date, undefined);
    assert.equal(update.created_at, undefined);
  });

  it("keeps planned workout rollback updates scoped to editable fields", () => {
    const update = buildPlannedWorkoutRollbackUpdate({
      id: "planned-2",
      source_adjustment_id: "adjustment-1",
      source_adjustment_created_at: "2026-05-05T12:00:00.000Z",
      workout_type: "tempo",
      title: "Tempo run",
      distance_km: 8,
      target_hr_zone: "Zone 3",
      structured_workout: null,
    });

    assert.deepEqual(Object.keys(update).sort(), [
      "distance_km",
      "structured_workout",
      "target_hr_zone",
      "title",
      "workout_type",
    ]);
    assert.equal(update.id, undefined);
    assert.equal(update.status, undefined);
    assert.equal(update.workout_date, undefined);
    assert.equal(update.source_adjustment_id, undefined);
    assert.equal(update.source_adjustment_created_at, undefined);
  });
});
