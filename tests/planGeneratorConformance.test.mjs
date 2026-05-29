import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluatePlanGoalAdjustment,
  generateTrainingPlan,
} from "../lib/training/planGenerator.ts";

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
  max_heart_rate: 190,
  resting_heart_rate: null,
  available_training_days: ["monday", "wednesday", "saturday"],
  running_days_per_week: 3,
  preferred_long_run_day: "saturday",
  terrain_available: ["flat"],
  training_aggressiveness: "moderate",
  injury_notes: null,
  maximum_weekday_session_duration_min: null,
  maximum_weekend_session_duration_min: null,
  running_experience_level: "intermediate",
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
  race_name: "Spec Check Race",
  race_date: "2030-10-20",
  distance: "marathon",
  target_finish_time_sec: 14400,
  target_priority: "personal_best",
  race_priority: "B",
  goal_flexibility: "flexible",
  race_course_profile: "flat",
  course_elevation_notes: null,
  expected_weather_notes: null,
  is_active: true,
  created_at: "2026-05-04T00:00:00.000Z",
  updated_at: "2026-05-04T00:00:00.000Z",
};

const trainingDaysByCount = {
  3: ["tuesday", "thursday", "saturday"],
  4: ["monday", "wednesday", "friday", "saturday"],
  5: ["monday", "tuesday", "wednesday", "friday", "saturday"],
  6: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
};

const allowedWorkoutTypes = new Set([
  "easy",
  "long_run",
  "tempo",
  "interval",
  "marathon_pace",
  "recovery",
  "rest",
  "strength_optional",
  "cross_training",
]);

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

function makeRecentHistory(weeklyDistances, options = {}) {
  return weeklyDistances.map((distanceKm, index) => {
    const longestRunKm =
      options.longestRuns?.[index] ?? Math.round(distanceKm * 0.38 * 10) / 10;

    return {
      week_start_date: `2030-03-${String(1 + index * 7).padStart(2, "0")}`,
      week_end_date: `2030-03-${String(7 + index * 7).padStart(2, "0")}`,
      distance_km: distanceKm,
      duration_sec: Math.round(distanceKm * (options.paceSecPerKm ?? 360)),
      run_count: options.runCounts?.[index] ?? (distanceKm > 0 ? 4 : 0),
      longest_run_km: longestRunKm,
      longest_run_duration_sec: Math.round(longestRunKm * 390),
      source: options.source ?? "mixed",
    };
  });
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

function strongEvidenceOptions(input = {}) {
  const sourcePrefix = input.prefix ?? "strong";
  const weeklyDistances = input.weeklyDistances ?? [42, 44, 46, 48, 49, 50];
  const elevationGainM = input.elevationGainM ?? 80;

  return {
    recentHistory: makeRecentHistory(weeklyDistances),
    recentHistoryWorkouts: [
      makeLoggedWorkout({
        id: `${sourcePrefix}-easy-1`,
        source: "strava",
        source_activity_id: `${sourcePrefix}-easy-1`,
        distance_km: 10,
        avg_pace_sec_per_km: 365,
        avg_heart_rate: 142,
        elevation_gain_m: elevationGainM,
      }),
      makeLoggedWorkout({
        id: `${sourcePrefix}-steady-1`,
        source: "strava",
        source_activity_id: `${sourcePrefix}-steady-1`,
        distance_km: 12,
        avg_pace_sec_per_km: 345,
        avg_heart_rate: 154,
        elevation_gain_m: elevationGainM,
        rpe: 5,
      }),
      makeLoggedWorkout({
        id: `${sourcePrefix}-hard-1`,
        source: "strava",
        source_activity_id: `${sourcePrefix}-hard-1`,
        distance_km: 8,
        avg_pace_sec_per_km: 315,
        avg_heart_rate: 174,
        max_heart_rate: 184,
        elevation_gain_m: elevationGainM,
        rpe: 8,
        notes: "tempo workout",
      }),
    ],
    stravaActivityEvidence: [
      makeStravaEvidence({
        stravaActivityId: `${sourcePrefix}-easy-1`,
        hasHeartRateStream: true,
        elevationGainM,
        classificationHint: "easy_non_limit",
      }),
      makeStravaEvidence({
        stravaActivityId: `${sourcePrefix}-steady-1`,
        hasHeartRateStream: true,
        elevationGainM,
        negativeSplit: true,
        classificationHint: "controlled",
      }),
      makeStravaEvidence({
        stravaActivityId: `${sourcePrefix}-hard-1`,
        hasHeartRateStream: true,
        hasPowerStream: true,
        elevationGainM,
        perceivedExertion: 8,
        sustainedHardSectionCount: 2,
        classificationHint: "hard_workout",
      }),
    ],
  };
}

function weakEvidenceOptions() {
  return {
    recentHistory: [],
    recentHistoryWorkouts: [],
    stravaActivityEvidence: [],
  };
}

function buildScenario(input) {
  const isHalf = input.distance === "half_marathon";
  const targetFinishTimeSec =
    input.targetFinishTimeSec ??
    (input.mode === "relaxed" ? null : isHalf ? 6300 : 14400);
  const finishOnly = targetFinishTimeSec === null;

  return {
    name: input.name,
    distance: input.distance,
    runDays: input.runDays,
    experience: input.experience,
    evidence: input.evidence,
    course: input.course,
    mode: input.mode,
    durationCapped: Boolean(input.durationCapped),
    expectations: input.expectations ?? {},
    profile: makeProfile({
      id: `${input.name}-profile`,
      current_weekly_mileage_km: input.currentWeeklyKm,
      longest_recent_run_km: input.longestRunKm,
      easy_pace_sec_per_km: input.easyPaceSecPerKm ?? 360,
      threshold_pace_sec_per_km: input.thresholdPaceSecPerKm ?? null,
      available_training_days: trainingDaysByCount[input.runDays],
      running_days_per_week: input.runDays,
      preferred_long_run_day: "saturday",
      terrain_available: input.terrainAvailable,
      training_aggressiveness: input.mode,
      running_experience_level: input.experience,
      maximum_weekday_session_duration_min: input.durationCapped ? 45 : null,
      maximum_weekend_session_duration_min: input.durationCapped ? 75 : null,
      ...input.profileOverrides,
    }),
    raceGoal: makeRaceGoal({
      id: `${input.name}-goal`,
      profile_id: `${input.name}-profile`,
      race_name: `${input.name} race`,
      distance: input.distance,
      race_date: isHalf ? "2030-09-09" : "2030-10-20",
      target_finish_time_sec: targetFinishTimeSec,
      target_priority: finishOnly
        ? "finish"
        : input.mode === "aggressive" || input.mode === "very_aggressive"
          ? "aggressive"
          : "personal_best",
      race_priority: finishOnly
        ? "casual"
        : input.mode === "aggressive" || input.mode === "very_aggressive"
          ? "A"
          : "B",
      goal_flexibility: finishOnly ? "finish_only" : "flexible",
      race_course_profile: input.course,
      course_elevation_notes:
        input.course === "hilly"
          ? "Rolling hills throughout the course."
          : "Flat rhythm course.",
      expected_weather_notes: input.weatherNotes ?? null,
      ...input.goalOverrides,
    }),
    options:
      input.evidence === "strong"
        ? strongEvidenceOptions({
            prefix: input.name,
            weeklyDistances: input.weeklyDistances,
            elevationGainM: input.elevationGainM,
          })
        : weakEvidenceOptions(),
  };
}

const conformanceScenarios = [
  buildScenario({
    name: "marathon_3day_beginner_relaxed_flat_capped_weak",
    distance: "marathon",
    runDays: 3,
    experience: "beginner",
    evidence: "weak",
    course: "flat",
    mode: "relaxed",
    durationCapped: true,
    currentWeeklyKm: 22,
    longestRunKm: 8,
    terrainAvailable: ["flat"],
    expectations: {
      noIntervals: true,
      warnsForWeakEvidence: true,
    },
  }),
  buildScenario({
    name: "marathon_4day_intermediate_aggressive_hilly_weak",
    distance: "marathon",
    runDays: 4,
    experience: "intermediate",
    evidence: "weak",
    course: "hilly",
    mode: "aggressive",
    currentWeeklyKm: 34,
    longestRunKm: 14,
    thresholdPaceSecPerKm: 325,
    terrainAvailable: ["flat"],
    expectations: {
      hillyMismatchWarning: true,
      noHillRepeats: true,
    },
  }),
  buildScenario({
    name: "marathon_5day_intermediate_moderate_hilly_strong",
    distance: "marathon",
    runDays: 5,
    experience: "intermediate",
    evidence: "strong",
    course: "hilly",
    mode: "moderate",
    currentWeeklyKm: 46,
    longestRunKm: 20,
    thresholdPaceSecPerKm: 310,
    terrainAvailable: ["flat", "hills"],
    weeklyDistances: [40, 42, 44, 46, 48, 50],
    elevationGainM: 320,
    expectations: {
      hillExposure: true,
      mediumLong: true,
    },
  }),
  buildScenario({
    name: "marathon_6day_advanced_aggressive_flat_strong",
    distance: "marathon",
    runDays: 6,
    experience: "advanced",
    evidence: "strong",
    course: "flat",
    mode: "aggressive",
    currentWeeklyKm: 65,
    longestRunKm: 26,
    thresholdPaceSecPerKm: 290,
    targetFinishTimeSec: 12600,
    terrainAvailable: ["track", "flat", "treadmill"],
    weeklyDistances: [58, 60, 62, 64, 66, 68],
    expectations: {
      mediumLong: true,
      raceSpecific: true,
      flatRaceSpecificTerrain: true,
    },
  }),
  buildScenario({
    name: "half_3day_beginner_relaxed_flat_weak",
    distance: "half_marathon",
    runDays: 3,
    experience: "beginner",
    evidence: "weak",
    course: "flat",
    mode: "relaxed",
    currentWeeklyKm: 14,
    longestRunKm: 6,
    terrainAvailable: ["flat"],
    expectations: {
      noIntervals: true,
      warnsForWeakEvidence: true,
    },
  }),
  buildScenario({
    name: "half_4day_intermediate_moderate_flat_strong",
    distance: "half_marathon",
    runDays: 4,
    experience: "intermediate",
    evidence: "strong",
    course: "flat",
    mode: "moderate",
    currentWeeklyKm: 35,
    longestRunKm: 14,
    thresholdPaceSecPerKm: 300,
    terrainAvailable: ["track", "flat"],
    weeklyDistances: [31, 33, 34, 35, 36, 37],
    expectations: {
      hmpWork: true,
      flatRaceSpecificTerrain: true,
    },
  }),
  buildScenario({
    name: "half_5day_intermediate_aggressive_hilly_strong",
    distance: "half_marathon",
    runDays: 5,
    experience: "intermediate",
    evidence: "strong",
    course: "hilly",
    mode: "aggressive",
    currentWeeklyKm: 42,
    longestRunKm: 16,
    thresholdPaceSecPerKm: 292,
    terrainAvailable: ["flat", "hills", "trails"],
    weeklyDistances: [38, 39, 40, 42, 43, 44],
    elevationGainM: 280,
    expectations: {
      hillExposure: true,
      hmpWork: true,
    },
  }),
  buildScenario({
    name: "half_6day_advanced_aggressive_flat_capped_strong",
    distance: "half_marathon",
    runDays: 6,
    experience: "advanced",
    evidence: "strong",
    course: "flat",
    mode: "aggressive",
    durationCapped: true,
    currentWeeklyKm: 52,
    longestRunKm: 19,
    thresholdPaceSecPerKm: 280,
    targetFinishTimeSec: 5700,
    terrainAvailable: ["track", "flat", "treadmill"],
    weeklyDistances: [48, 50, 52, 53, 54, 55],
    expectations: {
      hmpWork: true,
      mediumLong: true,
      flatRaceSpecificTerrain: true,
    },
  }),
];

function summarizePlan(generatedPlan) {
  const { trainingPlan, plannedWorkouts } = generatedPlan;
  const weeklySummaries = trainingPlan.weekly_summaries;
  const nonRaceWeeks = weeklySummaries.filter((week) => !week.is_race_week);
  const peakWeek = nonRaceWeeks.reduce((best, week) =>
    week.volume_km > best.volume_km ? week : best,
  );
  const runWorkouts = plannedWorkouts.filter((workout) => workout.distance_km !== null);
  const publishableRuns = runWorkouts.filter(
    (workout) => workout.structured_workout !== null,
  );
  const totalRunKm = sumSummaryField(nonRaceWeeks, "intensity_total_run_km");
  const titleFamilies = getTitleFamilies(plannedWorkouts);
  const terrainMix = countBy(
    plannedWorkouts
      .filter((workout) => workout.terrain !== null)
      .map((workout) => workout.terrain),
  );

  return {
    totalWeeks: trainingPlan.total_weeks,
    phases: [...new Set(weeklySummaries.map((week) => week.phase))],
    startVolumeKm: nonRaceWeeks[0]?.volume_km ?? 0,
    peakVolumeKm: peakWeek.volume_km,
    peakLongRunKm: Math.max(...nonRaceWeeks.map((week) => week.long_run_km)),
    taperWeeks: weeklySummaries.filter((week) => week.is_taper).length,
    workoutTypes: [...new Set(plannedWorkouts.map((workout) => workout.workout_type))],
    titleFamilies,
    terrainMix,
    warningText: trainingPlan.warnings.join(" "),
    assumptionText: trainingPlan.assumptions.join(" "),
    planEasyShare: ratio(sumSummaryField(nonRaceWeeks, "intensity_easy_km"), totalRunKm),
    planModerateShare: ratio(
      sumSummaryField(nonRaceWeeks, "intensity_moderate_km"),
      totalRunKm,
    ),
    planHardShare: ratio(sumSummaryField(nonRaceWeeks, "intensity_hard_km"), totalRunKm),
    maxWeeklyHardShare: Math.max(
      ...nonRaceWeeks.map((week) => week.intensity_hard_share ?? 0),
    ),
    week2RunCount: plannedWorkouts.filter(
      (workout) => workout.week_number === 2 && workout.distance_km !== null,
    ).length,
    allStructuredRunsExportSafe: publishableRuns.every(
      (workout) =>
        workout.structured_workout.exportSafe === true &&
        workout.structured_workout.exportWarnings.length === 0 &&
        !hasNestedRepeats(workout.structured_workout.steps) &&
        !hasOpenLeafDuration(workout.structured_workout.steps),
    ),
    allRunRowsHavePaceTargets: runWorkouts.every(
      (workout) =>
        workout.target_pace_min_sec_per_km !== null &&
        workout.target_pace_max_sec_per_km !== null,
    ),
    nonRaceWeeks,
    plannedWorkouts,
  };
}

function assertMatrixCoverage(scenarios) {
  assert.deepEqual(
    [...new Set(scenarios.map((scenario) => scenario.distance))].sort(),
    ["half_marathon", "marathon"],
  );
  assert.deepEqual(
    [...new Set(scenarios.map((scenario) => scenario.runDays))].sort(),
    [3, 4, 5, 6],
  );
  assert.deepEqual(
    [...new Set(scenarios.map((scenario) => scenario.experience))].sort(),
    ["advanced", "beginner", "intermediate"],
  );
  assert.deepEqual(
    [...new Set(scenarios.map((scenario) => scenario.evidence))].sort(),
    ["strong", "weak"],
  );
  assert.deepEqual(
    [...new Set(scenarios.map((scenario) => scenario.course))].sort(),
    ["flat", "hilly"],
  );
  assert.ok(scenarios.some((scenario) => scenario.durationCapped));
  assert.ok(scenarios.some((scenario) => scenario.mode === "relaxed"));
  assert.ok(scenarios.some((scenario) => scenario.mode === "aggressive"));
}

function assertPlanConforms(scenario, generatedPlan) {
  const summary = summarizePlan(generatedPlan);

  assert.ok(summary.totalWeeks >= (scenario.distance === "marathon" ? 12 : 10));
  assert.ok(summary.phases.includes("taper"));
  assert.ok(summary.peakVolumeKm >= summary.startVolumeKm);
  assert.ok(summary.peakLongRunKm > 0);
  assert.equal(summary.week2RunCount, scenario.runDays);
  assert.ok(summary.allStructuredRunsExportSafe);
  assert.ok(summary.allRunRowsHavePaceTargets);
  assert.equal(summary.workoutTypes.includes("calibration"), false);
  assert.ok(summary.workoutTypes.every((type) => allowedWorkoutTypes.has(type)));
  assertIntensityDistribution(scenario, summary);
  assertWeeklyCapsAndLoadRisk(summary);
  assertWeeklyLayoutSafety(summary.plannedWorkouts, generatedPlan.trainingPlan.total_weeks);

  if (scenario.durationCapped) {
    assertDurationCaps(summary.plannedWorkouts, scenario.raceGoal.race_date);
  }

  if (scenario.expectations.noIntervals) {
    assert.equal(summary.workoutTypes.includes("interval"), false);
  }

  if (scenario.expectations.warnsForWeakEvidence) {
    assert.match(
      `${summary.warningText} ${summary.assumptionText}`,
      /fallback|missing|low|incomplete/i,
    );
  }

  if (scenario.expectations.hillyMismatchWarning) {
    assert.match(summary.warningText, /hilly|hill access|elevation/i);
  }

  if (scenario.expectations.noHillRepeats) {
    assert.equal(summary.titleFamilies.hill_repeat ?? 0, 0);
  }

  if (scenario.expectations.hillExposure) {
    assert.ok(
      (summary.titleFamilies.hill_repeat ?? 0) + (summary.titleFamilies.hill_stride ?? 0) > 0,
    );
  }

  if (scenario.expectations.mediumLong) {
    assert.ok((summary.titleFamilies.medium_long ?? 0) > 0);
  }

  if (scenario.expectations.raceSpecific) {
    assert.ok((summary.titleFamilies.race_specific ?? 0) > 0);
  }

  if (scenario.expectations.hmpWork) {
    assert.ok((summary.titleFamilies.hmp ?? 0) > 0);
  }

  if (scenario.expectations.flatRaceSpecificTerrain) {
    const raceSpecificWorkouts = summary.plannedWorkouts.filter(
      (workout) =>
        workout.workout_type === "marathon_pace" ||
        workout.title.toLowerCase().includes("race-pace") ||
        workout.title.toLowerCase().includes("half-marathon pace"),
    );

    assert.ok(raceSpecificWorkouts.length > 0);
    assert.ok(
      raceSpecificWorkouts.every((workout) =>
        ["track", "flat", "treadmill"].includes(workout.terrain),
      ),
    );
  }
}

function assertIntensityDistribution(scenario, summary) {
  const targets = {
    relaxed: { easyMin: 0.84, hardMax: 0.06 },
    moderate: { easyMin: 0.78, hardMax: 0.09 },
    aggressive: { easyMin: 0.72, hardMax: 0.12 },
    very_aggressive: { easyMin: 0.68, hardMax: 0.12 },
  }[scenario.mode];

  assert.ok(
    summary.planEasyShare >= targets.easyMin,
    `${scenario.name} easy share ${summary.planEasyShare} below ${targets.easyMin}`,
  );
  assert.ok(
    summary.planHardShare <= targets.hardMax,
    `${scenario.name} hard share ${summary.planHardShare} above ${targets.hardMax}`,
  );
  assert.ok(summary.planModerateShare <= 0.22);
  assert.ok(summary.maxWeeklyHardShare <= 0.13);
}

function assertWeeklyCapsAndLoadRisk(summary) {
  for (const week of summary.nonRaceWeeks) {
    assert.ok(week.intensity_threshold_km <= week.threshold_cap_km + 0.2);
    assert.ok(week.intensity_vo2_km <= week.vo2_cap_km + 0.2);
    assert.ok(week.intensity_repetition_km <= week.repetition_cap_km + 0.2);
    assert.deepEqual(week.load_risk_flags, []);
  }

  for (let index = 1; index < summary.nonRaceWeeks.length; index += 1) {
    const previousWeek = summary.nonRaceWeeks[index - 1];
    const currentWeek = summary.nonRaceWeeks[index];
    const currentTitles = summary.plannedWorkouts
      .filter((workout) => workout.week_number === currentWeek.week_number)
      .map((workout) => `${workout.day_label}:${workout.title}`)
      .join(", ");

    if (
      previousWeek.is_cutback ||
      currentWeek.is_cutback ||
      currentWeek.is_taper ||
      currentWeek.is_race_week
    ) {
      continue;
    }

    const majorLoadJumps = countMajorLoadJumps(previousWeek, currentWeek);

    assert.ok(
      majorLoadJumps < 3,
      [
        `week ${currentWeek.week_number} stacked ${majorLoadJumps} load jumps`,
        `previous volume/long/mod+hard/hill: ${previousWeek.volume_km}/${previousWeek.long_run_km}/${(previousWeek.intensity_moderate_km ?? 0) + (previousWeek.intensity_hard_km ?? 0)}/${previousWeek.hill_load_km ?? 0}`,
        `current volume/long/mod+hard/hill: ${currentWeek.volume_km}/${currentWeek.long_run_km}/${(currentWeek.intensity_moderate_km ?? 0) + (currentWeek.intensity_hard_km ?? 0)}/${currentWeek.hill_load_km ?? 0}`,
        `current workouts: ${currentTitles}`,
      ].join("; "),
    );
  }
}

function assertWeeklyLayoutSafety(plannedWorkouts, totalWeeks) {
  for (let index = 1; index < plannedWorkouts.length; index += 1) {
    assert.ok(
      !(isHardWorkout(plannedWorkouts[index - 1]) && isHardWorkout(plannedWorkouts[index])),
    );
  }

  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
    const weekWorkouts = plannedWorkouts.filter(
      (workout) => workout.week_number === weekNumber,
    );
    const longRun = weekWorkouts.find((workout) => workout.workout_type === "long_run");
    const intervalWorkout = weekWorkouts.find(
      (workout) => workout.workout_type === "interval",
    );

    if (!longRun || !intervalWorkout) {
      continue;
    }

    const gapDays =
      (new Date(`${longRun.workout_date}T00:00:00`).getTime() -
        new Date(`${intervalWorkout.workout_date}T00:00:00`).getTime()) /
      (1000 * 60 * 60 * 24);

    assert.ok(gapDays > 2 || gapDays < 0);
  }
}

function assertDurationCaps(plannedWorkouts, raceDate) {
  const cappedRuns = plannedWorkouts.filter(
    (workout) => workout.distance_km !== null && workout.workout_date !== raceDate,
  );

  for (const workout of cappedRuns) {
    const cap = workout.day_label === "saturday" || workout.day_label === "sunday" ? 75 : 45;

    assert.ok(
      workout.duration_min <= cap,
      `${workout.workout_date} ${workout.title} exceeded ${cap} minutes`,
    );
  }
}

function getTitleFamilies(workouts) {
  return countBy(workouts.map((workout) => getTitleFamily(workout.title)));
}

function getTitleFamily(title) {
  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle.includes("hill repeat")) {
    return "hill_repeat";
  }

  if (normalizedTitle.includes("hill strides")) {
    return "hill_stride";
  }

  if (normalizedTitle.includes("half-marathon pace")) {
    return "hmp";
  }

  if (
    normalizedTitle.includes("race-pace") ||
    normalizedTitle.includes("marathon-pace")
  ) {
    return "race_specific";
  }

  if (
    normalizedTitle.includes("tempo") ||
    normalizedTitle.includes("cruise")
  ) {
    return "threshold";
  }

  if (normalizedTitle.includes("vo2")) {
    return "vo2";
  }

  if (normalizedTitle.includes("fartlek")) {
    return "fartlek";
  }

  if (normalizedTitle.includes("medium-long")) {
    return "medium_long";
  }

  if (normalizedTitle.includes("strides")) {
    return "strides";
  }

  if (normalizedTitle.includes("long")) {
    return "long";
  }

  if (normalizedTitle.includes("recovery")) {
    return "recovery";
  }

  if (normalizedTitle.includes("rest")) {
    return "rest";
  }

  return "easy";
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function sumSummaryField(weeks, fieldName) {
  return weeks.reduce((total, week) => total + (week[fieldName] ?? 0), 0);
}

function ratio(part, total) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((part / total) * 1000) / 1000;
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

describe("plan generator spec conformance matrix", () => {
  it("covers the required scenario dimensions", () => {
    assertMatrixCoverage(conformanceScenarios);
  });

  for (const scenario of conformanceScenarios) {
    it(`conforms for ${scenario.name}`, () => {
      const generatedPlan = generateTrainingPlan(scenario.profile, scenario.raceGoal, {
        startDate: "2030-05-06",
        ...scenario.options,
      });

      assertPlanConforms(scenario, generatedPlan);
    });
  }

  it("does not treat a fast easy Strava activity as a max anchor in the full generator path", () => {
    const generatedPlan = generateTrainingPlan(
      makeProfile({
        threshold_pace_sec_per_km: null,
        current_weekly_mileage_km: 36,
        longest_recent_run_km: 15,
        available_training_days: trainingDaysByCount[4],
        running_days_per_week: 4,
      }),
      makeRaceGoal({
        target_finish_time_sec: 12600,
        target_priority: "aggressive",
        race_priority: "A",
        goal_flexibility: "fixed",
      }),
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([34, 35, 36, 37, 38, 39]),
        recentHistoryWorkouts: [
          makeLoggedWorkout({
            id: "fast-easy",
            source: "strava",
            source_activity_id: "fast-easy",
            distance_km: 10,
            avg_pace_sec_per_km: 300,
          }),
        ],
        stravaActivityEvidence: [
          makeStravaEvidence({
            stravaActivityId: "fast-easy",
            classificationHint: "easy_non_limit",
            effortSignals: ["Strava detail/stream evidence does not support a max anchor"],
          }),
        ],
      },
    );

    assert.match(
      generatedPlan.trainingPlan.assumptions.join(" "),
      /fastest recent run is not treated as a fitness limit/i,
    );
    assert.notEqual(generatedPlan.trainingPlan.fitness_confidence, "high");
  });

  it("returns a suggested replacement goal for clearly not-credible targets", () => {
    const suggestion = evaluatePlanGoalAdjustment(
      makeProfile({
        threshold_pace_sec_per_km: null,
        easy_pace_sec_per_km: 390,
        current_weekly_mileage_km: 18,
        longest_recent_run_km: 7,
        available_training_days: trainingDaysByCount[3],
        running_days_per_week: 3,
        running_experience_level: "beginner",
      }),
      makeRaceGoal({
        target_finish_time_sec: 9000,
        target_priority: "aggressive",
        race_priority: "A",
        goal_flexibility: "fixed",
      }),
      {
        startDate: "2030-05-06",
        recentHistory: makeRecentHistory([14, 15, 16, 17, 18, 19], {
          longestRuns: [5, 5, 6, 6, 7, 7],
        }),
      },
    );

    assert.ok(suggestion);
    assert.ok(
      ["realistic", "ambitious", "very_ambitious"].includes(
        suggestion.feasibilityRating,
      ),
    );
    assert.ok(suggestion.suggestedTargetFinishTimeSec > suggestion.originalTargetFinishTimeSec);
    assert.ok(suggestion.currentEstimatedFinishTimeSec > suggestion.originalTargetFinishTimeSec);
    assert.match(suggestion.reason, /original target is not supported/i);
  });
});
