import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateTrainingPlan } from "../lib/training/planGenerator.ts";
import {
  getLocalDateText,
  subtractDaysFromDateText,
} from "../lib/training/planStart.ts";

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
  it("starts by default on today's local date", () => {
    const todayDateText = getLocalDateText();
    const generatedPlan = generateTrainingPlan(profile, raceGoal);

    assert.equal(generatedPlan.trainingPlan.start_date, todayDateText);
    assert.equal(generatedPlan.plannedWorkouts[0].workout_date, todayDateText);
  });

  it("uses an explicit future start date exactly even when it is not a running day", () => {
    const generatedPlan = generateTrainingPlan(profile, raceGoal, {
      startDate: "2030-05-07",
    });

    assert.equal(generatedPlan.trainingPlan.start_date, "2030-05-07");
    assert.equal(generatedPlan.plannedWorkouts[0].workout_date, "2030-05-07");
    assert.equal(generatedPlan.plannedWorkouts[0].workout_type, "rest");

    const firstRun = generatedPlan.plannedWorkouts.find(
      (workout) => workout.workout_type !== "rest",
    );

    assert.equal(firstRun?.workout_date, "2030-05-08");
    assert.equal(firstRun?.workout_type, "calibration");
  });

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

  it("rejects plan start dates in the past", () => {
    assert.throws(
      () =>
        generateTrainingPlan(profile, raceGoal, {
          startDate: "2020-01-01",
        }),
      /cannot be in the past/,
    );
  });

  it("requires marathon plans to start at least 42 days before race day", () => {
    const latestAllowedStartDate = subtractDaysFromDateText(
      raceGoal.race_date,
      42,
    );

    assert.equal(
      generateTrainingPlan(profile, raceGoal, {
        startDate: latestAllowedStartDate,
      }).trainingPlan.start_date,
      latestAllowedStartDate,
    );

    assert.throws(
      () =>
        generateTrainingPlan(profile, raceGoal, {
          startDate: "2030-09-09",
        }),
      /at least 6 weeks/,
    );
  });

  it("requires half marathon plans to start at least 21 days before race day", () => {
    const halfMarathonGoal = {
      ...raceGoal,
      race_name: "Spring Half Marathon",
      distance: "half_marathon",
    };
    const latestAllowedStartDate = subtractDaysFromDateText(
      halfMarathonGoal.race_date,
      21,
    );

    assert.equal(
      generateTrainingPlan(profile, halfMarathonGoal, {
        startDate: latestAllowedStartDate,
      }).trainingPlan.start_date,
      latestAllowedStartDate,
    );

    assert.throws(
      () =>
        generateTrainingPlan(profile, halfMarathonGoal, {
          startDate: "2030-09-30",
        }),
      /at least 3 weeks/,
    );
  });
});
