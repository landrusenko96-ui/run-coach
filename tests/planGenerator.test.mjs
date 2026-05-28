import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateTrainingPlan } from "../lib/training/planGenerator.ts";
import { getLocalDateText } from "../lib/training/planStart.ts";

const baseProfile = {
  id: "profile-1",
  user_id: "user-1",
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
  training_aggressiveness: "moderate",
  injury_notes: null,
  maximum_weekday_session_duration_min: null,
  maximum_weekend_session_duration_min: null,
  running_experience_level: null,
  previous_half_marathon_history: null,
  previous_marathon_history: null,
  current_pain_or_injury: false,
  serious_recent_injury: false,
  injury_risk_notes: null,
  preferred_rest_day: null,
  preferred_workout_days: [],
  cross_training_available: false,
  double_run_willingness: false,
  typical_surface: null,
  typical_elevation_profile: null,
  manual_six_week_history: null,
  manual_six_week_history_updated_at: null,
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

const baseRaceGoal = {
  id: "goal-1",
  user_id: "user-1",
  profile_id: "profile-1",
  race_name: "Spring Marathon",
  race_date: "2030-10-20",
  distance: "marathon",
  target_finish_time_sec: 14400,
  target_priority: "finish",
  race_priority: "casual",
  goal_flexibility: "finish_only",
  race_course_profile: null,
  course_elevation_notes: null,
  expected_weather_notes: null,
  is_active: true,
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

function makeProfile(overrides = {}) {
  return {
    ...baseProfile,
    ...overrides,
  };
}

function makeRaceGoal(overrides = {}) {
  return {
    ...baseRaceGoal,
    ...overrides,
  };
}

function getWeekWorkouts(generatedPlan, weekNumber) {
  return generatedPlan.plannedWorkouts.filter(
    (workout) => workout.week_number === weekNumber,
  );
}

function sumWeekDistance(generatedPlan, weekNumber) {
  return getWeekWorkouts(generatedPlan, weekNumber).reduce(
    (total, workout) => total + (workout.distance_km ?? 0),
    0,
  );
}

function getMaxNonRaceWeekDistance(generatedPlan) {
  const weekTotals = new Map();

  for (const workout of generatedPlan.plannedWorkouts) {
    weekTotals.set(
      workout.week_number,
      (weekTotals.get(workout.week_number) ?? 0) + (workout.distance_km ?? 0),
    );
  }

  return Math.max(
    ...[...weekTotals.entries()]
      .filter(([weekNumber]) => weekNumber < generatedPlan.trainingPlan.total_weeks)
      .map(([, distanceKm]) => distanceKm),
  );
}

function getLongRunDistance(generatedPlan, weekNumber) {
  return (
    getWeekWorkouts(generatedPlan, weekNumber).find(
      (workout) => workout.workout_type === "long_run",
    )?.distance_km ?? null
  );
}

function getRunningWorkouts(generatedPlan, weekNumber) {
  return getWeekWorkouts(generatedPlan, weekNumber).filter(
    (workout) => workout.distance_km !== null,
  );
}

function makeRecentHistory(weeklyDistances, source = "app") {
  return weeklyDistances.map((distanceKm, index) => ({
    week_start_date: `2030-03-${String(1 + index * 7).padStart(2, "0")}`,
    week_end_date: `2030-03-${String(7 + index * 7).padStart(2, "0")}`,
    distance_km: distanceKm,
    duration_sec: Math.round(distanceKm * 360),
    run_count: 3,
    longest_run_km: Math.round(distanceKm * 0.4 * 10) / 10,
    longest_run_duration_sec: Math.round(distanceKm * 0.4 * 390),
    source,
  }));
}

function isHardWorkout(workout) {
  return (
    workout.workout_type === "tempo" ||
    workout.workout_type === "interval" ||
    workout.workout_type === "marathon_pace"
  );
}

describe("generateTrainingPlan", () => {
  it("starts by default on today's local date", () => {
    const todayDateText = getLocalDateText();
    const generatedPlan = generateTrainingPlan(baseProfile, baseRaceGoal);

    assert.equal(generatedPlan.trainingPlan.start_date, todayDateText);
    assert.equal(generatedPlan.plannedWorkouts[0].workout_date, todayDateText);
  });

  it("uses an explicit future start date exactly even when it is not a running day", () => {
    const generatedPlan = generateTrainingPlan(baseProfile, baseRaceGoal, {
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
    const generatedPlan = generateTrainingPlan(baseProfile, baseRaceGoal, {
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
        generateTrainingPlan(baseProfile, baseRaceGoal, {
          startDate: "2020-01-01",
        }),
      /cannot be in the past/,
    );
  });

  it("generates a marathon race-prep plan instead of rejecting a close race", () => {
    const generatedPlan = generateTrainingPlan(baseProfile, baseRaceGoal, {
      startDate: "2030-09-20",
    });

    assert.ok(generatedPlan.trainingPlan.total_weeks < 8);
    assert.ok(
      generatedPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("race-prep plan"),
      ),
    );
  });

  it("generates a half-marathon race-prep plan instead of rejecting a close race", () => {
    const generatedPlan = generateTrainingPlan(
      baseProfile,
      makeRaceGoal({
        race_name: "Spring Half Marathon",
        race_date: "2030-06-02",
        distance: "half_marathon",
      }),
      {
        startDate: "2030-05-06",
      },
    );

    assert.ok(generatedPlan.trainingPlan.total_weeks < 6);
    assert.ok(
      generatedPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("race-prep plan"),
      ),
    );
  });

  it("keeps marathon peak load in the spec range for a moderate 35 km baseline", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        available_training_days: [
          "monday",
          "tuesday",
          "wednesday",
          "friday",
          "saturday",
        ],
        running_days_per_week: 5,
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const maxWeekDistance = getMaxNonRaceWeekDistance(generatedPlan);

    assert.ok(maxWeekDistance >= 55);
    assert.ok(maxWeekDistance <= 70);
  });

  it("keeps half-marathon peak load in the spec range for a moderate 25 km baseline", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 25,
        longest_recent_run_km: 12,
        available_training_days: [
          "monday",
          "tuesday",
          "wednesday",
          "friday",
          "saturday",
        ],
        running_days_per_week: 5,
      }),
      makeRaceGoal({
        race_name: "Spring Half Marathon",
        race_date: "2030-08-18",
        distance: "half_marathon",
      }),
      { startDate: "2030-05-06" },
    );
    const maxWeekDistance = getMaxNonRaceWeekDistance(generatedPlan);

    assert.ok(maxWeekDistance >= 35);
    assert.ok(maxWeekDistance <= 50);
  });

  it("caps early long-run progression from the longest recent run", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 50,
        longest_recent_run_km: 8,
        available_training_days: [
          "monday",
          "tuesday",
          "wednesday",
          "friday",
          "saturday",
        ],
        running_days_per_week: 5,
        training_aggressiveness: "aggressive",
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const week1LongRunKm = getLongRunDistance(generatedPlan, 1);
    const week2LongRunKm = getLongRunDistance(generatedPlan, 2);

    assert.ok(week1LongRunKm <= 9.6);
    assert.ok(week2LongRunKm <= week1LongRunKm * 1.12);
  });

  it("builds 3, 4, 5, and 6 day layouts without changing the persisted workout type set", () => {
    const layouts = [
      {
        days: ["monday", "wednesday", "saturday"],
        runningDaysPerWeek: 3,
        expectedRuns: 3,
        expectsMediumLong: false,
      },
      {
        days: ["monday", "wednesday", "friday", "saturday"],
        runningDaysPerWeek: 4,
        expectedRuns: 4,
        expectsMediumLong: false,
      },
      {
        days: ["monday", "tuesday", "wednesday", "friday", "saturday"],
        runningDaysPerWeek: 5,
        expectedRuns: 5,
        expectsMediumLong: true,
      },
      {
        days: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ],
        runningDaysPerWeek: 6,
        expectedRuns: 6,
        expectsMediumLong: true,
      },
    ];
    const allowedWorkoutTypes = new Set([
      "easy",
      "long_run",
      "tempo",
      "interval",
      "marathon_pace",
      "recovery",
      "rest",
      "strength_optional",
      "calibration",
      "cross_training",
    ]);

    for (const layout of layouts) {
      const generatedPlan = generateTrainingPlan(
        makeProfile({
          available_training_days: layout.days,
          running_days_per_week: layout.runningDaysPerWeek,
          training_aggressiveness:
            layout.runningDaysPerWeek === 6 ? "aggressive" : "moderate",
        }),
        baseRaceGoal,
        { startDate: "2030-05-06" },
      );
      const week2Runs = getRunningWorkouts(generatedPlan, 2);

      assert.equal(week2Runs.length, layout.expectedRuns);
      assert.ok(
        generatedPlan.plannedWorkouts.every((workout) =>
          allowedWorkoutTypes.has(workout.workout_type),
        ),
      );
      assert.equal(
        week2Runs.some((workout) => workout.title === "Medium-long run"),
        layout.expectsMediumLong,
      );
    }
  });

  it("does not place hard workouts on consecutive days or intervals within 48 hours before the long run", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        available_training_days: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ],
        running_days_per_week: 6,
        training_aggressiveness: "aggressive",
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );

    for (let index = 1; index < generatedPlan.plannedWorkouts.length; index += 1) {
      assert.ok(
        !(
          isHardWorkout(generatedPlan.plannedWorkouts[index - 1]) &&
          isHardWorkout(generatedPlan.plannedWorkouts[index])
        ),
      );
    }

    for (let weekNumber = 1; weekNumber <= generatedPlan.trainingPlan.total_weeks; weekNumber += 1) {
      const weekWorkouts = getWeekWorkouts(generatedPlan, weekNumber);
      const longRun = weekWorkouts.find((workout) => workout.workout_type === "long_run");

      if (!longRun) {
        continue;
      }

      const intervalWorkout = weekWorkouts.find(
        (workout) => workout.workout_type === "interval",
      );

      if (!intervalWorkout) {
        continue;
      }

      const gapDays =
        (new Date(`${longRun.workout_date}T00:00:00`).getTime() -
          new Date(`${intervalWorkout.workout_date}T00:00:00`).getTime()) /
        (1000 * 60 * 60 * 24);

      assert.ok(gapDays > 2 || gapDays < 0);
    }
  });

  it("places cutback weeks with reduced volume and reduced long-run burden", () => {
    const generatedPlan = generateTrainingPlan(baseProfile, baseRaceGoal, {
      startDate: "2030-05-06",
    });

    assert.ok(sumWeekDistance(generatedPlan, 4) < sumWeekDistance(generatedPlan, 3));
    assert.ok(getLongRunDistance(generatedPlan, 4) < getLongRunDistance(generatedPlan, 3));
  });

  it("reduces long-run burden during the marathon taper", () => {
    const generatedPlan = generateTrainingPlan(baseProfile, baseRaceGoal, {
      startDate: "2030-05-06",
    });
    const penultimateWeek = generatedPlan.trainingPlan.total_weeks - 1;

    assert.ok(
      getLongRunDistance(generatedPlan, penultimateWeek) <
        getLongRunDistance(generatedPlan, penultimateWeek - 1),
    );
  });

  it("warns when goal pace is much faster than the current estimate", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 25,
        longest_recent_run_km: 10,
        easy_pace_sec_per_km: 390,
        threshold_pace_sec_per_km: 345,
      }),
      makeRaceGoal({
        target_finish_time_sec: 10800,
        target_priority: "aggressive",
        race_priority: "A",
        goal_flexibility: "fixed",
      }),
      { startDate: "2030-05-06" },
    );

    assert.ok(
      generatedPlan.trainingPlan.warnings.some(
        (warning) =>
          warning.includes("18% faster") ||
          warning.includes("large jump") ||
          warning.includes("very ambitious"),
      ),
    );
  });

  it("uses assembled six-week history when it is supplied", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 5,
        longest_recent_run_km: 4,
      }),
      makeRaceGoal(),
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([38, 40, 42, 39, 41, 43], "mixed"),
      },
    );

    assert.ok(
      generatedPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("assembled app and Strava six-week history"),
      ),
    );
    assert.ok(
      getMaxNonRaceWeekDistance(generatedPlan) > 35,
      "plan should use supplied history load instead of the low profile fallback",
    );
  });

  it("records assumptions when future spec data is not available in the current app", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: null,
        longest_recent_run_km: null,
        easy_pace_sec_per_km: null,
        threshold_pace_sec_per_km: null,
        available_training_days: [],
        terrain_available: [],
      }),
      makeRaceGoal({
        target_finish_time_sec: null,
      }),
      { startDate: "2030-05-06" },
    );

    assert.ok(
      generatedPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("Maximum weekday and weekend session durations"),
      ),
    );
    assert.ok(
      generatedPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("Current weekly mileage is missing"),
      ),
    );
    assert.ok(
      generatedPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("Current weekly mileage is missing"),
      ),
    );
  });

  it("creates one DB-compatible planned workout row for every date through race day", () => {
    const generatedPlan = generateTrainingPlan(baseProfile, baseRaceGoal, {
      startDate: "2030-05-06",
    });
    const startDate = new Date("2030-05-06T00:00:00");
    const raceDate = new Date(`${baseRaceGoal.race_date}T00:00:00`);
    const expectedDays =
      Math.round((raceDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) +
      1;

    assert.equal(generatedPlan.plannedWorkouts.length, expectedDays);
    assert.equal(
      generatedPlan.plannedWorkouts[generatedPlan.plannedWorkouts.length - 1]
        .workout_date,
      baseRaceGoal.race_date,
    );
    assert.ok(
      generatedPlan.plannedWorkouts.every(
        (workout) =>
          workout.profile_id === baseProfile.id &&
          workout.race_goal_id === baseRaceGoal.id &&
          workout.status === "planned",
      ),
    );
  });
});
