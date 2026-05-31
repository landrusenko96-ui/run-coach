import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeTrainingEvidence } from "../lib/training/trainingEvidence.ts";

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
  longest_recent_run_km: 16,
  easy_pace_sec_per_km: 360,
  threshold_pace_sec_per_km: null,
  max_heart_rate: 190,
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

function makeWeeks(weeklyDistances, options = {}) {
  return weeklyDistances.map((distanceKm, index) => {
    const runCount = options.runCounts?.[index] ?? (distanceKm > 0 ? 3 : 0);
    const longestRunKm =
      options.longestRuns?.[index] ?? (distanceKm > 0 ? distanceKm * 0.4 : null);

    return {
      week_start_date: `2030-03-${String(1 + index * 7).padStart(2, "0")}`,
      week_end_date: `2030-03-${String(7 + index * 7).padStart(2, "0")}`,
      distance_km: distanceKm,
      duration_sec: distanceKm > 0 ? Math.round(distanceKm * 360) : null,
      run_count: runCount,
      longest_run_km: longestRunKm,
      longest_run_duration_sec:
        longestRunKm !== null ? Math.round(longestRunKm * 390) : null,
      source: options.source ?? "mixed",
    };
  });
}

function makeWorkout(overrides = {}) {
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
    activityDate: overrides.activityDate ?? "2030-03-01",
    distanceKm: overrides.distanceKm ?? 8,
    durationSec: overrides.durationSec ?? 2880,
    avgPaceSecPerKm: overrides.avgPaceSecPerKm ?? 360,
    averageHeartRate: overrides.averageHeartRate ?? null,
    maxHeartRate: overrides.maxHeartRate ?? null,
    averagePowerWatts: overrides.averagePowerWatts ?? null,
    weightedAveragePowerWatts: overrides.weightedAveragePowerWatts ?? null,
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

describe("training evidence analyzer", () => {
  it("computes six-week load metrics and recent ramp from weekly summaries", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile(),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 3,
      recentHistory: makeWeeks([20, 30, 40, 50, 60, 70]),
      recentHistoryWorkouts: [],
    });

    assert.equal(evidence.avgKm6w, 45);
    assert.equal(evidence.medianKm6w, 45);
    assert.equal(evidence.maxWeekKm6w, 70);
    assert.equal(evidence.avgTimeMin6w, 270);
    assert.equal(evidence.runsPerWeek6w, 3);
    assert.equal(evidence.completedWeeks6w, 6);
    assert.equal(evidence.loadConsistency, 1);
    assert.equal(evidence.recentRamp, 1.86);
  });

  it("calculates consistency as completed weeks divided by six", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile(),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 3,
      recentHistory: makeWeeks([20, 0, 30, 0, 40, 50]),
      recentHistoryWorkouts: [],
    });

    assert.equal(evidence.completedWeeks6w, 4);
    assert.equal(evidence.loadConsistency, 0.67);
    assert.ok(
      evidence.warnings.some((warning) => warning.includes("empty weeks")),
    );
  });

  it("warns when recent longest run dominates weekly volume", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile(),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 3,
      recentHistory: makeWeeks([20, 24, 26, 28, 30, 32], {
        longestRuns: [15, 10, 11, 12, 12, 13],
      }),
      recentHistoryWorkouts: [],
    });

    assert.equal(evidence.maxLongRunShare6w, 0.75);
    assert.ok(
      evidence.warnings.some((warning) => warning.includes("long-run share")),
    );
  });

  it("computes HR availability, elevation tolerance, and durability metrics", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile({ threshold_pace_sec_per_km: 315 }),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 3,
      recentHistory: makeWeeks([34, 36, 38, 40, 42, 44]),
      recentHistoryWorkouts: [
        makeWorkout({ id: "hr-1", avg_heart_rate: 140, elevation_gain_m: 300 }),
        makeWorkout({ id: "hr-2", avg_heart_rate: 142, elevation_gain_m: 300 }),
        makeWorkout({ id: "hr-3", avg_heart_rate: 144, elevation_gain_m: 300 }),
        makeWorkout({ id: "hr-4", avg_heart_rate: 146, elevation_gain_m: 300 }),
      ],
    });

    assert.equal(evidence.hrDataAvailability, "most");
    assert.equal(evidence.elevationGainAvgMPerWeek, 200);
    assert.equal(evidence.elevationTolerance, "moderate");
    assert.ok(evidence.longestRunToGoalDistanceRatio > 0.3);
    assert.equal(evidence.fitnessConfidence, "high");
  });

  it("classifies easy, controlled, hard, near-max, and race/time-trial workouts", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile(),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({ id: "easy", avg_pace_sec_per_km: 370, rpe: 2 }),
        makeWorkout({ id: "controlled", avg_pace_sec_per_km: 340, rpe: 5 }),
        makeWorkout({ id: "hard", avg_pace_sec_per_km: 325, rpe: 7, notes: "tempo workout" }),
        makeWorkout({ id: "max", avg_pace_sec_per_km: 305, rpe: 9, notes: "all out effort" }),
        makeWorkout({ id: "race", avg_pace_sec_per_km: 300, rpe: 9, notes: "race effort" }),
      ],
    });
    const qualityById = new Map(
      evidence.effortClassifications.map((classification) => [
        classification.loggedWorkoutId,
        classification.quality,
      ]),
    );

    assert.equal(qualityById.get("easy"), "easy_non_limit");
    assert.equal(qualityById.get("controlled"), "controlled");
    assert.equal(qualityById.get("hard"), "hard_workout");
    assert.equal(qualityById.get("max"), "possible_near_max");
    assert.equal(qualityById.get("race"), "race_time_trial");
    assert.equal(evidence.possibleNearMaxCount6w, 2);
    assert.equal(evidence.raceTimeTrialCount6w, 1);
    assert.equal(evidence.thresholdEstimateSource, "race_time_trial");
    assert.equal(evidence.fastestRunUsedAsFitnessAnchor, true);
  });

  it("uses saved heart-rate zones before max-HR fallback", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile({
        max_heart_rate: 200,
        user_hr_zones: [
          { zone: 1, name: "Zone 1", lower_bpm: 100, upper_bpm: 120, source: "manual", updated_at: null },
          { zone: 2, name: "Zone 2", lower_bpm: 121, upper_bpm: 140, source: "manual", updated_at: null },
          { zone: 3, name: "Zone 3", lower_bpm: 141, upper_bpm: 150, source: "manual", updated_at: null },
          { zone: 4, name: "Zone 4", lower_bpm: 151, upper_bpm: 165, source: "manual", updated_at: null },
          { zone: 5, name: "Zone 5", lower_bpm: 166, upper_bpm: 190, source: "manual", updated_at: null },
        ],
      }),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({ id: "zone-hard", avg_heart_rate: 155, avg_pace_sec_per_km: 350 }),
      ],
    });
    const classification = evidence.effortClassifications.find(
      (item) => item.loggedWorkoutId === "zone-hard",
    );

    assert.equal(classification?.quality, "hard_workout");
    assert.ok(
      classification?.evidence.some((item) => item.includes("personal HR zone 4")),
    );
  });

  it("uses lactate-threshold HR and HR reserve for effort classification", () => {
    const lthrEvidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile({
        max_heart_rate: null,
        lactate_threshold_heart_rate: 170,
      }),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({ id: "lthr-hard", avg_heart_rate: 165, avg_pace_sec_per_km: 350 }),
      ],
    });
    const reserveEvidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile({
        max_heart_rate: 190,
        resting_heart_rate: 50,
      }),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({ id: "reserve-hard", avg_heart_rate: 166, avg_pace_sec_per_km: 350 }),
      ],
    });

    assert.equal(lthrEvidence.effortClassifications[0].quality, "hard_workout");
    assert.ok(
      lthrEvidence.effortClassifications[0].evidence.some((item) =>
        item.includes("LT HR"),
      ),
    );
    assert.equal(reserveEvidence.effortClassifications[0].quality, "hard_workout");
    assert.ok(
      reserveEvidence.effortClassifications[0].evidence.some((item) =>
        item.includes("HR reserve"),
      ),
    );
  });

  it("uses aerobic-threshold HR and Strava power as supporting effort signals", () => {
    const aerobicEvidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile({
        max_heart_rate: null,
        aerobic_threshold_heart_rate: 145,
      }),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({ id: "aet-controlled", avg_heart_rate: 146 }),
      ],
    });
    const powerEvidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile({
        max_heart_rate: null,
        threshold_power_watts: 250,
      }),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({
          id: "power-hard",
          source: "strava",
          source_activity_id: "activity-power",
        }),
      ],
      stravaActivityEvidence: [
        makeStravaEvidence({
          stravaActivityId: "activity-power",
          hasPowerStream: true,
          averagePowerWatts: 230,
          weightedAveragePowerWatts: 230,
        }),
      ],
    });

    assert.equal(aerobicEvidence.effortClassifications[0].quality, "controlled");
    assert.equal(powerEvidence.effortClassifications[0].quality, "hard_workout");
    assert.ok(
      powerEvidence.effortClassifications[0].evidence.some((item) =>
        item.includes("threshold power"),
      ),
    );
  });

  it("does not use the fastest recent run as a max anchor without effort evidence", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile(),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({ id: "fast", avg_pace_sec_per_km: 300, rpe: null, notes: null }),
        makeWorkout({ id: "easy", avg_pace_sec_per_km: 365, rpe: 2 }),
      ],
    });

    assert.equal(evidence.fastestPaceSecPerKm, 300);
    assert.equal(evidence.fastestRunUsedAsFitnessAnchor, false);
    assert.equal(evidence.thresholdEstimateSource, "easy_pace_estimate");
    assert.ok(
      evidence.assumptions.some((assumption) =>
        assumption.includes("fastest recent run is not treated as a fitness limit"),
      ),
    );
  });

  it("uses Strava easy evidence to avoid treating a fast summary-only run as a limit", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile(),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({
          id: "fast",
          source: "strava",
          source_activity_id: "activity-fast",
          avg_pace_sec_per_km: 300,
          rpe: null,
          notes: null,
        }),
      ],
      stravaActivityEvidence: [
        makeStravaEvidence({
          stravaActivityId: "activity-fast",
          classificationHint: "easy_non_limit",
          effortSignals: ["Strava detail/stream evidence available"],
        }),
      ],
    });
    const fastClassification = evidence.effortClassifications.find(
      (classification) => classification.loggedWorkoutId === "fast",
    );

    assert.equal(fastClassification?.quality, "easy_non_limit");
    assert.equal(evidence.fastestRunUsedAsFitnessAnchor, false);
    assert.equal(evidence.thresholdEstimateSource, "easy_pace_estimate");
  });

  it("uses Strava PR/race-like evidence as a cautious near-max anchor", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile(),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({
          id: "race",
          source: "strava",
          source_activity_id: "activity-race",
          avg_pace_sec_per_km: 300,
          rpe: null,
          notes: null,
        }),
      ],
      stravaActivityEvidence: [
        makeStravaEvidence({
          stravaActivityId: "activity-race",
          hasHeartRateStream: true,
          hasPowerStream: true,
          prCount: 1,
          perceivedExertion: 9,
          classificationHint: "possible_near_max",
          effortSignals: [
            "Strava PR/best-effort signal",
            "heart-rate stream available",
            "run power evidence available",
          ],
        }),
      ],
    });

    assert.equal(evidence.thresholdEstimateSource, "near_max_effort");
    assert.equal(evidence.fastestRunUsedAsFitnessAnchor, true);
    assert.equal(evidence.fitnessConfidence, "high");
    assert.equal(evidence.hrDataAvailability, "most");
    assert.equal(evidence.powerDataAvailability, "most");
  });

  it("uses Strava HR, power, and elevation evidence as support when logged fields are sparse", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile(),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({
          id: "strava-1",
          source: "strava",
          source_activity_id: "activity-1",
          avg_pace_sec_per_km: 370,
          avg_heart_rate: null,
          max_heart_rate: null,
          elevation_gain_m: null,
        }),
        makeWorkout({
          id: "strava-2",
          source: "strava",
          source_activity_id: "activity-2",
          avg_pace_sec_per_km: 365,
          avg_heart_rate: null,
          max_heart_rate: null,
          elevation_gain_m: null,
        }),
      ],
      stravaActivityEvidence: [
        makeStravaEvidence({
          stravaActivityId: "activity-1",
          hasHeartRateStream: true,
          hasPowerStream: true,
          elevationGainM: 400,
          classificationHint: "easy_non_limit",
        }),
        makeStravaEvidence({
          stravaActivityId: "activity-2",
          hasHeartRateStream: true,
          hasPowerStream: true,
          elevationGainM: 500,
          classificationHint: "easy_non_limit",
        }),
      ],
    });

    assert.equal(evidence.hrDataAvailability, "most");
    assert.equal(evidence.powerDataAvailability, "most");
    assert.equal(evidence.elevationGainAvgMPerWeek, 150);
    assert.equal(evidence.fitnessConfidence, "medium");
    assert.ok(
      evidence.assumptions.some((assumption) =>
        assumption.includes("Strava detail/stream evidence was available"),
      ),
    );
  });

  it("uses Strava stream evidence attached to a merged app log", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile(),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({
          id: "merged-app-log",
          source: "manual",
          source_activity_id: "activity-merged",
          avg_pace_sec_per_km: 370,
          avg_heart_rate: null,
          max_heart_rate: null,
          elevation_gain_m: null,
        }),
      ],
      stravaActivityEvidence: [
        makeStravaEvidence({
          stravaActivityId: "activity-merged",
          hasHeartRateStream: true,
          hasPowerStream: true,
          paceFadePercent: 8,
          heartRateDriftPercent: 7,
          elevationGainM: 600,
          classificationHint: "easy_non_limit",
        }),
      ],
    });

    assert.equal(evidence.hrDataAvailability, "most");
    assert.equal(evidence.powerDataAvailability, "most");
    assert.equal(evidence.elevationGainAvgMPerWeek, 100);
    assert.equal(evidence.paceFadeAvgPercent, 8);
    assert.equal(evidence.heartRateDriftAvgPercent, 7);
  });

  it("uses Strava pace fade, negative splits, and HR drift as durability evidence", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile(),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 4,
      recentHistory: makeWeeks([35, 36, 37, 38, 39, 40]),
      recentHistoryWorkouts: [
        makeWorkout({
          id: "fade-1",
          source: "strava",
          source_activity_id: "activity-fade-1",
          avg_pace_sec_per_km: 370,
        }),
        makeWorkout({
          id: "fade-2",
          source: "strava",
          source_activity_id: "activity-fade-2",
          avg_pace_sec_per_km: 365,
        }),
      ],
      stravaActivityEvidence: [
        makeStravaEvidence({
          stravaActivityId: "activity-fade-1",
          hasHeartRateStream: true,
          paceFadePercent: 8,
          heartRateDriftPercent: 7,
          classificationHint: "easy_non_limit",
        }),
        makeStravaEvidence({
          stravaActivityId: "activity-fade-2",
          hasHeartRateStream: true,
          paceFadePercent: -2,
          heartRateDriftPercent: 3,
          negativeSplit: true,
          classificationHint: "easy_non_limit",
        }),
      ],
    });

    assert.equal(evidence.paceFadeAvgPercent, 3);
    assert.equal(evidence.heartRateDriftAvgPercent, 5);
    assert.equal(evidence.negativeSplitCount6w, 1);
    assert.equal(evidence.durabilityTrend, "caution");
    assert.ok(
      evidence.assumptions.some((assumption) =>
        assumption.includes("negative-split evidence"),
      ),
    );
  });

  it("keeps durability trend unknown when stream/detail durability data is missing", () => {
    const evidence = analyzeTrainingEvidence({
      runnerProfile: makeProfile({
        current_weekly_mileage_km: null,
        longest_recent_run_km: null,
      }),
      raceGoal: makeRaceGoal(),
      selectedRunningDaysPerWeek: 3,
      recentHistory: [],
      recentHistoryWorkouts: [],
    });

    assert.equal(evidence.paceFadeAvgPercent, null);
    assert.equal(evidence.heartRateDriftAvgPercent, null);
    assert.equal(evidence.negativeSplitCount6w, 0);
    assert.equal(evidence.durabilityTrend, "unknown");
  });
});
