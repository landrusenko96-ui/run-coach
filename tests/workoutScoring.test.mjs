import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreWorkout } from "../lib/training/workoutScoring.ts";

const basePlannedWorkout = {
  id: "planned-1",
  training_plan_id: "plan-1",
  profile_id: "profile-1",
  race_goal_id: "goal-1",
  workout_date: "2026-05-04",
  week_number: 1,
  day_label: "monday",
  workout_type: "easy",
  title: "Easy run",
  description: null,
  distance_km: 8,
  duration_min: 50,
  target_pace_min_sec_per_km: 360,
  target_pace_max_sec_per_km: 390,
  target_hr_zone: null,
  terrain: "flat",
  purpose: "Aerobic base",
  instructions: null,
  status: "planned",
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

const baseLoggedWorkout = {
  id: "logged-1",
  profile_id: "profile-1",
  race_goal_id: "goal-1",
  training_plan_id: "plan-1",
  planned_workout_id: "planned-1",
  workout_date: "2026-05-04",
  workout_type: "run",
  source: "manual",
  distance_km: 8,
  duration_sec: 3000,
  avg_pace_sec_per_km: 375,
  avg_heart_rate: 145,
  max_heart_rate: 165,
  cadence: null,
  elevation_gain_m: null,
  rpe: 4,
  notes: null,
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

function plannedWorkout(overrides = {}) {
  return {
    ...basePlannedWorkout,
    ...overrides,
  };
}

function loggedWorkout(overrides = {}) {
  return {
    ...baseLoggedWorkout,
    ...overrides,
  };
}

describe("scoreWorkout", () => {
  it("scores an easy run on target", () => {
    const evaluation = scoreWorkout(loggedWorkout(), plannedWorkout());

    assert.equal(evaluation.logged_workout_id, "logged-1");
    assert.equal(evaluation.planned_workout_id, "planned-1");
    assert.equal(evaluation.risk_level, "low");
    assert.equal(evaluation.distance_completion_score, 100);
    assert.equal(evaluation.pace_accuracy_score, 100);
    assert.ok(evaluation.effort_control_score >= 90);
    assert.ok(evaluation.overall_score >= 95);
  });

  it("scores a long run with good distance completion", () => {
    const evaluation = scoreWorkout(
      loggedWorkout({ distance_km: 19, duration_sec: 7200, avg_pace_sec_per_km: 379, rpe: 5 }),
      plannedWorkout({ workout_type: "long_run", title: "Long run", distance_km: 20, duration_min: 125 }),
    );

    assert.equal(evaluation.risk_level, "low");
    assert.equal(evaluation.distance_completion_score, 95);
    assert.ok(evaluation.completion_score >= 90);
    assert.ok(evaluation.training_value_score >= 85);
  });

  it("scores a tempo run against target pace", () => {
    const evaluation = scoreWorkout(
      loggedWorkout({ distance_km: 10, duration_sec: 3300, avg_pace_sec_per_km: 330, rpe: 7 }),
      plannedWorkout({
        workout_type: "tempo",
        title: "Tempo run",
        distance_km: 10,
        target_pace_min_sec_per_km: 325,
        target_pace_max_sec_per_km: 340,
      }),
    );

    assert.equal(evaluation.risk_level, "low");
    assert.equal(evaluation.pace_accuracy_score, 100);
    assert.ok(evaluation.effort_control_score >= 90);
  });

  it("does not punish calibration heavily when no pace target exists", () => {
    const evaluation = scoreWorkout(
      loggedWorkout({ distance_km: 7, duration_sec: 2400, avg_pace_sec_per_km: 343, rpe: 8 }),
      plannedWorkout({
        workout_type: "calibration",
        title: "Calibration run",
        distance_km: null,
        duration_min: 40,
        target_pace_min_sec_per_km: null,
        target_pace_max_sec_per_km: null,
      }),
    );

    assert.equal(evaluation.pace_accuracy_score, 85);
    assert.ok(evaluation.overall_score >= 85);
    assert.notEqual(evaluation.risk_level, "high");
  });

  it("handles missing heart-rate data", () => {
    const evaluation = scoreWorkout(
      loggedWorkout({ avg_heart_rate: null, max_heart_rate: null, cadence: null, elevation_gain_m: null }),
      plannedWorkout(),
    );

    assert.equal(evaluation.risk_level, "low");
    assert.ok(evaluation.effort_control_score >= 90);
    assert.ok(evaluation.summary.length > 0);
  });

  it("flags high risk for very high RPE or much-too-fast pacing", () => {
    const evaluation = scoreWorkout(
      loggedWorkout({ distance_km: 8, duration_sec: 2400, avg_pace_sec_per_km: 300, rpe: 9 }),
      plannedWorkout({ workout_type: "easy", target_pace_min_sec_per_km: 360, target_pace_max_sec_per_km: 390 }),
    );

    assert.equal(evaluation.risk_level, "high");
    assert.ok(evaluation.effort_control_score < 80);
    assert.match(evaluation.summary, /High risk/);
  });
});
