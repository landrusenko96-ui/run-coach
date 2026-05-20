import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saveLoggedWorkoutWithCompletion } from "../lib/training/workoutLogging.ts";

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
};

const plannedWorkout = {
  id: "planned-1",
  training_plan_id: "plan-1",
  profile_id: "profile-1",
  race_goal_id: "race-goal-1",
  workout_date: "2026-05-18",
  workout_type: "easy",
  status: "planned",
  distance_km: 5,
  duration_min: 30,
  target_pace_min_sec_per_km: 340,
  target_pace_max_sec_per_km: 400,
};

const manualLoggedWorkoutInput = {
  profile_id: "profile-1",
  race_goal_id: "race-goal-1",
  training_plan_id: "plan-1",
  planned_workout_id: "planned-1",
  workout_date: "2026-05-18",
  workout_type: "run",
  source: "manual",
  source_activity_id: null,
  distance_km: 5,
  duration_sec: 1800,
  avg_pace_sec_per_km: 360,
  avg_heart_rate: 145,
  max_heart_rate: 165,
  cadence: null,
  elevation_gain_m: 20,
  rpe: 4,
  notes: "Manual test log",
};

describe("shared workout logging completion helper", () => {
  it("keeps manual logging on the shared save, score, completion path", async () => {
    const calls = {
      savedLoggedWorkoutInputs: [],
      savedEvaluationInputs: [],
      completedPlannedWorkoutIds: [],
      savedPlanAdjustments: [],
    };

    const result = await saveLoggedWorkoutWithCompletion({
      profile,
      raceGoal,
      plan,
      loggedWorkoutInput: manualLoggedWorkoutInput,
      plannedWorkout,
      recentLoggedWorkouts: [],
      recentWorkoutEvaluations: [],
      dependencies: {
        saveLoggedWorkout: async (input) => {
          calls.savedLoggedWorkoutInputs.push(input);

          return {
            id: "logged-1",
            ...input,
            created_at: "2026-05-18T12:00:00.000Z",
            updated_at: "2026-05-18T12:00:00.000Z",
          };
        },
        saveWorkoutEvaluation: async (input) => {
          calls.savedEvaluationInputs.push(input);

          return {
            id: "evaluation-1",
            ...input,
            created_at: "2026-05-18T12:01:00.000Z",
            updated_at: "2026-05-18T12:01:00.000Z",
          };
        },
        markPlannedWorkoutCompleted: async (plannedWorkoutId) => {
          calls.completedPlannedWorkoutIds.push(plannedWorkoutId);

          return {
            ...plannedWorkout,
            status: "completed",
          };
        },
        fetchFuturePlannedWorkouts: async () => [],
        suggestPlanAdjustment: () => ({
          adjustment_type: "none",
          reason: "Workout was completed as planned.",
          explanation: "No plan change is needed.",
          affected_workout_ids: [],
          before_snapshot: null,
          after_snapshot: null,
          updatedFuturePlannedWorkouts: [],
        }),
        savePlanAdjustment: async (input) => {
          calls.savedPlanAdjustments.push(input);

          return {
            id: "adjustment-1",
            ...input,
            created_at: "2026-05-18T12:02:00.000Z",
            updated_at: "2026-05-18T12:02:00.000Z",
          };
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.scored, true);
    assert.equal(result.adjusted, false);
    assert.equal(result.loggedWorkout.source, "manual");
    assert.equal(result.loggedWorkout.source_activity_id, null);
    assert.equal(result.workoutEvaluation?.logged_workout_id, "logged-1");
    assert.equal(result.workoutEvaluation?.planned_workout_id, "planned-1");
    assert.deepEqual(calls.completedPlannedWorkoutIds, ["planned-1"]);
    assert.equal(calls.savedLoggedWorkoutInputs.length, 1);
    assert.equal(calls.savedLoggedWorkoutInputs[0].source, "manual");
    assert.equal(calls.savedLoggedWorkoutInputs[0].source_activity_id, null);
    assert.equal(calls.savedEvaluationInputs.length, 1);
    assert.equal(calls.savedPlanAdjustments.length, 1);
  });
});
