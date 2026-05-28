import type {
  LoggedWorkout,
  RaceDistance,
  RaceGoal,
  RecentTrainingWeekInput,
  RunnerProfile,
} from "../../types/training.ts";

export type EffortQuality =
  | "easy_non_limit"
  | "controlled"
  | "hard_workout"
  | "possible_near_max";

export type TrainingEvidenceConfidence = "low" | "medium" | "high";

export type TrainingHistorySource =
  | "assembled_six_week_history"
  | "manual_six_week_history"
  | "self_reported_profile"
  | "fallback_estimate";

export type LongRunDurationCategory =
  | "short"
  | "moderate"
  | "long"
  | "very_long"
  | "unknown";

export type HeartRateDataAvailability = "none" | "some" | "most";

export type ElevationTolerance = "unknown" | "low" | "moderate" | "high";

export type ThresholdEstimateSource =
  | "saved_threshold"
  | "near_max_effort"
  | "hard_workout"
  | "easy_pace_estimate"
  | "missing";

export type WorkoutEffortClassification = {
  loggedWorkoutId: string;
  workoutDate: string;
  quality: EffortQuality;
  evidence: string[];
  paceSecPerKm: number | null;
};

export type TrainingEvidence = {
  avgKm6w: number;
  avgTimeMin6w: number | null;
  medianKm6w: number;
  maxWeekKm6w: number;
  minNonzeroWeekKm6w: number;
  runsPerWeek6w: number;
  completedWeeks6w: number;
  loadConsistency: number;
  recentRamp: number;
  longestRunKm6w: number;
  longestRunDurationMin6w: number | null;
  maxLongRunShare6w: number | null;
  longestRunToGoalDistanceRatio: number;
  longestRunToWeeklyVolumeRatio: number;
  longRunDurationCategory: LongRunDurationCategory;
  hrDataAvailability: HeartRateDataAvailability;
  elevationGainAvgMPerWeek: number | null;
  elevationTolerance: ElevationTolerance;
  effortClassifications: WorkoutEffortClassification[];
  hardWorkoutCount6w: number;
  possibleNearMaxCount6w: number;
  fastestPaceSecPerKm: number | null;
  fastestRunUsedAsFitnessAnchor: boolean;
  thresholdEstimateSecPerKm: number | null;
  thresholdEstimateSource: ThresholdEstimateSource;
  fitnessConfidence: TrainingEvidenceConfidence;
  assumptions: string[];
  warnings: string[];
  source: TrainingHistorySource;
};

type AnalyzeTrainingEvidenceInput = {
  runnerProfile: RunnerProfile;
  raceGoal: RaceGoal;
  selectedRunningDaysPerWeek: number;
  recentHistory?: RecentTrainingWeekInput[];
  recentHistoryWorkouts?: LoggedWorkout[];
};

const distanceKmByRace: Record<RaceDistance, number> = {
  marathon: 42.2,
  half_marathon: 21.1,
};

export function analyzeTrainingEvidence(
  input: AnalyzeTrainingEvidenceInput,
): TrainingEvidence {
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const sixWeekHistory = getSixWeekHistory(input.recentHistory);
  const historyMetrics = sixWeekHistory
    ? buildHistoryMetricsFromWeeks(sixWeekHistory)
    : buildFallbackHistoryMetrics(input, assumptions, warnings);
  const filteredWorkouts = filterUsableRecentRunWorkouts(
    input.recentHistoryWorkouts ?? [],
  );
  const effortClassifications = filteredWorkouts.map((workout) =>
    classifyWorkoutEffort(workout, input.runnerProfile),
  );
  const durabilityMetrics = buildDurabilityMetrics({
    historyMetrics,
    raceDistance: input.raceGoal.distance,
    workouts: filteredWorkouts,
  });
  const thresholdEstimate = estimateThresholdPace({
    runnerProfile: input.runnerProfile,
    effortClassifications,
    workouts: filteredWorkouts,
  });
  const fitnessConfidence = getFitnessConfidence({
    runnerProfile: input.runnerProfile,
    historySource: historyMetrics.source,
    completedWeeks6w: historyMetrics.completedWeeks6w,
    hrDataAvailability: durabilityMetrics.hrDataAvailability,
    thresholdEstimateSource: thresholdEstimate.source,
  });
  const hardWorkoutCount6w = effortClassifications.filter(
    (classification) =>
      classification.quality === "hard_workout" ||
      classification.quality === "possible_near_max",
  ).length;
  const possibleNearMaxCount6w = effortClassifications.filter(
    (classification) => classification.quality === "possible_near_max",
  ).length;
  const fastestWorkout = getFastestWorkout(filteredWorkouts);
  const fastestClassification = fastestWorkout
    ? effortClassifications.find(
        (classification) => classification.loggedWorkoutId === fastestWorkout.id,
      ) ?? null
    : null;
  const fastestRunUsedAsFitnessAnchor =
    fastestClassification?.quality === "possible_near_max" &&
    thresholdEstimate.anchorWorkoutId === fastestWorkout?.id;

  addHistoryAssumptions(historyMetrics.source, assumptions);
  addEvidenceMessages({
    runnerProfile: input.runnerProfile,
    raceGoal: input.raceGoal,
    historyMetrics,
    durabilityMetrics,
    thresholdEstimateSource: thresholdEstimate.source,
    fitnessConfidence,
    fastestWorkout,
    fastestRunUsedAsFitnessAnchor,
    assumptions,
    warnings,
  });

  return {
    ...historyMetrics,
    ...durabilityMetrics,
    effortClassifications,
    hardWorkoutCount6w,
    possibleNearMaxCount6w,
    fastestPaceSecPerKm: fastestWorkout?.avg_pace_sec_per_km ?? null,
    fastestRunUsedAsFitnessAnchor,
    thresholdEstimateSecPerKm: thresholdEstimate.secPerKm,
    thresholdEstimateSource: thresholdEstimate.source,
    fitnessConfidence,
    assumptions,
    warnings,
  };
}

function getSixWeekHistory(
  weeks: RecentTrainingWeekInput[] | undefined,
): RecentTrainingWeekInput[] | null {
  if (
    !weeks ||
    weeks.length !== 6 ||
    weeks.every((week) => week.run_count <= 0 && week.distance_km <= 0)
  ) {
    return null;
  }

  return weeks;
}

function buildHistoryMetricsFromWeeks(weeks: RecentTrainingWeekInput[]) {
  const distances = weeks.map((week) => Math.max(0, week.distance_km));
  const totalDistanceKm = distances.reduce((total, distance) => total + distance, 0);
  const durations = weeks.map((week) => week.duration_sec ?? 0);
  const totalDurationSec = durations.reduce((total, duration) => total + duration, 0);
  const longestRunKm6w = Math.max(
    ...weeks.map((week) => week.longest_run_km ?? 0),
    ...distances.map((distance) => distance * 0.4),
  );
  const longestRunDurationSec = Math.max(
    ...weeks.map((week) => week.longest_run_duration_sec ?? 0),
  );
  const avgKm6w = roundDistance(totalDistanceKm / 6);
  const sortedDistances = [...distances].sort((a, b) => a - b);
  const maxWeekKm6w = Math.max(...distances);
  const nonzeroDistances = distances.filter((distance) => distance > 0);
  const minNonzeroWeekKm6w =
    nonzeroDistances.length > 0 ? Math.min(...nonzeroDistances) : avgKm6w;
  const firstFourWeekAvg =
    distances.slice(0, 4).reduce((total, distance) => total + distance, 0) / 4;
  const lastTwoWeekAvg = (distances[4] + distances[5]) / 2;
  const completedWeeks6w = weeks.filter((week) => week.run_count > 0).length;
  const maxLongRunShare6w = getMaxLongRunShare(weeks);
  const source: TrainingHistorySource = weeks.every((week) => week.source === "manual")
    ? "manual_six_week_history"
    : "assembled_six_week_history";

  return {
    avgKm6w,
    avgTimeMin6w:
      totalDurationSec > 0 ? Math.round(totalDurationSec / 6 / 60) : null,
    medianKm6w: roundDistance((sortedDistances[2] + sortedDistances[3]) / 2),
    maxWeekKm6w: roundDistance(maxWeekKm6w),
    minNonzeroWeekKm6w: roundDistance(minNonzeroWeekKm6w),
    runsPerWeek6w: roundToTenth(
      weeks.reduce((total, week) => total + week.run_count, 0) / 6,
    ),
    completedWeeks6w,
    loadConsistency: roundToHundredth(completedWeeks6w / 6),
    recentRamp:
      firstFourWeekAvg > 0
        ? roundToHundredth(clamp(lastTwoWeekAvg / firstFourWeekAvg, 0.4, 2.5))
        : lastTwoWeekAvg > 0
          ? 2.5
          : 1,
    longestRunKm6w: roundDistance(longestRunKm6w),
    longestRunDurationMin6w:
      longestRunDurationSec > 0 ? Math.round(longestRunDurationSec / 60) : null,
    maxLongRunShare6w,
    source,
  };
}

function buildFallbackHistoryMetrics(
  input: AnalyzeTrainingEvidenceInput,
  assumptions: string[],
  warnings: string[],
) {
  const fallbackWeeklyKm = input.raceGoal.distance === "marathon" ? 24 : 16;
  const currentWeeklyKm = input.runnerProfile.current_weekly_mileage_km;
  const hasCurrentMileage = currentWeeklyKm !== null && currentWeeklyKm > 0;
  const avgKm6w = hasCurrentMileage ? currentWeeklyKm : fallbackWeeklyKm;
  const easyPace = input.runnerProfile.easy_pace_sec_per_km ?? 390;
  const longestRunFallback = roundDistance(
    clamp(avgKm6w * 0.32, input.raceGoal.distance === "marathon" ? 8 : 5, avgKm6w * 0.45),
  );
  const hasLongestRun =
    input.runnerProfile.longest_recent_run_km !== null &&
    input.runnerProfile.longest_recent_run_km > 0;
  const longestRunKm6w = hasLongestRun
    ? input.runnerProfile.longest_recent_run_km ?? longestRunFallback
    : longestRunFallback;

  if (input.recentHistory && input.recentHistory.length > 0) {
    warnings.push(
      "Six-week history is incomplete, so generation falls back to profile mileage and longest-run fields.",
    );
  }

  if (!hasCurrentMileage) {
    assumptions.push(
      `Current weekly mileage is missing, so the generator uses ${fallbackWeeklyKm} km/week as a temporary ${formatRaceDistance(input.raceGoal.distance)} baseline.`,
    );
    warnings.push(
      "Current weekly mileage is missing, so load, feasibility, and progression confidence are low.",
    );
  }

  if (!hasLongestRun) {
    assumptions.push(
      `Longest recent run is missing, so the generator estimates ${longestRunFallback} km from current weekly mileage.`,
    );
    warnings.push(
      "Longest recent run is missing, so long-run progression is estimated conservatively.",
    );
  }

  return {
    avgKm6w,
    avgTimeMin6w: Math.round((avgKm6w * easyPace) / 60),
    medianKm6w: avgKm6w,
    maxWeekKm6w: avgKm6w,
    minNonzeroWeekKm6w: avgKm6w,
    runsPerWeek6w: input.selectedRunningDaysPerWeek,
    completedWeeks6w: hasCurrentMileage ? 6 : 3,
    loadConsistency: hasCurrentMileage ? 1 : 0.5,
    recentRamp: 1,
    longestRunKm6w,
    longestRunDurationMin6w: Math.round((longestRunKm6w * (easyPace + 30)) / 60),
    maxLongRunShare6w: avgKm6w > 0 ? roundToHundredth(longestRunKm6w / avgKm6w) : null,
    source:
      hasCurrentMileage && hasLongestRun
        ? "self_reported_profile"
        : "fallback_estimate",
  } satisfies Pick<
    TrainingEvidence,
    | "avgKm6w"
    | "avgTimeMin6w"
    | "medianKm6w"
    | "maxWeekKm6w"
    | "minNonzeroWeekKm6w"
    | "runsPerWeek6w"
    | "completedWeeks6w"
    | "loadConsistency"
    | "recentRamp"
    | "longestRunKm6w"
    | "longestRunDurationMin6w"
    | "maxLongRunShare6w"
    | "source"
  >;
}

function buildDurabilityMetrics(input: {
  historyMetrics: ReturnType<typeof buildHistoryMetricsFromWeeks> | ReturnType<typeof buildFallbackHistoryMetrics>;
  raceDistance: RaceDistance;
  workouts: LoggedWorkout[];
}) {
  const goalDistanceKm = distanceKmByRace[input.raceDistance];
  const workoutsWithHr = input.workouts.filter(
    (workout) => workout.avg_heart_rate !== null || workout.max_heart_rate !== null,
  ).length;
  const hrDataAvailability = getHeartRateDataAvailability(
    workoutsWithHr,
    input.workouts.length,
  );
  const elevationGainTotalM = input.workouts.reduce(
    (total, workout) => total + (workout.elevation_gain_m ?? 0),
    0,
  );
  const elevationGainAvgMPerWeek =
    input.workouts.length > 0 ? Math.round(elevationGainTotalM / 6) : null;

  return {
    longestRunToGoalDistanceRatio: roundToHundredth(
      input.historyMetrics.longestRunKm6w / goalDistanceKm,
    ),
    longestRunToWeeklyVolumeRatio:
      input.historyMetrics.avgKm6w > 0
        ? roundToHundredth(
            input.historyMetrics.longestRunKm6w / input.historyMetrics.avgKm6w,
          )
        : 0,
    longRunDurationCategory: getLongRunDurationCategory(
      input.historyMetrics.longestRunDurationMin6w,
    ),
    hrDataAvailability,
    elevationGainAvgMPerWeek,
    elevationTolerance: getElevationTolerance(elevationGainAvgMPerWeek),
  } satisfies Pick<
    TrainingEvidence,
    | "longestRunToGoalDistanceRatio"
    | "longestRunToWeeklyVolumeRatio"
    | "longRunDurationCategory"
    | "hrDataAvailability"
    | "elevationGainAvgMPerWeek"
    | "elevationTolerance"
  >;
}

function filterUsableRecentRunWorkouts(workouts: LoggedWorkout[]): LoggedWorkout[] {
  return workouts.filter(
    (workout) =>
      (workout.workout_type === "run" || workout.workout_type === "treadmill_run") &&
      workout.distance_km !== null &&
      workout.distance_km > 0 &&
      workout.duration_sec !== null &&
      workout.duration_sec > 0,
  );
}

function classifyWorkoutEffort(
  workout: LoggedWorkout,
  runnerProfile: RunnerProfile,
): WorkoutEffortClassification {
  const evidence: string[] = [];
  const notes = workout.notes?.toLowerCase() ?? "";
  const avgHeartRateRatio =
    runnerProfile.max_heart_rate && workout.avg_heart_rate
      ? workout.avg_heart_rate / runnerProfile.max_heart_rate
      : null;
  const maxHeartRateRatio =
    runnerProfile.max_heart_rate && workout.max_heart_rate
      ? workout.max_heart_rate / runnerProfile.max_heart_rate
      : null;
  const paceFasterThanEasyRatio =
    runnerProfile.easy_pace_sec_per_km && workout.avg_pace_sec_per_km
      ? workout.avg_pace_sec_per_km / runnerProfile.easy_pace_sec_per_km
      : null;

  if (workout.rpe !== null) {
    evidence.push(`RPE ${workout.rpe}`);
  }

  if (avgHeartRateRatio !== null) {
    evidence.push(`average HR ${Math.round(avgHeartRateRatio * 100)}% of max`);
  }

  if (maxHeartRateRatio !== null) {
    evidence.push(`max HR ${Math.round(maxHeartRateRatio * 100)}% of max`);
  }

  if (
    workout.rpe !== null && workout.rpe >= 9 ||
    avgHeartRateRatio !== null && avgHeartRateRatio >= 0.92 ||
    maxHeartRateRatio !== null && maxHeartRateRatio >= 0.96 ||
    hasNearMaxNote(notes)
  ) {
    if (hasNearMaxNote(notes)) {
      evidence.push("near-max note signal");
    }

    return buildEffortClassification(workout, "possible_near_max", evidence);
  }

  if (
    workout.rpe !== null && workout.rpe >= 7 ||
    avgHeartRateRatio !== null && avgHeartRateRatio >= 0.85 ||
    hasHardWorkoutNote(notes)
  ) {
    if (hasHardWorkoutNote(notes)) {
      evidence.push("hard workout note signal");
    }

    return buildEffortClassification(workout, "hard_workout", evidence);
  }

  if (
    workout.rpe !== null && workout.rpe >= 5 ||
    avgHeartRateRatio !== null && avgHeartRateRatio >= 0.75 ||
    paceFasterThanEasyRatio !== null && paceFasterThanEasyRatio <= 0.95
  ) {
    if (paceFasterThanEasyRatio !== null && paceFasterThanEasyRatio <= 0.95) {
      evidence.push("faster than saved easy pace");
    }

    return buildEffortClassification(workout, "controlled", evidence);
  }

  return buildEffortClassification(workout, "easy_non_limit", evidence);
}

function buildEffortClassification(
  workout: LoggedWorkout,
  quality: EffortQuality,
  evidence: string[],
): WorkoutEffortClassification {
  return {
    loggedWorkoutId: workout.id,
    workoutDate: workout.workout_date,
    quality,
    evidence,
    paceSecPerKm: workout.avg_pace_sec_per_km,
  };
}

function estimateThresholdPace(input: {
  runnerProfile: RunnerProfile;
  effortClassifications: WorkoutEffortClassification[];
  workouts: LoggedWorkout[];
}): {
  secPerKm: number | null;
  source: ThresholdEstimateSource;
  anchorWorkoutId: string | null;
} {
  if (input.runnerProfile.threshold_pace_sec_per_km !== null) {
    return {
      secPerKm: input.runnerProfile.threshold_pace_sec_per_km,
      source: "saved_threshold",
      anchorWorkoutId: null,
    };
  }

  const nearMaxAnchor = getFastestWorkoutByQuality(
    input.workouts,
    input.effortClassifications,
    "possible_near_max",
  );

  if (nearMaxAnchor?.avg_pace_sec_per_km) {
    return {
      secPerKm: Math.round(nearMaxAnchor.avg_pace_sec_per_km * 1.04),
      source: "near_max_effort",
      anchorWorkoutId: nearMaxAnchor.id,
    };
  }

  const hardAnchor = getFastestWorkoutByQuality(
    input.workouts,
    input.effortClassifications,
    "hard_workout",
  );

  if (hardAnchor?.avg_pace_sec_per_km) {
    return {
      secPerKm: Math.round(hardAnchor.avg_pace_sec_per_km * 1.08),
      source: "hard_workout",
      anchorWorkoutId: hardAnchor.id,
    };
  }

  if (input.runnerProfile.easy_pace_sec_per_km !== null) {
    return {
      secPerKm: Math.round(input.runnerProfile.easy_pace_sec_per_km * 0.88),
      source: "easy_pace_estimate",
      anchorWorkoutId: null,
    };
  }

  const easyPaceFromHistory = getMedianPaceForQualities(input.effortClassifications, [
    "easy_non_limit",
    "controlled",
  ]);

  if (easyPaceFromHistory !== null) {
    return {
      secPerKm: Math.round(easyPaceFromHistory * 0.9),
      source: "easy_pace_estimate",
      anchorWorkoutId: null,
    };
  }

  return {
    secPerKm: null,
    source: "missing",
    anchorWorkoutId: null,
  };
}

function getFitnessConfidence(input: {
  runnerProfile: RunnerProfile;
  historySource: TrainingHistorySource;
  completedWeeks6w: number;
  hrDataAvailability: HeartRateDataAvailability;
  thresholdEstimateSource: ThresholdEstimateSource;
}): TrainingEvidenceConfidence {
  const hasUsefulHistory =
    input.completedWeeks6w >= 5 ||
    input.historySource === "self_reported_profile";

  if (input.thresholdEstimateSource === "saved_threshold") {
    return hasUsefulHistory ? "high" : "medium";
  }

  if (input.thresholdEstimateSource === "near_max_effort") {
    return hasUsefulHistory && input.hrDataAvailability !== "none" ? "high" : "medium";
  }

  if (input.thresholdEstimateSource === "hard_workout") {
    return hasUsefulHistory ? "medium" : "low";
  }

  if (
    input.thresholdEstimateSource === "easy_pace_estimate" &&
    input.runnerProfile.easy_pace_sec_per_km !== null &&
    hasUsefulHistory &&
    input.hrDataAvailability !== "none"
  ) {
    return "medium";
  }

  return "low";
}

function addHistoryAssumptions(
  historySource: TrainingHistorySource,
  assumptions: string[],
): void {
  if (historySource === "manual_six_week_history") {
    assumptions.push("Recent training load uses manually entered six-week history.");
    return;
  }

  if (historySource === "assembled_six_week_history") {
    assumptions.push("Recent training load uses assembled app and Strava six-week history.");
    return;
  }

  if (historySource === "self_reported_profile") {
    assumptions.push(
      "Recent training load uses saved profile mileage and longest-run fields because detailed six-week history was not available.",
    );
  }
}

function addEvidenceMessages(input: {
  runnerProfile: RunnerProfile;
  raceGoal: RaceGoal;
  historyMetrics: ReturnType<typeof buildHistoryMetricsFromWeeks> | ReturnType<typeof buildFallbackHistoryMetrics>;
  durabilityMetrics: ReturnType<typeof buildDurabilityMetrics>;
  thresholdEstimateSource: ThresholdEstimateSource;
  fitnessConfidence: TrainingEvidenceConfidence;
  fastestWorkout: LoggedWorkout | null;
  fastestRunUsedAsFitnessAnchor: boolean;
  assumptions: string[];
  warnings: string[];
}): void {
  if (
    input.thresholdEstimateSource === "easy_pace_estimate" &&
    input.runnerProfile.threshold_pace_sec_per_km === null
  ) {
    input.assumptions.push(
      "Threshold pace is estimated from easy pace and recent-history evidence because no saved threshold pace exists.",
    );
  }

  if (
    input.historyMetrics.source === "assembled_six_week_history" &&
    input.historyMetrics.completedWeeks6w < 6
  ) {
    input.warnings.push(
      "Six-week history has one or more empty weeks, so consistency and progression confidence are reduced.",
    );
  }

  if (input.thresholdEstimateSource === "near_max_effort") {
    input.assumptions.push(
      "A recent near-max effort is used as a cautious fitness anchor because effort evidence supports it.",
    );
  }

  if (input.thresholdEstimateSource === "hard_workout") {
    input.assumptions.push(
      "A recent hard workout is used only as a cautious fitness anchor because no saved threshold pace exists.",
    );
  }

  if (input.thresholdEstimateSource === "missing") {
    input.warnings.push(
      "No pace or effort evidence is available, so current fitness confidence is low.",
    );
  }

  if (
    input.fastestWorkout &&
    !input.fastestRunUsedAsFitnessAnchor &&
    input.thresholdEstimateSource !== "saved_threshold"
  ) {
    input.assumptions.push(
      "The fastest recent run is not treated as a fitness limit because near-max effort evidence is missing.",
    );
  }

  if (input.historyMetrics.maxLongRunShare6w !== null && input.historyMetrics.maxLongRunShare6w > 0.42) {
    input.warnings.push(
      "Recent long-run share is high, so the plan treats durability as less stable than weekly distance alone suggests.",
    );
  }

  if (input.historyMetrics.recentRamp > 1.35) {
    input.warnings.push(
      "Recent weekly load ramp is high, so the generated plan reduces early progression pressure.",
    );
  }

  if (input.historyMetrics.recentRamp < 0.7) {
    input.warnings.push(
      "Recent weekly load has dropped, so the generated plan avoids assuming the older higher load is fully current.",
    );
  }

  if (input.fitnessConfidence === "low") {
    input.warnings.push(
      "Fitness confidence is low because the current evidence is incomplete or indirect.",
    );
  }

  if (
    input.durabilityMetrics.hrDataAvailability === "none" &&
    input.historyMetrics.source === "assembled_six_week_history"
  ) {
    input.assumptions.push(
      "Recent logged workouts do not include heart-rate data, so effort confidence relies on pace, duration, RPE, and notes.",
    );
  }

  if (
    input.raceGoal.distance === "marathon" &&
    input.durabilityMetrics.longestRunToGoalDistanceRatio < 0.35
  ) {
    input.warnings.push(
      "Recent longest run is low relative to the marathon distance, so long-run progression remains conservative.",
    );
  }

  if (
    input.raceGoal.course_elevation_notes?.trim() ||
    input.runnerProfile.previous_half_marathon_history?.trim() ||
    input.runnerProfile.previous_marathon_history?.trim()
  ) {
    input.assumptions.push(
      "Race-history and course notes are treated as supporting context, not proof of current fitness.",
    );
  }
}

function getMaxLongRunShare(weeks: RecentTrainingWeekInput[]): number | null {
  const shares = weeks
    .map((week) =>
      week.distance_km > 0 && week.longest_run_km !== null
        ? week.longest_run_km / week.distance_km
        : null,
    )
    .filter((share): share is number => share !== null);

  if (shares.length === 0) {
    return null;
  }

  return roundToHundredth(Math.max(...shares));
}

function getHeartRateDataAvailability(
  workoutsWithHr: number,
  totalWorkouts: number,
): HeartRateDataAvailability {
  if (totalWorkouts === 0 || workoutsWithHr === 0) {
    return "none";
  }

  if (workoutsWithHr / totalWorkouts >= 0.67) {
    return "most";
  }

  return "some";
}

function getLongRunDurationCategory(
  durationMin: number | null,
): LongRunDurationCategory {
  if (durationMin === null) {
    return "unknown";
  }

  if (durationMin < 75) {
    return "short";
  }

  if (durationMin < 105) {
    return "moderate";
  }

  if (durationMin < 150) {
    return "long";
  }

  return "very_long";
}

function getElevationTolerance(
  elevationGainAvgMPerWeek: number | null,
): ElevationTolerance {
  if (elevationGainAvgMPerWeek === null) {
    return "unknown";
  }

  if (elevationGainAvgMPerWeek < 75) {
    return "low";
  }

  if (elevationGainAvgMPerWeek < 250) {
    return "moderate";
  }

  return "high";
}

function getFastestWorkout(workouts: LoggedWorkout[]): LoggedWorkout | null {
  return workouts.reduce<LoggedWorkout | null>((fastest, workout) => {
    if (workout.avg_pace_sec_per_km === null) {
      return fastest;
    }

    if (
      fastest === null ||
      fastest.avg_pace_sec_per_km === null ||
      workout.avg_pace_sec_per_km < fastest.avg_pace_sec_per_km
    ) {
      return workout;
    }

    return fastest;
  }, null);
}

function getFastestWorkoutByQuality(
  workouts: LoggedWorkout[],
  classifications: WorkoutEffortClassification[],
  quality: EffortQuality,
): LoggedWorkout | null {
  const matchingWorkoutIds = new Set(
    classifications
      .filter((classification) => classification.quality === quality)
      .map((classification) => classification.loggedWorkoutId),
  );

  return getFastestWorkout(
    workouts.filter(
      (workout) =>
        matchingWorkoutIds.has(workout.id) &&
        workout.avg_pace_sec_per_km !== null &&
        isLongEnoughForFitnessAnchor(workout),
    ),
  );
}

function getMedianPaceForQualities(
  classifications: WorkoutEffortClassification[],
  qualities: EffortQuality[],
): number | null {
  const paces = classifications
    .filter(
      (classification) =>
        classification.paceSecPerKm !== null &&
        qualities.includes(classification.quality),
    )
    .map((classification) => classification.paceSecPerKm ?? 0)
    .sort((a, b) => a - b);

  if (paces.length === 0) {
    return null;
  }

  const middleIndex = Math.floor(paces.length / 2);

  return paces.length % 2 === 0
    ? Math.round((paces[middleIndex - 1] + paces[middleIndex]) / 2)
    : paces[middleIndex];
}

function isLongEnoughForFitnessAnchor(workout: LoggedWorkout): boolean {
  return (
    workout.duration_sec !== null &&
    workout.duration_sec >= 15 * 60 &&
    workout.duration_sec <= 2 * 60 * 60 &&
    workout.distance_km !== null &&
    workout.distance_km >= 3
  );
}

function hasNearMaxNote(notes: string): boolean {
  return /\b(race|time trial|tt|all out|max effort|near max|pr|pb)\b/.test(notes);
}

function hasHardWorkoutNote(notes: string): boolean {
  return /\b(tempo|threshold|interval|workout|hard|progression)\b/.test(notes);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 10) / 10;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatRaceDistance(raceDistance: RaceDistance): string {
  return raceDistance === "marathon" ? "marathon" : "half marathon";
}
