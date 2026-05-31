import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluatePlanGoalAdjustment,
  generateTrainingPlan,
} from "../lib/training/planGenerator.ts";
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
  lactate_threshold_heart_rate: null,
  aerobic_threshold_heart_rate: null,
  user_hr_zones: null,
  aerobic_threshold_pace_sec_per_km: null,
  threshold_power_watts: null,
  critical_power_watts: null,
  easy_power_min_watts: null,
  easy_power_max_watts: null,
  user_power_zones: null,
  vo2max: null,
  vo2max_source: null,
  zones_source_priority: null,
  physiology_updated_at: null,
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

function getNonRaceWeeklySummaries(generatedPlan) {
  return generatedPlan.trainingPlan.weekly_summaries.filter(
    (week) => !week.is_race_week,
  );
}

function assertWeeklyIntensityCaps(summary) {
  assert.ok(summary.intensity_total_run_km > 0);
  assert.ok(summary.intensity_easy_km >= 0);
  assert.ok(summary.intensity_moderate_km >= 0);
  assert.ok(summary.intensity_threshold_km <= summary.threshold_cap_km + 0.2);
  assert.ok(summary.intensity_vo2_km <= summary.vo2_cap_km + 0.2);
  assert.ok(summary.intensity_repetition_km <= summary.repetition_cap_km + 0.2);
  assert.deepEqual(summary.load_risk_flags, []);
}

function countMajorLoadJumps(previousWeek, currentWeek) {
  const volumeJump =
    currentWeek.volume_km > previousWeek.volume_km + Math.max(2, previousWeek.volume_km * 0.06);
  const longRunJump =
    currentWeek.long_run_km > previousWeek.long_run_km + Math.max(1, previousWeek.long_run_km * 0.08);
  const previousIntensity =
    (previousWeek.intensity_moderate_km ?? 0) + (previousWeek.intensity_hard_km ?? 0);
  const currentIntensity =
    (currentWeek.intensity_moderate_km ?? 0) + (currentWeek.intensity_hard_km ?? 0);
  const intensityJump = currentIntensity > previousIntensity + 1;
  const hillJump = (currentWeek.hill_load_km ?? 0) > (previousWeek.hill_load_km ?? 0) + 0.8;

  return [volumeJump, longRunJump, intensityJump, hillJump].filter(Boolean).length;
}

function getAllNonRaceRunningWorkouts(generatedPlan, raceDate) {
  return generatedPlan.plannedWorkouts.filter(
    (workout) => workout.distance_km !== null && workout.workout_date !== raceDate,
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

function makeLoggedWorkout(overrides = {}) {
  const distanceKm = overrides.distance_km ?? 8;
  const paceSecPerKm = overrides.avg_pace_sec_per_km ?? 360;

  return {
    id: overrides.id ?? "log-1",
    user_id: "user-1",
    profile_id: "profile-1",
    race_goal_id: "goal-1",
    training_plan_id: null,
    planned_workout_id: null,
    workout_date: overrides.workout_date ?? "2030-03-01",
    workout_type: overrides.workout_type ?? "run",
    source: overrides.source ?? "manual",
    source_activity_id: overrides.source_activity_id ?? null,
    distance_km: distanceKm,
    duration_sec: overrides.duration_sec ?? Math.round(distanceKm * paceSecPerKm),
    avg_pace_sec_per_km: paceSecPerKm,
    avg_heart_rate: overrides.avg_heart_rate ?? null,
    max_heart_rate: overrides.max_heart_rate ?? null,
    cadence: null,
    elevation_gain_m: overrides.elevation_gain_m ?? null,
    rpe: overrides.rpe ?? null,
    notes: overrides.notes ?? null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
  };
}

function makeStravaEvidence(overrides = {}) {
  return {
    stravaActivityId: overrides.stravaActivityId ?? "activity-1",
    hasDetail: overrides.hasDetail ?? true,
    hasStreams: overrides.hasStreams ?? true,
    hasHeartRateStream: overrides.hasHeartRateStream ?? false,
    hasPowerStream: overrides.hasPowerStream ?? false,
    achievementCount: overrides.achievementCount ?? 0,
    bestEffortCount: overrides.bestEffortCount ?? 0,
    prCount: overrides.prCount ?? 0,
    perceivedExertion: overrides.perceivedExertion ?? null,
    workoutType: overrides.workoutType ?? null,
    paceFadePercent: overrides.paceFadePercent ?? null,
    heartRateDriftPercent: overrides.heartRateDriftPercent ?? null,
    negativeSplit: overrides.negativeSplit ?? null,
    splitPaceVariationPercent: overrides.splitPaceVariationPercent ?? null,
    sustainedHardSectionCount: overrides.sustainedHardSectionCount ?? 0,
    elevationGainM: overrides.elevationGainM ?? null,
    altitudeRangeM: overrides.altitudeRangeM ?? null,
    gradeRangePercent: overrides.gradeRangePercent ?? null,
    effortSignals: overrides.effortSignals ?? [],
    classificationHint: overrides.classificationHint ?? null,
  };
}

function makeAerobicTrendWorkout(blockPrefix, index, overrides = {}) {
  return makeLoggedWorkout({
    id: `${blockPrefix}-${index}`,
    workout_date: overrides.workout_date,
    distance_km: overrides.distance_km ?? 8,
    avg_pace_sec_per_km: overrides.avg_pace_sec_per_km ?? 360,
    avg_heart_rate: overrides.avg_heart_rate ?? 140,
    rpe: overrides.rpe ?? 2,
    notes: overrides.notes ?? "easy run",
    elevation_gain_m: overrides.elevation_gain_m ?? 40,
  });
}

function makeAerobicTrendWorkouts(blockPaces) {
  return [
    makeAerobicTrendWorkout("old", 1, {
      workout_date: "2030-03-01",
      avg_pace_sec_per_km: blockPaces.old[0],
    }),
    makeAerobicTrendWorkout("old", 2, {
      workout_date: "2030-03-05",
      avg_pace_sec_per_km: blockPaces.old[1],
    }),
    makeAerobicTrendWorkout("middle", 1, {
      workout_date: "2030-03-18",
      avg_pace_sec_per_km: blockPaces.middle[0],
    }),
    makeAerobicTrendWorkout("middle", 2, {
      workout_date: "2030-03-21",
      avg_pace_sec_per_km: blockPaces.middle[1],
    }),
    makeAerobicTrendWorkout("recent", 1, {
      workout_date: "2030-04-01",
      avg_pace_sec_per_km: blockPaces.recent[0],
    }),
    makeAerobicTrendWorkout("recent", 2, {
      workout_date: "2030-04-04",
      avg_pace_sec_per_km: blockPaces.recent[1],
    }),
  ];
}

function isHardWorkout(workout) {
  return (
    workout.workout_type === "tempo" ||
    workout.workout_type === "interval" ||
    workout.workout_type === "marathon_pace"
  );
}

function hasNestedRepeats(steps) {
  return steps.some((step) => {
    if (!step.repeat) {
      return false;
    }

    return step.repeat.steps.some(
      (repeatStep) => Boolean(repeatStep.repeat) || hasNestedRepeats([repeatStep]),
    );
  });
}

function hasOpenLeafDuration(steps) {
  return steps.some((step) => {
    if (step.repeat) {
      return hasOpenLeafDuration(step.repeat.steps);
    }

    return step.durationType === "open";
  });
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
    assert.equal(firstRun?.workout_type, "easy");
    assert.notEqual(firstRun?.title, "Calibration run");
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

    assert.equal(
      generatedPlan.plannedWorkouts.some((workout) => workout.workout_type === "calibration"),
      false,
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
        week2Runs.some((workout) => workout.title.startsWith("Medium-long")),
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

  it("returns persisted generator metadata for plan explainability", () => {
    const generatedPlan = generateTrainingPlan(baseProfile, baseRaceGoal, {
      startDate: "2030-05-06",
    });
    const { trainingPlan } = generatedPlan;
    const maxWeeklyVolume = Math.max(
      ...trainingPlan.weekly_summaries.map((week) => week.volume_km),
    );

    assert.equal(trainingPlan.generator_version, "rule_based_v1");
    assert.equal(trainingPlan.generated_by, "rule_based_v1");
    assert.equal(trainingPlan.feasibility_rating, "finish_only");
    assert.equal(trainingPlan.fitness_confidence, "high");
    assert.deepEqual(trainingPlan.generation_assumptions, trainingPlan.assumptions);
    assert.deepEqual(trainingPlan.generation_warnings, trainingPlan.warnings);
    assert.equal(trainingPlan.weekly_summaries.length, trainingPlan.total_weeks);
    assert.ok(trainingPlan.phase_summaries.length > 0);
    assert.equal(trainingPlan.phase_summaries[0].start_week, 1);
    assert.equal(
      trainingPlan.phase_summaries[trainingPlan.phase_summaries.length - 1]
        .end_week,
      trainingPlan.total_weeks,
    );
    assert.equal(trainingPlan.peak_summary.volume_km, maxWeeklyVolume);
    assert.ok(trainingPlan.taper_summary.taper_weeks > 0);
    assert.ok(trainingPlan.taper_summary.race_week_volume_km > 0);
    assert.equal(trainingPlan.fitness_anchor_summary, null);
    assert.equal(trainingPlan.aerobic_efficiency_summary.trend, "unknown");
    assert.equal(trainingPlan.aerobic_efficiency_summary.confidence, "unknown");
    assert.ok(trainingPlan.goal_readiness_summary);
    assert.ok(
      ["high", "medium", "low", "constrained"].includes(
        trainingPlan.goal_readiness_summary.goal_readiness_score
          .overall_goal_readiness,
      ),
    );
  });

  it("records selected fitness-anchor recency metadata on generated plans", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        threshold_pace_sec_per_km: null,
        max_heart_rate: 190,
      }),
      baseRaceGoal,
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([35, 36, 37, 38, 39, 40]),
        recentHistoryWorkouts: [
          makeLoggedWorkout({
            id: "recent-near-max",
            workout_date: "2030-04-01",
            distance_km: 10,
            avg_pace_sec_per_km: 300,
            rpe: 9,
            notes: "near max effort",
          }),
          makeLoggedWorkout({
            id: "old-near-max",
            workout_date: "2030-03-07",
            distance_km: 10,
            avg_pace_sec_per_km: 295,
            rpe: 9,
            notes: "near max effort",
          }),
        ],
      },
    );

    assert.deepEqual(generatedPlan.trainingPlan.fitness_anchor_summary, {
      workout_id: "recent-near-max",
      workout_date: "2030-04-01",
      classification: "possible_near_max",
      recency_bucket: "0_14_days",
      score: 0.58,
      recency_weighting_changed_selection: true,
    });
  });

  it("records aerobic-efficiency metadata and can mildly upgrade fitness confidence", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        threshold_pace_sec_per_km: null,
        current_weekly_mileage_km: 42,
        longest_recent_run_km: 18,
      }),
      baseRaceGoal,
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([38, 40, 42, 42, 43, 44], "mixed"),
        recentHistoryWorkouts: makeAerobicTrendWorkouts({
          old: [362, 360],
          middle: [352, 350],
          recent: [342, 340],
        }),
      },
    );
    const summary = generatedPlan.trainingPlan.aerobic_efficiency_summary;

    assert.equal(summary.trend, "improving");
    assert.equal(summary.confidence, "high");
    assert.equal(summary.method, "heart_rate");
    assert.equal(summary.fitness_confidence_adjustment.direction, "upgraded");
    assert.equal(generatedPlan.trainingPlan.fitness_confidence, "high");
  });

  it("does not let improving aerobic trend make a not-credible goal credible", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        threshold_pace_sec_per_km: null,
        current_weekly_mileage_km: 55,
        longest_recent_run_km: 24,
        running_days_per_week: 5,
        available_training_days: ["monday", "tuesday", "wednesday", "friday", "saturday"],
      }),
      makeRaceGoal({
        goal_flexibility: "fixed",
        target_priority: "aggressive",
        race_priority: "A",
        target_finish_time_sec: 7200,
      }),
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([50, 52, 54, 55, 56, 58], "mixed"),
        recentHistoryWorkouts: makeAerobicTrendWorkouts({
          old: [362, 360],
          middle: [352, 350],
          recent: [342, 340],
        }),
      },
    );

    assert.equal(
      generatedPlan.trainingPlan.aerobic_efficiency_summary.trend,
      "improving",
    );
    assert.equal(generatedPlan.trainingPlan.feasibility_rating, "not_credible");
  });

  it("declining aerobic trend does not downgrade race/time-trial anchor confidence", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        threshold_pace_sec_per_km: null,
        max_heart_rate: 190,
        current_weekly_mileage_km: 42,
        longest_recent_run_km: 18,
      }),
      baseRaceGoal,
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([38, 40, 42, 42, 43, 44], "mixed"),
        recentHistoryWorkouts: [
          ...makeAerobicTrendWorkouts({
            old: [340, 342],
            middle: [350, 352],
            recent: [360, 362],
          }),
          makeLoggedWorkout({
            id: "race-anchor",
            workout_date: "2030-04-02",
            distance_km: 10,
            avg_pace_sec_per_km: 300,
            avg_heart_rate: 176,
            rpe: 9,
            notes: "10K race effort",
          }),
        ],
      },
    );

    assert.equal(
      generatedPlan.trainingPlan.aerobic_efficiency_summary.trend,
      "declining",
    );
    assert.equal(
      generatedPlan.trainingPlan.aerobic_efficiency_summary
        .fitness_confidence_adjustment.direction,
      "none",
    );
    assert.equal(generatedPlan.trainingPlan.fitness_confidence, "high");
  });

  it("records marathon goal-readiness signals for a supported realistic target", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 70,
        longest_recent_run_km: 30,
        easy_pace_sec_per_km: 330,
        threshold_pace_sec_per_km: 285,
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
        running_experience_level: "advanced",
      }),
      makeRaceGoal({
        goal_flexibility: "fixed",
        race_priority: "A",
        target_priority: "moderate",
        target_finish_time_sec: 15000,
        race_course_profile: "flat",
      }),
      { startDate: "2030-05-06" },
    );
    const summary = generatedPlan.trainingPlan.goal_readiness_summary;

    assert.equal(generatedPlan.trainingPlan.feasibility_rating, "realistic");
    assert.equal(summary.goal_readiness_score.volume_readiness, "high");
    assert.match(summary.goal_readiness_score.long_run_readiness, /high|medium/);
    assert.equal(summary.goal_readiness_score.threshold_readiness, "high");
    assert.equal(summary.goal_readiness_score.race_pace_readiness, "high");
    assert.equal(summary.goal_readiness_score.frequency_readiness, "high");
    assert.equal(summary.goal_pace_strategy, "goal_pace_in_specific_peak");
    assert.ok(summary.peak_phase_summary.threshold_workout_count > 0);
    assert.ok(
      summary.peak_phase_summary.race_pace_workout_count +
        summary.peak_phase_summary.race_specific_long_run_count >
        0,
    );
    assert.ok(summary.peak_phase_summary.medium_long_workout_count > 0);
  });

  it("records half-marathon threshold and race-pace readiness for a supported target", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 45,
        longest_recent_run_km: 16,
        easy_pace_sec_per_km: 330,
        threshold_pace_sec_per_km: 285,
        available_training_days: [
          "monday",
          "tuesday",
          "wednesday",
          "friday",
          "saturday",
        ],
        running_days_per_week: 5,
        running_experience_level: "advanced",
      }),
      makeRaceGoal({
        race_name: "Spring Half",
        race_date: "2030-09-15",
        distance: "half_marathon",
        goal_flexibility: "fixed",
        race_priority: "A",
        target_priority: "moderate",
        target_finish_time_sec: 6600,
        race_course_profile: "flat",
      }),
      { startDate: "2030-05-06" },
    );
    const summary = generatedPlan.trainingPlan.goal_readiness_summary;

    assert.equal(generatedPlan.trainingPlan.feasibility_rating, "realistic");
    assert.equal(summary.goal_readiness_score.threshold_readiness, "high");
    assert.equal(summary.goal_readiness_score.race_pace_readiness, "high");
    assert.equal(summary.goal_pace_strategy, "goal_pace_in_specific_peak");
    assert.ok(summary.peak_phase_summary.threshold_workout_count > 0);
    assert.ok(summary.peak_phase_summary.race_pace_workout_count > 0);
  });

  it("marks 3-day target readiness constrained without adding unsafe extra runs", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        available_training_days: ["tuesday", "thursday", "saturday"],
        running_days_per_week: 3,
        running_experience_level: "intermediate",
      }),
      makeRaceGoal({
        goal_flexibility: "fixed",
        race_priority: "A",
        target_priority: "moderate",
        target_finish_time_sec: 17000,
        race_course_profile: "flat",
      }),
      { startDate: "2030-05-06" },
    );
    const summary = generatedPlan.trainingPlan.goal_readiness_summary;

    assert.equal(generatedPlan.trainingPlan.feasibility_rating, "very_ambitious");
    assert.equal(summary.goal_readiness_score.frequency_readiness, "constrained");
    assert.equal(summary.goal_readiness_score.overall_goal_readiness, "constrained");
    assert.equal(getRunningWorkouts(generatedPlan, 2).length, 3);
    assert.ok(
      summary.key_constraints.some((constraint) =>
        constraint.includes("run frequency"),
      ),
    );
  });

  it("does not force race-pace readiness for a low-base not-credible goal", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 16,
        longest_recent_run_km: 6,
        easy_pace_sec_per_km: 390,
        threshold_pace_sec_per_km: 345,
        available_training_days: ["tuesday", "thursday", "saturday"],
        running_days_per_week: 3,
        training_aggressiveness: "aggressive",
        running_experience_level: "beginner",
      }),
      makeRaceGoal({
        goal_flexibility: "fixed",
        race_priority: "A",
        target_priority: "aggressive",
        target_finish_time_sec: 14400,
        race_course_profile: "flat",
      }),
      { startDate: "2030-05-06" },
    );
    const summary = generatedPlan.trainingPlan.goal_readiness_summary;

    assert.equal(generatedPlan.trainingPlan.feasibility_rating, "not_credible");
    assert.equal(summary.goal_readiness_score.overall_goal_readiness, "constrained");
    assert.equal(summary.peak_phase_summary.race_pace_workout_count, 0);
    assert.equal(summary.peak_phase_summary.race_specific_long_run_count, 0);
    assert.equal(summary.goal_pace_strategy, "bridge_pace_until_supported");
    assert.equal(
      generatedPlan.plannedWorkouts.some(
        (workout) => workout.workout_type === "marathon_pace",
      ),
      false,
    );
  });

  it("keeps readiness-adjusted plans inside intensity caps and hard-day spacing", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 62,
        longest_recent_run_km: 24,
        easy_pace_sec_per_km: 335,
        threshold_pace_sec_per_km: 292,
        available_training_days: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ],
        running_days_per_week: 6,
        terrain_available: ["flat", "hills"],
        training_aggressiveness: "aggressive",
        running_experience_level: "advanced",
      }),
      makeRaceGoal({
        goal_flexibility: "fixed",
        race_priority: "A",
        target_priority: "moderate",
        target_finish_time_sec: 15000,
        race_course_profile: "flat",
      }),
      { startDate: "2030-05-06" },
    );
    const nonRaceWeeks = getNonRaceWeeklySummaries(generatedPlan);

    assert.ok(generatedPlan.trainingPlan.goal_readiness_summary);
    for (const summary of nonRaceWeeks) {
      assertWeeklyIntensityCaps(summary);
    }

    for (let index = 1; index < generatedPlan.plannedWorkouts.length; index += 1) {
      assert.ok(
        !(
          isHardWorkout(generatedPlan.plannedWorkouts[index - 1]) &&
          isHardWorkout(generatedPlan.plannedWorkouts[index])
        ),
      );
    }
  });

  it("records weekly intensity distribution metadata and keeps work inside weekly caps", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 55,
        longest_recent_run_km: 22,
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
        running_experience_level: "advanced",
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const nonRaceWeeks = getNonRaceWeeklySummaries(generatedPlan);

    assert.ok(nonRaceWeeks.length > 0);
    for (const summary of nonRaceWeeks) {
      assertWeeklyIntensityCaps(summary);
    }
  });

  it("limits gray-zone load in low-base duration-capped plans", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 18,
        longest_recent_run_km: 7,
        available_training_days: ["tuesday", "thursday", "saturday"],
        running_days_per_week: 3,
        maximum_weekday_session_duration_min: 35,
        maximum_weekend_session_duration_min: 60,
        training_aggressiveness: "aggressive",
        running_experience_level: "beginner",
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const nonRaceWeeks = getNonRaceWeeklySummaries(generatedPlan);

    for (const summary of nonRaceWeeks) {
      assert.ok(
        (summary.intensity_moderate_share ?? 0) + (summary.intensity_hard_share ?? 0) <=
          0.24,
      );
      assertWeeklyIntensityCaps(summary);
    }
  });

  it("avoids stacking volume, long-run, intensity, and hill-load jumps in normal build weeks", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 55,
        longest_recent_run_km: 22,
        available_training_days: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ],
        running_days_per_week: 6,
        terrain_available: ["hills", "track", "flat"],
        training_aggressiveness: "aggressive",
        running_experience_level: "advanced",
      }),
      makeRaceGoal({
        race_course_profile: "hilly",
        course_elevation_notes: "Rolling hilly course.",
      }),
      { startDate: "2030-05-06" },
    );
    const summaries = generatedPlan.trainingPlan.weekly_summaries;

    for (let index = 1; index < summaries.length; index += 1) {
      const previousWeek = summaries[index - 1];
      const currentWeek = summaries[index];

      if (
        previousWeek.is_cutback ||
        currentWeek.is_cutback ||
        currentWeek.is_taper ||
        currentWeek.is_race_week
      ) {
        continue;
      }

      assert.ok(countMajorLoadJumps(previousWeek, currentWeek) < 3);
    }
    assert.ok(
      generatedPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("simultaneous volume, long-run, intensity, or hill-load"),
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

  it("caps generated workout durations by saved weekday and weekend limits", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 45,
        longest_recent_run_km: 18,
        maximum_weekday_session_duration_min: 45,
        maximum_weekend_session_duration_min: 75,
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const nonRaceRuns = getAllNonRaceRunningWorkouts(
      generatedPlan,
      baseRaceGoal.race_date,
    );

    assert.ok(nonRaceRuns.length > 0);
    for (const workout of nonRaceRuns) {
      const cap =
        workout.day_label === "saturday" || workout.day_label === "sunday" ? 75 : 45;

      assert.ok(
        workout.duration_min <= cap,
        `${workout.workout_date} should be capped at ${cap} minutes`,
      );
    }
    assert.ok(
      generatedPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("Max session duration limits"),
      ),
    );
  });

  it("reduces peak load for beginner low-base runners", () => {
    const sharedProfile = {
      current_weekly_mileage_km: 22,
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
    };
    const beginnerPlan = generateTrainingPlan(
      makeProfile({
        ...sharedProfile,
        running_experience_level: "beginner",
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const intermediatePlan = generateTrainingPlan(
      makeProfile({
        ...sharedProfile,
        running_experience_level: "intermediate",
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );

    assert.ok(
      getMaxNonRaceWeekDistance(beginnerPlan) < getMaxNonRaceWeekDistance(intermediatePlan),
    );
    assert.equal(
      beginnerPlan.plannedWorkouts.some(
        (workout) => workout.workout_type === "interval",
      ),
      false,
    );
  });

  it("blocks aggressive mode when current pain or serious injury is present", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        training_aggressiveness: "very_aggressive",
        current_pain_or_injury: true,
        serious_recent_injury: true,
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );

    assert.ok(
      generatedPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("aggressive mode is blocked"),
      ),
    );
  });

  it("keeps low confidence when only easy pace evidence is available", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        threshold_pace_sec_per_km: null,
        max_heart_rate: null,
      }),
      baseRaceGoal,
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([35, 36, 37, 38, 39, 40], "mixed"),
        recentHistoryWorkouts: [
          makeLoggedWorkout({
            id: "easy-only",
            avg_pace_sec_per_km: 365,
            rpe: 2,
          }),
        ],
      },
    );

    assert.ok(
      generatedPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("Current race ability") &&
        assumption.includes("low confidence"),
      ),
    );
    assert.ok(
      generatedPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("Fitness confidence is low"),
      ),
    );
  });

  it("warns when a hilly race course is not supported by terrain or elevation evidence", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        terrain_available: ["flat"],
      }),
      makeRaceGoal({
        race_course_profile: "hilly",
        course_elevation_notes: "Rolling hills throughout the course.",
      }),
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([35, 36, 37, 38, 39, 40], "mixed"),
        recentHistoryWorkouts: [
          makeLoggedWorkout({ id: "flat-1", elevation_gain_m: 10 }),
          makeLoggedWorkout({ id: "flat-2", elevation_gain_m: 12 }),
        ],
      },
    );

    assert.ok(
      generatedPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("race course looks hilly"),
      ),
    );
  });

  it("uses saved threshold pace with higher confidence than easy-pace-only estimates", () => {
    const recentHistory = makeRecentHistory([35, 36, 37, 38, 39, 40], "mixed");
    const thresholdPlan = generateTrainingPlan(
      makeProfile({
        threshold_pace_sec_per_km: 315,
      }),
      baseRaceGoal,
      {
        startDate: "2030-05-06",
        recentHistory,
      },
    );
    const easyOnlyPlan = generateTrainingPlan(
      makeProfile({
        threshold_pace_sec_per_km: null,
        max_heart_rate: null,
      }),
      baseRaceGoal,
      {
        startDate: "2030-05-06",
        recentHistory,
        recentHistoryWorkouts: [
          makeLoggedWorkout({
            id: "easy-only-confidence",
            avg_pace_sec_per_km: 365,
            rpe: 2,
          }),
        ],
      },
    );

    assert.ok(
      thresholdPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("Current race ability") &&
        assumption.includes("high confidence"),
      ),
    );
    assert.ok(
      easyOnlyPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("Current race ability") &&
        assumption.includes("low confidence"),
      ),
    );
  });

  it("keeps VO2max as context instead of making unsupported aggressive goals credible", () => {
    const suggestion = evaluatePlanGoalAdjustment(
      makeProfile({
        threshold_pace_sec_per_km: null,
        easy_pace_sec_per_km: 420,
        max_heart_rate: null,
        vo2max: 75,
        vo2max_source: "garmin",
        current_weekly_mileage_km: 20,
        longest_recent_run_km: 8,
        running_days_per_week: 3,
        available_training_days: ["monday", "wednesday", "saturday"],
      }),
      makeRaceGoal({
        target_finish_time_sec: 7200,
        target_priority: "aggressive",
        race_priority: "A",
        goal_flexibility: "fixed",
      }),
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([16, 17, 18, 19, 20, 21], "mixed"),
      },
    );

    assert.ok(suggestion);
    assert.notEqual(suggestion.fitnessConfidence, "high");
    assert.ok(suggestion.suggestedTargetFinishTimeSec > 7200);
  });

  it("adds power target guidance only when power inputs are saved", () => {
    const withoutPower = generateTrainingPlan(
      makeProfile({
        threshold_power_watts: null,
        critical_power_watts: null,
        easy_power_min_watts: null,
        easy_power_max_watts: null,
        user_power_zones: null,
      }),
      baseRaceGoal,
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([35, 36, 37, 38, 39, 40], "mixed"),
      },
    );
    const withPower = generateTrainingPlan(
      makeProfile({
        threshold_power_watts: 260,
      }),
      baseRaceGoal,
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([35, 36, 37, 38, 39, 40], "mixed"),
      },
    );
    const withoutPowerInstructions = withoutPower.plannedWorkouts
      .map((workout) => workout.instructions ?? "")
      .join(" ");
    const withPowerWorkout = withPower.plannedWorkouts.find((workout) =>
      workout.instructions?.includes("power"),
    );

    assert.doesNotMatch(withoutPowerInstructions, /Optional physiology target: .*power/);
    assert.ok(withPowerWorkout);
    assert.match(withPowerWorkout.instructions ?? "", /power/);
    assert.equal(withPowerWorkout.structured_workout?.version, 1);
  });

  it("suggests a fastest supportable goal when the requested target is not credible", () => {
    const suggestion = evaluatePlanGoalAdjustment(
      makeProfile({
        running_days_per_week: 5,
        available_training_days: ["monday", "tuesday", "wednesday", "friday", "saturday"],
        current_weekly_mileage_km: 70,
        longest_recent_run_km: 30,
        threshold_pace_sec_per_km: 285,
      }),
      makeRaceGoal({
        goal_flexibility: "fixed",
        target_finish_time_sec: 7200,
      }),
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([76, 76, 76, 76, 76, 76], "mixed"),
      },
    );

    assert.ok(suggestion);
    assert.equal(suggestion.feasibilityRating, "very_ambitious");
    assert.equal(suggestion.fitnessConfidence, "high");
    assert.equal(suggestion.originalTargetFinishTimeSec, 7200);
    assert.ok(
      suggestion.suggestedTargetFinishTimeSec >
        suggestion.originalTargetFinishTimeSec,
    );
    assert.ok(
      suggestion.suggestedTargetFinishTimeSec <
        suggestion.currentEstimatedFinishTimeSec,
    );
  });

  it("generates with the confirmed suggested goal and records the adjustment", () => {
    const profile = makeProfile({
      running_days_per_week: 5,
      available_training_days: ["monday", "tuesday", "wednesday", "friday", "saturday"],
      current_weekly_mileage_km: 70,
      longest_recent_run_km: 30,
      threshold_pace_sec_per_km: 285,
    });
    const raceGoal = makeRaceGoal({
      goal_flexibility: "fixed",
      target_finish_time_sec: 7200,
    });
    const options = {
      startDate: "2030-05-06",
      recentHistory: makeRecentHistory([76, 76, 76, 76, 76, 76], "mixed"),
    };
    const suggestion = evaluatePlanGoalAdjustment(profile, raceGoal, options);

    assert.ok(suggestion);

    const generatedPlan = generateTrainingPlan(profile, raceGoal, {
      ...options,
      goalAdjustmentSuggestion: suggestion,
    });

    assert.equal(generatedPlan.trainingPlan.feasibility_rating, "very_ambitious");
    assert.ok(
      generatedPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("confirmed suggested goal"),
      ),
    );
    assert.ok(
      generatedPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("saved Race Goal record was not edited"),
      ),
    );
  });

  it("uses race/time-trial evidence with stronger confidence than hard-workout evidence", () => {
    const recentHistory = makeRecentHistory([35, 36, 37, 38, 39, 40], "mixed");
    const raceAnchorPlan = generateTrainingPlan(
      makeProfile({
        threshold_pace_sec_per_km: null,
        max_heart_rate: 190,
      }),
      baseRaceGoal,
      {
        startDate: "2030-05-06",
        recentHistory,
        recentHistoryWorkouts: [
          makeLoggedWorkout({
            id: "race-anchor",
            distance_km: 10,
            avg_pace_sec_per_km: 300,
            avg_heart_rate: 174,
            rpe: 9,
            notes: "10K race effort",
          }),
        ],
      },
    );
    const hardAnchorPlan = generateTrainingPlan(
      makeProfile({
        threshold_pace_sec_per_km: null,
        max_heart_rate: 190,
      }),
      baseRaceGoal,
      {
        startDate: "2030-05-06",
        recentHistory,
        recentHistoryWorkouts: [
          makeLoggedWorkout({
            id: "hard-anchor",
            distance_km: 10,
            avg_pace_sec_per_km: 300,
            avg_heart_rate: 174,
            rpe: 7,
            notes: "tempo workout",
          }),
        ],
      },
    );

    assert.equal(raceAnchorPlan.trainingPlan.fitness_confidence, "high");
    assert.equal(hardAnchorPlan.trainingPlan.fitness_confidence, "medium");
  });

  it("penalizes marathon projections from short hard efforts when durability is weak", () => {
    const profile = makeProfile({
      threshold_pace_sec_per_km: null,
      current_weekly_mileage_km: 25,
      longest_recent_run_km: 8,
      running_days_per_week: 3,
      max_heart_rate: 190,
    });
    const recentHistory = makeRecentHistory([20, 22, 24, 25, 25, 26], "mixed");
    const workout = makeLoggedWorkout({
      id: "short-race",
      distance_km: 5,
      avg_pace_sec_per_km: 280,
      avg_heart_rate: 176,
      rpe: 9,
      notes: "5K race",
    });
    const marathonSuggestion = evaluatePlanGoalAdjustment(
      profile,
      makeRaceGoal({
        distance: "marathon",
        goal_flexibility: "fixed",
        target_finish_time_sec: 9000,
      }),
      {
        startDate: "2030-05-06",
        recentHistory,
        recentHistoryWorkouts: [workout],
      },
    );
    const halfSuggestion = evaluatePlanGoalAdjustment(
      profile,
      makeRaceGoal({
        distance: "half_marathon",
        goal_flexibility: "fixed",
        target_finish_time_sec: 4500,
      }),
      {
        startDate: "2030-05-06",
        recentHistory,
        recentHistoryWorkouts: [workout],
      },
    );

    assert.ok(marathonSuggestion);
    assert.ok(halfSuggestion);

    const marathonEstimatedPace =
      marathonSuggestion.currentEstimatedFinishTimeSec / 42.2;
    const halfEstimatedPace =
      halfSuggestion.currentEstimatedFinishTimeSec / 21.1;

    assert.ok(marathonEstimatedPace > halfEstimatedPace);
  });

  it("selects spec-style workout subtypes for supported marathon layouts", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 55,
        longest_recent_run_km: 22,
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
        running_experience_level: "advanced",
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const titles = generatedPlan.plannedWorkouts.map((workout) => workout.title);

    assert.ok(titles.some((title) => title.startsWith("Cruise interval") || title.includes("tempo")));
    assert.ok(titles.some((title) => title.startsWith("Medium-long")));
    assert.ok(titles.some((title) => title.includes("race-pace blocks")));
    assert.ok(titles.some((title) => title.includes("strides")));
  });

  it("prioritizes half-marathon pace work more than marathon plans", () => {
    const sharedProfile = makeProfile({
      current_weekly_mileage_km: 42,
      longest_recent_run_km: 16,
      available_training_days: [
        "monday",
        "tuesday",
        "wednesday",
        "friday",
        "saturday",
      ],
      running_days_per_week: 5,
      training_aggressiveness: "aggressive",
      running_experience_level: "intermediate",
    });
    const halfPlan = generateTrainingPlan(
      sharedProfile,
      makeRaceGoal({
        race_name: "Spring Half",
        race_date: "2030-09-15",
        distance: "half_marathon",
        target_finish_time_sec: 5400,
        target_priority: "personal_best",
        race_priority: "B",
        goal_flexibility: "flexible",
      }),
      { startDate: "2030-05-06" },
    );
    const marathonPlan = generateTrainingPlan(sharedProfile, baseRaceGoal, {
      startDate: "2030-05-06",
    });

    assert.ok(
      halfPlan.plannedWorkouts.some((workout) =>
        workout.title.includes("Half-marathon pace"),
      ),
    );
    assert.equal(
      marathonPlan.plannedWorkouts.some((workout) =>
        workout.title.includes("Half-marathon pace"),
      ),
      false,
    );
  });

  it("adds hill-supported work only when terrain and elevation evidence support it", () => {
    const supportedHillPlan = generateTrainingPlan(
      makeProfile({
        terrain_available: ["flat", "hills"],
        current_weekly_mileage_km: 42,
        longest_recent_run_km: 18,
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
      makeRaceGoal({
        race_course_profile: "hilly",
        course_elevation_notes: "Rolling hills throughout.",
      }),
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([38, 39, 41, 42, 43, 44], "mixed"),
        recentHistoryWorkouts: [
          makeLoggedWorkout({ id: "hill-1", elevation_gain_m: 300 }),
          makeLoggedWorkout({ id: "hill-2", elevation_gain_m: 300 }),
          makeLoggedWorkout({ id: "hill-3", elevation_gain_m: 300 }),
        ],
      },
    );
    const unsupportedHillPlan = generateTrainingPlan(
      makeProfile({
        terrain_available: ["flat"],
      }),
      makeRaceGoal({
        race_course_profile: "hilly",
        course_elevation_notes: "Rolling hills throughout.",
      }),
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([35, 36, 37, 38, 39, 40], "mixed"),
        recentHistoryWorkouts: [
          makeLoggedWorkout({ id: "flat-1", elevation_gain_m: 10 }),
          makeLoggedWorkout({ id: "flat-2", elevation_gain_m: 12 }),
        ],
      },
    );

    assert.ok(
      supportedHillPlan.plannedWorkouts.some((workout) =>
        workout.title.includes("Hill"),
      ),
    );
    assert.equal(
      unsupportedHillPlan.plannedWorkouts.some((workout) =>
        workout.title.includes("Hill"),
      ),
      false,
    );
  });

  it("uses hill strides before hill repeats when durability evidence is cautious", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        terrain_available: ["flat", "hills"],
        current_weekly_mileage_km: 48,
        longest_recent_run_km: 18,
        available_training_days: [
          "monday",
          "tuesday",
          "wednesday",
          "friday",
          "saturday",
        ],
        running_days_per_week: 5,
        training_aggressiveness: "aggressive",
        running_experience_level: "intermediate",
      }),
      makeRaceGoal({
        race_course_profile: "hilly",
        course_elevation_notes: "Rolling hills throughout.",
      }),
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([42, 44, 45, 46, 47, 48], "mixed"),
        recentHistoryWorkouts: [
          makeLoggedWorkout({
            id: "hill-caution-1",
            source: "strava",
            source_activity_id: "hill-caution-1",
            elevation_gain_m: null,
          }),
          makeLoggedWorkout({
            id: "hill-caution-2",
            source: "strava",
            source_activity_id: "hill-caution-2",
            elevation_gain_m: null,
          }),
        ],
        stravaActivityEvidence: [
          makeStravaEvidence({
            stravaActivityId: "hill-caution-1",
            elevationGainM: 420,
            paceFadePercent: 7,
            classificationHint: "easy_non_limit",
          }),
          makeStravaEvidence({
            stravaActivityId: "hill-caution-2",
            elevationGainM: 420,
            heartRateDriftPercent: 7,
            hasHeartRateStream: true,
            classificationHint: "easy_non_limit",
          }),
        ],
      },
    );
    const titles = generatedPlan.plannedWorkouts.map((workout) => workout.title);

    assert.ok(titles.some((title) => title.includes("hill strides")));
    assert.equal(
      titles.some((title) => title.includes("Hill repeat")),
      false,
    );
    assert.ok(
      generatedPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("durability evidence suggests caution"),
      ),
    );
  });

  it("uses pace fade and HR drift to keep long-run intensity conservative", () => {
    const sharedProfile = makeProfile({
      current_weekly_mileage_km: 55,
      longest_recent_run_km: 22,
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
      running_experience_level: "advanced",
    });
    const stablePlan = generateTrainingPlan(sharedProfile, baseRaceGoal, {
      startDate: "2030-05-06",
      recentHistory: makeRecentHistory([50, 52, 54, 55, 56, 57], "mixed"),
    });
    const cautiousPlan = generateTrainingPlan(sharedProfile, baseRaceGoal, {
      startDate: "2030-05-06",
      recentHistory: makeRecentHistory([50, 52, 54, 55, 56, 57], "mixed"),
      recentHistoryWorkouts: [
        makeLoggedWorkout({
          id: "drift-1",
          source: "strava",
          source_activity_id: "drift-1",
        }),
        makeLoggedWorkout({
          id: "drift-2",
          source: "strava",
          source_activity_id: "drift-2",
        }),
      ],
      stravaActivityEvidence: [
        makeStravaEvidence({
          stravaActivityId: "drift-1",
          paceFadePercent: 11,
          classificationHint: "easy_non_limit",
        }),
        makeStravaEvidence({
          stravaActivityId: "drift-2",
          heartRateDriftPercent: 11,
          hasHeartRateStream: true,
          classificationHint: "easy_non_limit",
        }),
      ],
    });

    assert.ok(
      stablePlan.plannedWorkouts.some(
        (workout) =>
          workout.title.includes("race-pace blocks") ||
          workout.title.includes("steady finish"),
      ),
    );
    assert.equal(
      cautiousPlan.plannedWorkouts.some(
        (workout) =>
          workout.title.includes("race-pace blocks") ||
          workout.title.includes("steady finish"),
      ),
      false,
    );
    assert.ok(
      cautiousPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("long-run intensity"),
      ),
    );
  });

  it("avoids the preferred rest day when enough other training days are available", () => {
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
        running_days_per_week: 5,
        preferred_rest_day: "wednesday",
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const nonRaceRuns = getAllNonRaceRunningWorkouts(
      generatedPlan,
      baseRaceGoal.race_date,
    );

    assert.equal(
      nonRaceRuns.some((workout) => workout.day_label === "wednesday"),
      false,
    );
    assert.ok(
      generatedPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("Preferred rest day (Wednesday) is kept free"),
      ),
    );
  });

  it("uses a preferred workout day for quality work when spacing is safe", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        available_training_days: ["tuesday", "thursday", "saturday"],
        running_days_per_week: 3,
        preferred_workout_days: ["tuesday"],
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const week2Tuesday = getWeekWorkouts(generatedPlan, 2).find(
      (workout) => workout.day_label === "tuesday",
    );

    assert.ok(week2Tuesday?.title.includes("Steady"));
    assert.ok(
      generatedPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("Preferred workout day (Tuesday) is used"),
      ),
    );
  });

  it("ignores an unsafe preferred workout day in favor of hard-day spacing", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        available_training_days: ["tuesday", "friday", "saturday"],
        running_days_per_week: 3,
        preferred_workout_days: ["friday"],
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const week2Tuesday = getWeekWorkouts(generatedPlan, 2).find(
      (workout) => workout.day_label === "tuesday",
    );
    const week2Friday = getWeekWorkouts(generatedPlan, 2).find(
      (workout) => workout.day_label === "friday",
    );

    assert.ok(week2Tuesday?.title.includes("Steady"));
    assert.equal(week2Friday?.title.includes("Steady"), false);
    assert.ok(
      generatedPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("preferred workout days conflicted"),
      ),
    );
  });

  it("uses age as a recovery signal for lower peak stress", () => {
    const sharedProfile = {
      current_weekly_mileage_km: 42,
      longest_recent_run_km: 18,
      available_training_days: [
        "monday",
        "tuesday",
        "wednesday",
        "friday",
        "saturday",
      ],
      running_days_per_week: 5,
      training_aggressiveness: "aggressive",
      running_experience_level: "intermediate",
    };
    const olderPlan = generateTrainingPlan(
      makeProfile({
        ...sharedProfile,
        birth_year: 1970,
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const youngerPlan = generateTrainingPlan(
      makeProfile({
        ...sharedProfile,
        birth_year: 1995,
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );

    assert.ok(
      getMaxNonRaceWeekDistance(olderPlan) < getMaxNonRaceWeekDistance(youngerPlan),
    );
    assert.ok(
      olderPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("Age is used as a recovery signal"),
      ),
    );
  });

  it("uses body data only as a low-base load-tolerance modifier", () => {
    const sharedProfile = {
      current_weekly_mileage_km: 22,
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
      running_experience_level: "beginner",
    };
    const bodyCautionPlan = generateTrainingPlan(
      makeProfile({
        ...sharedProfile,
        height_cm: 170,
        weight_kg: 95,
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const noBodyDataPlan = generateTrainingPlan(
      makeProfile(sharedProfile),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );

    assert.ok(
      getMaxNonRaceWeekDistance(bodyCautionPlan) <
        getMaxNonRaceWeekDistance(noBodyDataPlan),
    );
    assert.ok(
      bodyCautionPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("Height and weight are used only as a load-tolerance signal"),
      ),
    );
  });

  it("creates optional cross-training support without a run structured workout", () => {
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
        cross_training_available: true,
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const crossTrainingRows = generatedPlan.plannedWorkouts.filter(
      (workout) => workout.workout_type === "cross_training",
    );

    assert.ok(crossTrainingRows.length > 0);
    assert.ok(
      crossTrainingRows.every(
        (workout) =>
          workout.distance_km === null &&
          workout.structured_workout === null &&
          workout.title === "Optional cross-training",
      ),
    );
  });

  it("treats double-run willingness as capacity context without scheduling doubles", () => {
    const sharedProfile = {
      current_weekly_mileage_km: 60,
      longest_recent_run_km: 24,
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
      running_experience_level: "advanced",
    };
    const willingPlan = generateTrainingPlan(
      makeProfile({
        ...sharedProfile,
        double_run_willingness: true,
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const notWillingPlan = generateTrainingPlan(
      makeProfile(sharedProfile),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const dates = willingPlan.plannedWorkouts.map((workout) => workout.workout_date);

    assert.equal(new Set(dates).size, dates.length);
    assert.ok(
      willingPlan.trainingPlan.peak_summary.volume_km >=
        notWillingPlan.trainingPlan.peak_summary.volume_km,
    );
    assert.ok(
      willingPlan.trainingPlan.assumptions.some((assumption) =>
        assumption.includes("Double-run willingness is treated only as a small capacity signal"),
      ),
    );
  });

  it("biases flat race-specific work toward track or flat terrain when available", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 50,
        longest_recent_run_km: 22,
        available_training_days: [
          "monday",
          "tuesday",
          "wednesday",
          "friday",
          "saturday",
        ],
        running_days_per_week: 5,
        terrain_available: ["hills", "track", "flat"],
        training_aggressiveness: "aggressive",
        running_experience_level: "intermediate",
      }),
      makeRaceGoal({
        race_course_profile: "flat",
        course_elevation_notes: "Fast flat course.",
      }),
      { startDate: "2030-05-06" },
    );
    const raceSpecificWorkout = generatedPlan.plannedWorkouts.find(
      (workout) =>
        workout.workout_type === "marathon_pace" ||
        workout.title.includes("race-pace"),
    );

    assert.ok(raceSpecificWorkout);
    assert.ok(["track", "flat", "treadmill"].includes(raceSpecificWorkout.terrain));
  });

  it("adds weather caution warnings and effort instructions", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile(),
      makeRaceGoal({
        expected_weather_notes: "Likely hot, humid, and windy.",
      }),
      { startDate: "2030-05-06" },
    );

    assert.ok(
      generatedPlan.trainingPlan.warnings.some((warning) =>
        warning.includes("Expected weather notes mention"),
      ),
    );
    assert.ok(
      generatedPlan.plannedWorkouts.some((workout) =>
        workout.instructions.includes("Adjust effort for expected weather"),
      ),
    );
  });

  it("uses effort guidance on trail-heavy or no-flat terrain while preserving pace targets", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        terrain_available: ["trails"],
        current_weekly_mileage_km: 38,
        longest_recent_run_km: 16,
        available_training_days: ["monday", "wednesday", "friday", "saturday"],
        running_days_per_week: 4,
      }),
      makeRaceGoal({
        race_course_profile: "rolling",
        course_elevation_notes: "Rolling mixed-surface course.",
        expected_weather_notes: "Likely warm and humid.",
      }),
      { startDate: "2030-05-06" },
    );
    const runWithPaceTarget = generatedPlan.plannedWorkouts.find(
      (workout) =>
        workout.distance_km !== null &&
        workout.target_pace_min_sec_per_km !== null &&
        workout.target_pace_max_sec_per_km !== null,
    );

    assert.ok(runWithPaceTarget);
    assert.ok(
      generatedPlan.plannedWorkouts.some((workout) =>
        workout.instructions.includes("Use effort and breathing as the primary guide"),
      ),
    );
    assert.ok(
      generatedPlan.plannedWorkouts.some((workout) =>
        workout.instructions.includes("Adjust effort for expected weather"),
      ),
    );
  });

  it("keeps generated structured workouts export-safe with complete leaf steps", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        current_weekly_mileage_km: 50,
        longest_recent_run_km: 22,
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
        running_experience_level: "advanced",
      }),
      baseRaceGoal,
      { startDate: "2030-05-06" },
    );
    const runWorkouts = generatedPlan.plannedWorkouts.filter(
      (workout) => workout.structured_workout !== null,
    );

    for (const workout of runWorkouts) {
      assert.equal(workout.structured_workout.exportSafe, true);
      assert.deepEqual(workout.structured_workout.exportWarnings, []);
      assert.equal(hasNestedRepeats(workout.structured_workout.steps), false);
      assert.equal(hasOpenLeafDuration(workout.structured_workout.steps), false);
    }
  });
});
