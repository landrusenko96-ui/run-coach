import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveCurrentPlanStatus } from "../lib/training/dashboardStatus.ts";

const baseEvaluation = {
  id: "evaluation-1",
  logged_workout_id: "logged-1",
  planned_workout_id: "planned-1",
  profile_id: "profile-1",
  training_plan_id: "plan-1",
  overall_score: 90,
  completion_score: 90,
  pace_accuracy_score: 90,
  distance_completion_score: 90,
  effort_control_score: 90,
  training_value_score: 90,
  risk_level: "low",
  summary: null,
  created_at: "2026-05-05T12:00:00.000Z",
  updated_at: "2026-05-05T12:00:00.000Z",
};

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
  before_snapshot: null,
  after_snapshot: null,
  created_at: "2026-05-05T12:00:00.000Z",
};

describe("deriveCurrentPlanStatus", () => {
  it("returns on track when recent scores are low risk", () => {
    assert.equal(
      deriveCurrentPlanStatus({
        recentWorkoutEvaluations: [baseEvaluation],
        latestPlanAdjustment: null,
      }),
      "on_track",
    );
  });

  it("returns caution for repeated medium-risk scores", () => {
    assert.equal(
      deriveCurrentPlanStatus({
        recentWorkoutEvaluations: [
          { ...baseEvaluation, id: "evaluation-1", risk_level: "medium" },
          {
            ...baseEvaluation,
            id: "evaluation-2",
            risk_level: "medium",
            created_at: "2026-05-04T12:00:00.000Z",
          },
        ],
        latestPlanAdjustment: null,
      }),
      "caution",
    );
  });

  it("returns caution for a protective latest adjustment", () => {
    assert.equal(
      deriveCurrentPlanStatus({
        recentWorkoutEvaluations: [baseEvaluation],
        latestPlanAdjustment: baseAdjustment,
      }),
      "caution",
    );
  });

  it("returns needs recovery when the latest score is high risk", () => {
    assert.equal(
      deriveCurrentPlanStatus({
        recentWorkoutEvaluations: [
          { ...baseEvaluation, risk_level: "high" },
          {
            ...baseEvaluation,
            id: "evaluation-2",
            risk_level: "low",
            created_at: "2026-05-04T12:00:00.000Z",
          },
        ],
        latestPlanAdjustment: null,
      }),
      "needs_recovery",
    );
  });
});
