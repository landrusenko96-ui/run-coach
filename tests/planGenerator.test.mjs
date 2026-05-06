import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateTrainingPlan } from "../lib/training/planGenerator.ts";

const profile = {
  id: "profile-1",
  username: "runner",
  display_name: "Runner",
  birth_year: 1990,
  sex: "prefer_not_to_say",
  height_cm: null,
  weight_kg: null,
  current_weekly_mileage_km: 35,
  longest_recent_run_km: 18,
  easy_pace_sec_per_km: 360,
  threshold_pace_sec_per_km: 315,
  max_heart_rate: null,
  resting_heart_rate: null,
  available_training_days: ["monday", "wednesday", "saturday"],
  running_days_per_week: 3,
  preferred_long_run_day: "saturday",
  terrain_available: ["flat"],
  training_aggressiveness: "balanced",
  injury_notes: null,
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

const raceGoal = {
  id: "goal-1",
  profile_id: "profile-1",
  race_name: "Spring Marathon",
  race_date: "2030-10-20",
  distance: "marathon",
  target_finish_time_sec: 14400,
  target_priority: "finish",
  course_elevation_notes: null,
  expected_weather_notes: null,
  is_active: true,
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

describe("generateTrainingPlan", () => {
  it("adds structured workouts to generated run workouts only", () => {
    const generatedPlan = generateTrainingPlan(profile, raceGoal, {
      startDate: "2030-05-06",
    });
    const runWorkoutTypes = [
      "easy",
      "long_run",
      "tempo",
      "interval",
      "marathon_pace",
      "recovery",
      "calibration",
    ];
    const runWorkouts = generatedPlan.plannedWorkouts.filter((workout) =>
      runWorkoutTypes.includes(workout.workout_type),
    );
    const nonRunWorkouts = generatedPlan.plannedWorkouts.filter(
      (workout) => !runWorkoutTypes.includes(workout.workout_type),
    );

    assert.ok(runWorkouts.length > 0);
    assert.ok(nonRunWorkouts.length > 0);

    for (const workout of runWorkouts) {
      assert.equal(workout.structured_workout.sport, "Run");
      assert.equal(workout.structured_workout.exportSafe, true);
      assert.deepEqual(workout.structured_workout.exportWarnings, []);
      assert.ok(workout.structured_workout.steps.length > 0);
    }

    for (const workout of nonRunWorkouts) {
      assert.equal(workout.structured_workout, null);
    }
  });
});
