import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestPlanAdjustment } from "../lib/training/planAdjustment.ts";

const baseProfile = {
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

const baseRaceGoal = {
  id: "goal-1",
  profile_id: "profile-1",
  race_name: "Spring Marathon",
  race_date: "2026-10-18",
  distance: "marathon",
  target_finish_time_sec: 14400,
  target_priority: "finish",
  course_elevation_notes: null,
  expected_weather_notes: null,
  is_active: true,
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

const baseTrainingPlan = {
  id: "plan-1",
  profile_id: "profile-1",
  race_goal_id: "goal-1",
  name: "Spring Marathon Plan",
  status: "active",
  start_date: "2026-05-04",
  end_date: "2026-10-18",
  total_weeks: 24,
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

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
  description: "Comfortable aerobic running.",
  distance_km: 8,
  duration_min: 50,
  target_pace_min_sec_per_km: 360,
  target_pace_max_sec_per_km: 390,
  target_hr_zone: "Zone 2",
  terrain: "flat",
  purpose: "Build aerobic base.",
  instructions: "Keep the effort conversational.",
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

const baseWorkoutEvaluation = {
  id: "evaluation-1",
  logged_workout_id: "logged-1",
  planned_workout_id: "planned-1",
  profile_id: "profile-1",
  training_plan_id: "plan-1",
  overall_score: 96,
  completion_score: 100,
  pace_accuracy_score: 100,
  distance_completion_score: 100,
  effort_control_score: 95,
  training_value_score: 95,
  risk_level: "low",
  summary: "Good easy run execution with low risk.",
  created_at: "2026-05-04T12:00:00.000Z",
  updated_at: "2026-05-04T12:00:00.000Z",
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

function workoutEvaluation(overrides = {}) {
  return {
    ...baseWorkoutEvaluation,
    ...overrides,
  };
}

function snapshotWorkout(decision, snapshotName, workoutId) {
  return decision[snapshotName].workouts.find(
    (workout) => workout.id === workoutId,
  );
}

function buildInput(overrides = {}) {
  const planned = overrides.plannedWorkout ?? plannedWorkout();

  return {
    profile: baseProfile,
    raceGoal: baseRaceGoal,
    trainingPlan: baseTrainingPlan,
    loggedWorkout: loggedWorkout({
      planned_workout_id: planned.id,
      workout_date: planned.workout_date,
      ...overrides.loggedWorkout,
    }),
    workoutEvaluation: workoutEvaluation({
      planned_workout_id: planned.id,
      ...overrides.workoutEvaluation,
    }),
    plannedWorkout: planned,
    futurePlannedWorkouts: overrides.futurePlannedWorkouts ?? [
      plannedWorkout({
        id: "future-easy-1",
        workout_date: "2026-05-06",
        week_number: 1,
        day_label: "wednesday",
      }),
      plannedWorkout({
        id: "future-long-1",
        workout_date: "2026-05-09",
        week_number: 1,
        day_label: "saturday",
        workout_type: "long_run",
        title: "Long run",
        distance_km: 16,
        duration_min: 105,
        target_pace_min_sec_per_km: 375,
        target_pace_max_sec_per_km: 420,
      }),
    ],
    recentLoggedWorkouts: overrides.recentLoggedWorkouts,
    recentWorkoutEvaluations: overrides.recentWorkoutEvaluations,
  };
}

describe("suggestPlanAdjustment", () => {
  it("returns no adjustment for a successful easy run", () => {
    const futureWorkouts = [
      plannedWorkout({
        id: "future-tempo-1",
        workout_date: "2026-05-06",
        workout_type: "tempo",
        title: "Tempo run",
      }),
    ];
    const decision = suggestPlanAdjustment(
      buildInput({ futurePlannedWorkouts: futureWorkouts }),
    );

    assert.equal(decision.adjustment_type, "none");
    assert.deepEqual(decision.affected_workout_ids, []);
    assert.deepEqual(decision.updatedFuturePlannedWorkouts, futureWorkouts);
    assert.notEqual(decision.updatedFuturePlannedWorkouts[0], futureWorkouts[0]);
  });

  it("reduces the next quality workout after a high-risk tempo run", () => {
    const tempoWorkout = plannedWorkout({
      id: "planned-tempo-1",
      workout_type: "tempo",
      title: "Tempo run",
      target_pace_min_sec_per_km: 320,
      target_pace_max_sec_per_km: 340,
    });
    const futureTempo = plannedWorkout({
      id: "future-tempo-1",
      workout_date: "2026-05-07",
      workout_type: "tempo",
      title: "Tempo run",
      distance_km: 10,
      duration_min: 56,
      target_pace_min_sec_per_km: 320,
      target_pace_max_sec_per_km: 340,
    });
    const completedStructuredWorkout = {
      version: 1,
      sport: "Run",
      name: "Completed interval",
      exportSafe: true,
      exportWarnings: [],
      steps: [],
    };
    const futureCompletedInterval = plannedWorkout({
      id: "future-completed-1",
      workout_date: "2026-05-06",
      workout_type: "interval",
      status: "completed",
      structured_workout: completedStructuredWorkout,
    });
    const decision = suggestPlanAdjustment(
      buildInput({
        plannedWorkout: tempoWorkout,
        loggedWorkout: {
          avg_pace_sec_per_km: 300,
          rpe: 9,
        },
        workoutEvaluation: {
          risk_level: "high",
          overall_score: 55,
          effort_control_score: 45,
          pace_accuracy_score: 60,
        },
        futurePlannedWorkouts: [futureCompletedInterval, futureTempo],
      }),
    );
    const adjustedTempo = decision.updatedFuturePlannedWorkouts.find(
      (workout) => workout.id === "future-tempo-1",
    );
    const completedInterval = decision.updatedFuturePlannedWorkouts.find(
      (workout) => workout.id === "future-completed-1",
    );

    assert.equal(decision.adjustment_type, "reduce_next_intensity");
    assert.deepEqual(decision.affected_workout_ids, ["future-tempo-1"]);
    assert.equal(adjustedTempo.workout_type, "recovery");
    assert.equal(adjustedTempo.title, "Recovery run");
    assert.ok(adjustedTempo.distance_km < futureTempo.distance_km);
    assert.equal(adjustedTempo.structured_workout.name, "Recovery run");
    assert.equal(adjustedTempo.structured_workout.exportSafe, true);
    assert.deepEqual(adjustedTempo.structured_workout.exportWarnings, []);
    assert.equal(adjustedTempo.structured_workout.steps[0].durationType, "distance");
    assert.equal(adjustedTempo.structured_workout.steps[0].durationValue, 7000);
    assert.equal(adjustedTempo.structured_workout.steps[0].targetMin, 370);
    assert.equal(adjustedTempo.structured_workout.steps[0].targetMax, 415);
    assert.equal(
      snapshotWorkout(decision, "after_snapshot", "future-tempo-1")
        .structured_workout.exportSafe,
      true,
    );
    assert.equal(completedInterval.workout_type, "interval");
    assert.deepEqual(
      completedInterval.structured_workout,
      completedStructuredWorkout,
    );
  });

  it("protects long-run progression after an under-completed long run", () => {
    const longRun = plannedWorkout({
      id: "planned-long-1",
      workout_date: "2026-05-09",
      workout_type: "long_run",
      title: "Long run",
      distance_km: 20,
      duration_min: 130,
      target_pace_min_sec_per_km: 375,
      target_pace_max_sec_per_km: 420,
    });
    const nextLongRun = plannedWorkout({
      id: "future-long-1",
      workout_date: "2026-05-16",
      week_number: 2,
      workout_type: "long_run",
      title: "Long run",
      distance_km: 22,
      duration_min: 145,
      target_pace_min_sec_per_km: 375,
      target_pace_max_sec_per_km: 420,
    });
    const decision = suggestPlanAdjustment(
      buildInput({
        plannedWorkout: longRun,
        loggedWorkout: {
          distance_km: 14,
          duration_sec: 5400,
          avg_pace_sec_per_km: 386,
          rpe: 5,
        },
        workoutEvaluation: {
          distance_completion_score: 70,
          completion_score: 75,
          risk_level: "medium",
        },
        futurePlannedWorkouts: [nextLongRun],
      }),
    );
    const adjustedLongRun = decision.updatedFuturePlannedWorkouts[0];

    assert.equal(decision.adjustment_type, "protect_long_run_progression");
    assert.deepEqual(decision.affected_workout_ids, ["future-long-1"]);
    assert.equal(adjustedLongRun.workout_type, "long_run");
    assert.equal(adjustedLongRun.distance_km, 14);
    assert.equal(adjustedLongRun.duration_min, 98);
    assert.equal(adjustedLongRun.structured_workout.exportSafe, true);
    assert.deepEqual(adjustedLongRun.structured_workout.exportWarnings, []);
    assert.equal(
      adjustedLongRun.structured_workout.steps[0].durationType,
      "distance",
    );
    assert.equal(adjustedLongRun.structured_workout.steps[0].durationValue, 14000);
    assert.equal(adjustedLongRun.structured_workout.steps[0].targetMin, 375);
    assert.equal(adjustedLongRun.structured_workout.steps[0].targetMax, 420);
    assert.equal(
      snapshotWorkout(decision, "after_snapshot", "future-long-1")
        .structured_workout.steps[0].durationValue,
      14000,
    );
    assert.match(adjustedLongRun.instructions, /Do not add extra distance/);
  });

  it("applies a small pace update after three strong recent workouts", () => {
    const futureEasy = plannedWorkout({
      id: "future-easy-1",
      workout_date: "2026-05-06",
      target_pace_min_sec_per_km: 360,
      target_pace_max_sec_per_km: 390,
    });
    const strongEvaluations = [
      workoutEvaluation({ id: "evaluation-3", created_at: "2026-05-08T12:00:00.000Z" }),
      workoutEvaluation({ id: "evaluation-2", created_at: "2026-05-06T12:00:00.000Z" }),
      workoutEvaluation({ id: "evaluation-1", created_at: "2026-05-04T12:00:00.000Z" }),
    ];
    const decision = suggestPlanAdjustment(
      buildInput({
        futurePlannedWorkouts: [futureEasy],
        recentWorkoutEvaluations: strongEvaluations,
      }),
    );
    const adjustedEasy = decision.updatedFuturePlannedWorkouts[0];

    assert.equal(decision.adjustment_type, "update_training_paces");
    assert.deepEqual(decision.affected_workout_ids, ["future-easy-1"]);
    assert.equal(adjustedEasy.target_pace_min_sec_per_km, 353);
    assert.equal(adjustedEasy.target_pace_max_sec_per_km, 382);
    assert.equal(adjustedEasy.structured_workout.steps[0].targetMin, 353);
    assert.equal(adjustedEasy.structured_workout.steps[0].targetMax, 382);
    assert.equal(adjustedEasy.structured_workout.exportSafe, true);
    assert.deepEqual(adjustedEasy.structured_workout.exportWarnings, []);
    assert.equal(
      snapshotWorkout(decision, "after_snapshot", "future-easy-1")
        .structured_workout.steps[0].targetMin,
      353,
    );
  });

  it("does not overreact when heart-rate and RPE data are missing", () => {
    const decision = suggestPlanAdjustment(
      buildInput({
        loggedWorkout: {
          avg_heart_rate: null,
          max_heart_rate: null,
          rpe: null,
        },
        workoutEvaluation: {
          risk_level: "low",
          overall_score: 90,
          completion_score: 95,
          pace_accuracy_score: 90,
          distance_completion_score: 95,
          effort_control_score: 85,
        },
      }),
    );

    assert.equal(decision.adjustment_type, "none");
    assert.deepEqual(decision.affected_workout_ids, []);
  });
});
