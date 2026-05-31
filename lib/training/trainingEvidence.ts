import type {
  LoggedWorkout,
  PlanGenerationAerobicEfficiencyBlockLabel,
  PlanGenerationAerobicEfficiencyConfidence,
  PlanGenerationAerobicEfficiencyMethod,
  PlanGenerationAerobicEfficiencySummary,
  PlanGenerationAerobicEfficiencyTrend,
  PlanGenerationFitnessAnchorRecencyBucket,
  PlanGenerationFitnessAnchorSummary,
  PlanGenerationFitnessConfidenceAdjustment,
  RaceDistance,
  RaceGoal,
  RecentTrainingWeekInput,
  RunnerProfile,
} from "../../types/training.ts";
import type { StravaActivityEvidence } from "../strava/activityEvidence.ts";
import { classifyEffortFromPhysiology } from "./physiology.ts";

export type EffortQuality =
  | "race_time_trial"
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

export type PowerDataAvailability = "none" | "some" | "most";

export type ElevationTolerance = "unknown" | "low" | "moderate" | "high";

export type DurabilityTrend = "unknown" | "stable" | "caution" | "poor";

export type ThresholdEstimateSource =
  | "saved_threshold"
  | "race_time_trial"
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
  durabilityTrend: DurabilityTrend;
  paceFadeAvgPercent: number | null;
  heartRateDriftAvgPercent: number | null;
  negativeSplitCount6w: number;
  hrDataAvailability: HeartRateDataAvailability;
  powerDataAvailability: PowerDataAvailability;
  elevationGainAvgMPerWeek: number | null;
  elevationTolerance: ElevationTolerance;
  stravaEvidenceActivityCount: number;
  effortClassifications: WorkoutEffortClassification[];
  raceTimeTrialCount6w: number;
  hardWorkoutCount6w: number;
  possibleNearMaxCount6w: number;
  fastestPaceSecPerKm: number | null;
  fastestRunUsedAsFitnessAnchor: boolean;
  fitnessAnchorWorkoutId: string | null;
  fitnessAnchorDistanceKm: number | null;
  fitnessAnchorDurationSec: number | null;
  fitnessAnchorSummary: PlanGenerationFitnessAnchorSummary | null;
  aerobicEfficiencySummary: PlanGenerationAerobicEfficiencySummary;
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
  stravaActivityEvidence?: StravaActivityEvidence[];
  evidenceWarnings?: string[];
};

type FitnessAnchorCandidate = {
  workout: LoggedWorkout;
  classification: WorkoutEffortClassification;
  source: Exclude<
    ThresholdEstimateSource,
    "saved_threshold" | "easy_pace_estimate" | "missing"
  >;
  multiplier: number;
  recencyBucket: PlanGenerationFitnessAnchorRecencyBucket;
  recencyWeight: number;
  effortQualityScore: number;
  sourceQualityScore: number;
  dataConfidenceScore: number;
  weightedScore: number;
  unweightedScore: number;
};

type AerobicEfficiencyCandidate = {
  workout: LoggedWorkout;
  block: PlanGenerationAerobicEfficiencyBlockLabel;
  paceSecPerKm: number;
  speedMps: number;
  avgHeartRate: number | null;
  avgPowerWatts: number | null;
  hrEligible: boolean;
  powerEligible: boolean;
  paceEligible: boolean;
};

type AerobicEfficiencyMetricCandidate = AerobicEfficiencyCandidate & {
  metricValue: number | null;
  efficiency: number;
};

type AerobicEfficiencyTrendResult = Omit<
  PlanGenerationAerobicEfficiencySummary,
  "fitness_confidence_adjustment"
>;

const distanceKmByRace: Record<RaceDistance, number> = {
  marathon: 42.2,
  half_marathon: 21.1,
};

const aerobicEfficiencyThresholdPercent = 2.5;

const aerobicEfficiencyBlocks: {
  block: PlanGenerationAerobicEfficiencyBlockLabel;
  minAgeDays: number;
  maxAgeDays: number;
}[] = [
  { block: "29_42_days", minAgeDays: 29, maxAgeDays: 42 },
  { block: "15_28_days", minAgeDays: 15, maxAgeDays: 28 },
  { block: "0_14_days", minAgeDays: 0, maxAgeDays: 14 },
];

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
  const stravaEvidenceByActivityId = buildStravaEvidenceByActivityId(
    input.stravaActivityEvidence ?? [],
  );
  const effortClassifications = filteredWorkouts.map((workout) =>
    classifyWorkoutEffort({
      workout,
      runnerProfile: input.runnerProfile,
      stravaEvidence: workout.source_activity_id
        ? stravaEvidenceByActivityId.get(workout.source_activity_id) ?? null
        : null,
    }),
  );
  const durabilityMetrics = buildDurabilityMetrics({
    historyMetrics,
    raceDistance: input.raceGoal.distance,
    workouts: filteredWorkouts,
    stravaEvidenceByActivityId,
  });
  const anchorReferenceDate = getFitnessAnchorReferenceDate({
    sixWeekHistory,
    workouts: filteredWorkouts,
  });
  const thresholdEstimate = estimateThresholdPace({
    runnerProfile: input.runnerProfile,
    effortClassifications,
    workouts: filteredWorkouts,
    stravaEvidenceByActivityId,
    anchorReferenceDate,
  });
  const baseFitnessConfidence = getFitnessConfidence({
    runnerProfile: input.runnerProfile,
    historySource: historyMetrics.source,
    completedWeeks6w: historyMetrics.completedWeeks6w,
    hrDataAvailability: durabilityMetrics.hrDataAvailability,
    powerDataAvailability: durabilityMetrics.powerDataAvailability,
    thresholdEstimateSource: thresholdEstimate.source,
  });
  const aerobicEfficiencySummary = buildAerobicEfficiencySummary({
    runnerProfile: input.runnerProfile,
    raceGoal: input.raceGoal,
    workouts: filteredWorkouts,
    effortClassifications,
    stravaEvidenceByActivityId,
    referenceDate: anchorReferenceDate,
    historyMetrics,
    durabilityMetrics,
    thresholdEstimateSource: thresholdEstimate.source,
    baseFitnessConfidence,
  });
  const fitnessConfidence =
    aerobicEfficiencySummary.fitness_confidence_adjustment.to;
  const hardWorkoutCount6w = effortClassifications.filter(
    (classification) =>
      classification.quality === "race_time_trial" ||
      classification.quality === "hard_workout" ||
      classification.quality === "possible_near_max",
  ).length;
  const raceTimeTrialCount6w = effortClassifications.filter(
    (classification) => classification.quality === "race_time_trial",
  ).length;
  const possibleNearMaxCount6w = effortClassifications.filter(
    (classification) =>
      classification.quality === "race_time_trial" ||
      classification.quality === "possible_near_max",
  ).length;
  const fastestWorkout = getFastestWorkout(filteredWorkouts);
  const fastestClassification = fastestWorkout
    ? effortClassifications.find(
        (classification) => classification.loggedWorkoutId === fastestWorkout.id,
      ) ?? null
    : null;
  const fastestRunUsedAsFitnessAnchor =
    (fastestClassification?.quality === "race_time_trial" ||
      fastestClassification?.quality === "possible_near_max") &&
    thresholdEstimate.anchorWorkoutId === fastestWorkout?.id;
  const thresholdAnchorWorkout = thresholdEstimate.anchorWorkoutId
    ? filteredWorkouts.find((workout) => workout.id === thresholdEstimate.anchorWorkoutId) ??
      null
    : null;

  addHistoryAssumptions(historyMetrics.source, assumptions);
  addEvidenceMessages({
    runnerProfile: input.runnerProfile,
    raceGoal: input.raceGoal,
    historyMetrics,
    durabilityMetrics,
    thresholdEstimateSource: thresholdEstimate.source,
    fitnessConfidence,
    fitnessAnchorSummary: thresholdEstimate.anchorSummary,
    aerobicEfficiencySummary,
    fastestWorkout,
    fastestRunUsedAsFitnessAnchor,
    stravaEvidenceActivityCount: input.stravaActivityEvidence?.length ?? 0,
    evidenceWarnings: input.evidenceWarnings ?? [],
    assumptions,
    warnings,
  });

  return {
    ...historyMetrics,
    ...durabilityMetrics,
    stravaEvidenceActivityCount: input.stravaActivityEvidence?.length ?? 0,
    effortClassifications,
    raceTimeTrialCount6w,
    hardWorkoutCount6w,
    possibleNearMaxCount6w,
    fastestPaceSecPerKm: fastestWorkout?.avg_pace_sec_per_km ?? null,
    fastestRunUsedAsFitnessAnchor,
    fitnessAnchorWorkoutId: thresholdEstimate.anchorWorkoutId,
    fitnessAnchorDistanceKm: thresholdAnchorWorkout?.distance_km ?? null,
    fitnessAnchorDurationSec: thresholdAnchorWorkout?.duration_sec ?? null,
    fitnessAnchorSummary: thresholdEstimate.anchorSummary,
    aerobicEfficiencySummary,
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
  stravaEvidenceByActivityId: Map<string, StravaActivityEvidence>;
}) {
  const goalDistanceKm = distanceKmByRace[input.raceDistance];
  const workoutsWithHr = input.workouts.filter(
    (workout) =>
      workout.avg_heart_rate !== null ||
      workout.max_heart_rate !== null ||
      getMatchingStravaEvidence(workout, input.stravaEvidenceByActivityId)
        ?.hasHeartRateStream,
  ).length;
  const workoutsWithPower = input.workouts.filter(
    (workout) =>
      getMatchingStravaEvidence(workout, input.stravaEvidenceByActivityId)
        ?.hasPowerStream,
  ).length;
  const hrDataAvailability = getHeartRateDataAvailability(
    workoutsWithHr,
    input.workouts.length,
  );
  const powerDataAvailability = getPowerDataAvailability(
    workoutsWithPower,
    input.workouts.length,
  );
  const elevationGainTotalM = input.workouts.reduce(
    (total, workout) =>
      total +
      (workout.elevation_gain_m ??
        getMatchingStravaEvidence(workout, input.stravaEvidenceByActivityId)
          ?.elevationGainM ??
        0),
    0,
  );
  const elevationGainAvgMPerWeek =
    input.workouts.length > 0 ? Math.round(elevationGainTotalM / 6) : null;
  const matchedEvidence = getMatchedStravaEvidenceItems({
    workouts: input.workouts,
    evidenceByActivityId: input.stravaEvidenceByActivityId,
  });
  const paceFadeValues = matchedEvidence
    .map((evidence) => evidence.paceFadePercent)
    .filter(isFiniteNumber);
  const heartRateDriftValues = matchedEvidence
    .map((evidence) => evidence.heartRateDriftPercent)
    .filter(isFiniteNumber);
  const negativeSplitCount6w = matchedEvidence.filter(
    (evidence) => evidence.negativeSplit === true,
  ).length;
  const paceFadeAvgPercent = averageOrNull(paceFadeValues);
  const heartRateDriftAvgPercent = averageOrNull(heartRateDriftValues);
  const durabilityTrend = getDurabilityTrend({
    maxLongRunShare6w: input.historyMetrics.maxLongRunShare6w,
    paceFadeValues,
    heartRateDriftValues,
    longestRunToGoalDistanceRatio: roundToHundredth(
      input.historyMetrics.longestRunKm6w / goalDistanceKm,
    ),
    raceDistance: input.raceDistance,
    historySource: input.historyMetrics.source,
    evidenceCount: matchedEvidence.length,
  });

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
    durabilityTrend,
    paceFadeAvgPercent,
    heartRateDriftAvgPercent,
    negativeSplitCount6w,
    hrDataAvailability,
    powerDataAvailability,
    elevationGainAvgMPerWeek,
    elevationTolerance: getElevationTolerance(elevationGainAvgMPerWeek),
  } satisfies Pick<
    TrainingEvidence,
    | "longestRunToGoalDistanceRatio"
    | "longestRunToWeeklyVolumeRatio"
    | "longRunDurationCategory"
    | "durabilityTrend"
    | "paceFadeAvgPercent"
    | "heartRateDriftAvgPercent"
    | "negativeSplitCount6w"
    | "hrDataAvailability"
    | "powerDataAvailability"
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

function classifyWorkoutEffort(input: {
  workout: LoggedWorkout;
  runnerProfile: RunnerProfile;
  stravaEvidence: StravaActivityEvidence | null;
}): WorkoutEffortClassification {
  const { workout, runnerProfile, stravaEvidence } = input;
  const evidence: string[] = [...(stravaEvidence?.effortSignals ?? [])];
  const notes = workout.notes?.toLowerCase() ?? "";
  const physiologyClassification = classifyEffortFromPhysiology({
    runnerProfile,
    avgHeartRate: workout.avg_heart_rate ?? stravaEvidence?.averageHeartRate ?? null,
    maxHeartRate: workout.max_heart_rate ?? stravaEvidence?.maxHeartRate ?? null,
    stravaEvidence,
  });
  const paceFasterThanEasyRatio =
    runnerProfile.easy_pace_sec_per_km && workout.avg_pace_sec_per_km
      ? workout.avg_pace_sec_per_km / runnerProfile.easy_pace_sec_per_km
      : null;

  evidence.push(...physiologyClassification.evidence);

  if (workout.rpe !== null) {
    evidence.push(`RPE ${workout.rpe}`);
  }

  if (
    (
      workout.rpe !== null && workout.rpe >= 8 ||
      physiologyClassification.level === "near_max" ||
      physiologyClassification.level === "hard" ||
      stravaEvidence?.classificationHint === "race_time_trial"
    ) &&
    hasRaceTimeTrialNote(notes)
  ) {
    evidence.push("race/time-trial effort signal");
    return buildEffortClassification(workout, "race_time_trial", evidence);
  }

  if (stravaEvidence?.classificationHint === "race_time_trial") {
    evidence.push("Strava detail/stream evidence supports race/time-trial effort");
    return buildEffortClassification(workout, "race_time_trial", evidence);
  }

  if (
    workout.rpe !== null && workout.rpe >= 9 ||
    physiologyClassification.level === "near_max" ||
    hasNearMaxNote(notes)
  ) {
    if (hasNearMaxNote(notes)) {
      evidence.push("near-max note signal");
    }

    return buildEffortClassification(workout, "possible_near_max", evidence);
  }

  if (stravaEvidence?.classificationHint === "possible_near_max") {
    evidence.push("Strava detail/stream evidence supports near-max effort");
    return buildEffortClassification(workout, "possible_near_max", evidence);
  }

  if (
    workout.rpe !== null && workout.rpe >= 7 ||
    physiologyClassification.level === "hard" ||
    hasHardWorkoutNote(notes)
  ) {
    if (hasHardWorkoutNote(notes)) {
      evidence.push("hard workout note signal");
    }

    return buildEffortClassification(workout, "hard_workout", evidence);
  }

  if (stravaEvidence?.classificationHint === "hard_workout") {
    evidence.push("Strava detail/stream evidence supports hard workout");
    return buildEffortClassification(workout, "hard_workout", evidence);
  }

  if (
    workout.rpe !== null && workout.rpe >= 5 ||
    physiologyClassification.level === "controlled"
  ) {
    return buildEffortClassification(workout, "controlled", evidence);
  }

  if (stravaEvidence?.classificationHint === "controlled") {
    evidence.push("Strava detail/stream evidence supports controlled workout");
    return buildEffortClassification(workout, "controlled", evidence);
  }

  if (
    paceFasterThanEasyRatio !== null &&
    paceFasterThanEasyRatio <= 0.95 &&
    stravaEvidence?.classificationHint !== "easy_non_limit"
  ) {
    evidence.push("faster than saved easy pace");
    return buildEffortClassification(workout, "controlled", evidence);
  }

  if (stravaEvidence?.classificationHint === "easy_non_limit") {
    evidence.push("Strava detail/stream evidence does not support a max anchor");
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
  stravaEvidenceByActivityId: Map<string, StravaActivityEvidence>;
  anchorReferenceDate: string | null;
}): {
  secPerKm: number | null;
  source: ThresholdEstimateSource;
  anchorWorkoutId: string | null;
  anchorSummary: PlanGenerationFitnessAnchorSummary | null;
} {
  if (input.runnerProfile.threshold_pace_sec_per_km !== null) {
    return {
      secPerKm: input.runnerProfile.threshold_pace_sec_per_km,
      source: "saved_threshold",
      anchorWorkoutId: null,
      anchorSummary: null,
    };
  }

  const anchorSelection = selectFitnessAnchor({
    workouts: input.workouts,
    effortClassifications: input.effortClassifications,
    stravaEvidenceByActivityId: input.stravaEvidenceByActivityId,
    anchorReferenceDate: input.anchorReferenceDate,
  });

  if (
    anchorSelection.selected &&
    anchorSelection.selected.workout.avg_pace_sec_per_km !== null
  ) {
    const selected = anchorSelection.selected;
    const selectedPaceSecPerKm = selected.workout.avg_pace_sec_per_km ?? 0;

    return {
      secPerKm: Math.round(
        selectedPaceSecPerKm * selected.multiplier,
      ),
      source: selected.source,
      anchorWorkoutId: selected.workout.id,
      anchorSummary: {
        workout_id: selected.workout.id,
        workout_date: selected.workout.workout_date,
        classification: selected.classification.quality as
          PlanGenerationFitnessAnchorSummary["classification"],
        recency_bucket: selected.recencyBucket,
        score: selected.weightedScore,
        recency_weighting_changed_selection:
          anchorSelection.recencyWeightingChangedSelection,
      },
    };
  }

  if (input.runnerProfile.easy_pace_sec_per_km !== null) {
    return {
      secPerKm: Math.round(input.runnerProfile.easy_pace_sec_per_km * 0.88),
      source: "easy_pace_estimate",
      anchorWorkoutId: null,
      anchorSummary: null,
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
      anchorSummary: null,
    };
  }

  return {
    secPerKm: null,
    source: "missing",
    anchorWorkoutId: null,
    anchorSummary: null,
  };
}

function getFitnessConfidence(input: {
  runnerProfile: RunnerProfile;
  historySource: TrainingHistorySource;
  completedWeeks6w: number;
  hrDataAvailability: HeartRateDataAvailability;
  powerDataAvailability: PowerDataAvailability;
  thresholdEstimateSource: ThresholdEstimateSource;
}): TrainingEvidenceConfidence {
  const hasUsefulHistory =
    input.completedWeeks6w >= 5 ||
    input.historySource === "self_reported_profile";
  const hasPhysiologyEvidence =
    input.hrDataAvailability !== "none" || input.powerDataAvailability !== "none";

  if (input.thresholdEstimateSource === "saved_threshold") {
    return hasUsefulHistory ? "high" : "medium";
  }

  if (input.thresholdEstimateSource === "race_time_trial") {
    return hasUsefulHistory ? "high" : "medium";
  }

  if (input.thresholdEstimateSource === "near_max_effort") {
    return hasUsefulHistory && hasPhysiologyEvidence ? "high" : "medium";
  }

  if (input.thresholdEstimateSource === "hard_workout") {
    return hasUsefulHistory ? "medium" : "low";
  }

  if (
    input.thresholdEstimateSource === "easy_pace_estimate" &&
    input.runnerProfile.easy_pace_sec_per_km !== null &&
    hasUsefulHistory &&
    hasPhysiologyEvidence
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
  fitnessAnchorSummary: PlanGenerationFitnessAnchorSummary | null;
  aerobicEfficiencySummary: PlanGenerationAerobicEfficiencySummary;
  fastestWorkout: LoggedWorkout | null;
  fastestRunUsedAsFitnessAnchor: boolean;
  stravaEvidenceActivityCount: number;
  evidenceWarnings: string[];
  assumptions: string[];
  warnings: string[];
}): void {
  if (input.stravaEvidenceActivityCount > 0) {
    input.assumptions.push(
      `Strava detail/stream evidence was available for ${input.stravaEvidenceActivityCount} recent run${input.stravaEvidenceActivityCount === 1 ? "" : "s"} and used as supporting evidence.`,
    );
  }

  input.warnings.push(...input.evidenceWarnings);

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
      "A near-max effort is used as a cautious fitness anchor because effort evidence supports it.",
    );
  }

  if (input.thresholdEstimateSource === "race_time_trial") {
    input.assumptions.push(
      "A race or time-trial effort is used as the strongest current fitness anchor because effort evidence supports it.",
    );
  }

  if (input.thresholdEstimateSource === "hard_workout") {
    input.assumptions.push(
      "A hard workout is used only as a cautious fitness anchor because no saved threshold pace exists.",
    );
  }

  if (input.fitnessAnchorSummary?.recency_weighting_changed_selection) {
    input.assumptions.push(
      "Fitness-anchor recency weighting changed the selected current-fitness anchor.",
    );
  }

  if (
    input.aerobicEfficiencySummary.fitness_confidence_adjustment.direction ===
    "upgraded"
  ) {
    input.assumptions.push(
      "Aerobic-efficiency trend modestly improves fitness confidence, but does not override durability, injury, or goal-feasibility rules.",
    );
  }

  if (
    input.aerobicEfficiencySummary.fitness_confidence_adjustment.direction ===
    "downgraded"
  ) {
    input.warnings.push(
      "Recent aerobic-efficiency trend is declining, so fitness confidence is reduced by one level.",
    );
  } else if (input.aerobicEfficiencySummary.trend === "declining") {
    input.warnings.push(
      "Recent aerobic-efficiency trend is declining, so progression should stay conservative.",
    );
  }

  if (
    (input.aerobicEfficiencySummary.trend === "noisy" ||
      input.aerobicEfficiencySummary.trend === "unknown") &&
    hasAggressiveGoalSignal(input.runnerProfile, input.raceGoal)
  ) {
    input.assumptions.push(
      "Aerobic-efficiency trend is unclear, so aggressive progression is not increased from this signal.",
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

  if (
    input.durabilityMetrics.paceFadeAvgPercent !== null &&
    input.durabilityMetrics.paceFadeAvgPercent >= 6
  ) {
    input.warnings.push(
      "Recent Strava pace-fade evidence suggests long-run durability should progress conservatively.",
    );
  }

  if (
    input.durabilityMetrics.heartRateDriftAvgPercent !== null &&
    input.durabilityMetrics.heartRateDriftAvgPercent >= 6
  ) {
    input.warnings.push(
      "Recent heart-rate drift evidence suggests long-run intensity should stay conservative.",
    );
  }

  if (input.durabilityMetrics.negativeSplitCount6w > 0) {
    input.assumptions.push(
      "Recent negative-split evidence is treated as supporting durability context, not proof of race fitness.",
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
    input.durabilityMetrics.powerDataAvailability !== "none" &&
    input.historyMetrics.source === "assembled_six_week_history"
  ) {
    input.assumptions.push(
      "Recent Strava run-power evidence is used as supporting context for effort confidence, not as a standalone performance limit.",
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

function getPowerDataAvailability(
  workoutsWithPower: number,
  totalWorkouts: number,
): PowerDataAvailability {
  if (totalWorkouts === 0 || workoutsWithPower === 0) {
    return "none";
  }

  if (workoutsWithPower / totalWorkouts >= 0.67) {
    return "most";
  }

  return "some";
}

function buildStravaEvidenceByActivityId(
  evidenceItems: StravaActivityEvidence[],
): Map<string, StravaActivityEvidence> {
  return new Map(
    evidenceItems.map((evidence) => [
      evidence.stravaActivityId,
      evidence,
    ]),
  );
}

function getMatchingStravaEvidence(
  workout: LoggedWorkout,
  evidenceByActivityId: Map<string, StravaActivityEvidence>,
): StravaActivityEvidence | null {
  return workout.source_activity_id
    ? evidenceByActivityId.get(workout.source_activity_id) ?? null
    : null;
}

function getMatchedStravaEvidenceItems(input: {
  workouts: LoggedWorkout[];
  evidenceByActivityId: Map<string, StravaActivityEvidence>;
}): StravaActivityEvidence[] {
  const evidenceItems: StravaActivityEvidence[] = [];
  const seenActivityIds = new Set<string>();

  for (const workout of input.workouts) {
    const evidence = getMatchingStravaEvidence(workout, input.evidenceByActivityId);

    if (!evidence || seenActivityIds.has(evidence.stravaActivityId)) {
      continue;
    }

    seenActivityIds.add(evidence.stravaActivityId);
    evidenceItems.push(evidence);
  }

  return evidenceItems;
}

function buildAerobicEfficiencySummary(input: {
  runnerProfile: RunnerProfile;
  raceGoal: RaceGoal;
  workouts: LoggedWorkout[];
  effortClassifications: WorkoutEffortClassification[];
  stravaEvidenceByActivityId: Map<string, StravaActivityEvidence>;
  referenceDate: string | null;
  historyMetrics: ReturnType<typeof buildHistoryMetricsFromWeeks> | ReturnType<typeof buildFallbackHistoryMetrics>;
  durabilityMetrics: ReturnType<typeof buildDurabilityMetrics>;
  thresholdEstimateSource: ThresholdEstimateSource;
  baseFitnessConfidence: TrainingEvidenceConfidence;
}): PlanGenerationAerobicEfficiencySummary {
  const trendResult = buildAerobicEfficiencyTrendResult({
    workouts: input.workouts,
    effortClassifications: input.effortClassifications,
    stravaEvidenceByActivityId: input.stravaEvidenceByActivityId,
    referenceDate: input.referenceDate,
  });
  const fitnessConfidenceAdjustment = getAerobicEfficiencyFitnessAdjustment({
    summary: trendResult,
    baseFitnessConfidence: input.baseFitnessConfidence,
    runnerProfile: input.runnerProfile,
    raceGoal: input.raceGoal,
    historyMetrics: input.historyMetrics,
    durabilityMetrics: input.durabilityMetrics,
    thresholdEstimateSource: input.thresholdEstimateSource,
  });

  return {
    ...trendResult,
    fitness_confidence_adjustment: fitnessConfidenceAdjustment,
  };
}

function buildAerobicEfficiencyTrendResult(input: {
  workouts: LoggedWorkout[];
  effortClassifications: WorkoutEffortClassification[];
  stravaEvidenceByActivityId: Map<string, StravaActivityEvidence>;
  referenceDate: string | null;
}): AerobicEfficiencyTrendResult {
  const referenceDate = input.referenceDate;

  if (!referenceDate) {
    return buildUnknownAerobicEfficiencyTrendResult(null);
  }

  const candidates = buildAerobicEfficiencyCandidates({
    workouts: input.workouts,
    effortClassifications: input.effortClassifications,
    stravaEvidenceByActivityId: input.stravaEvidenceByActivityId,
    referenceDate,
  });

  return (
    buildAerobicEfficiencyTrendForMethod({
      method: "heart_rate",
      candidates: candidates.filter((candidate) => candidate.hrEligible),
      referenceDate,
    }) ??
    buildAerobicEfficiencyTrendForMethod({
      method: "power",
      candidates: candidates.filter((candidate) => candidate.powerEligible),
      referenceDate,
    }) ??
    buildAerobicEfficiencyTrendForMethod({
      method: "pace_only",
      candidates: candidates.filter((candidate) => candidate.paceEligible),
      referenceDate,
    }) ??
    buildUnknownAerobicEfficiencyTrendResult(referenceDate)
  );
}

function buildAerobicEfficiencyCandidates(input: {
  workouts: LoggedWorkout[];
  effortClassifications: WorkoutEffortClassification[];
  stravaEvidenceByActivityId: Map<string, StravaActivityEvidence>;
  referenceDate: string;
}): AerobicEfficiencyCandidate[] {
  const classificationByWorkoutId = new Map(
    input.effortClassifications.map((classification) => [
      classification.loggedWorkoutId,
      classification,
    ]),
  );
  const candidates: AerobicEfficiencyCandidate[] = [];

  for (const workout of input.workouts) {
    const classification = classificationByWorkoutId.get(workout.id) ?? null;

    if (
      !classification ||
      (classification.quality !== "easy_non_limit" &&
        classification.quality !== "controlled")
    ) {
      continue;
    }

    const stravaEvidence = getMatchingStravaEvidence(
      workout,
      input.stravaEvidenceByActivityId,
    );
    const candidate = buildAerobicEfficiencyCandidate({
      workout,
      stravaEvidence,
      referenceDate: input.referenceDate,
    });

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function buildAerobicEfficiencyCandidate(input: {
  workout: LoggedWorkout;
  stravaEvidence: StravaActivityEvidence | null;
  referenceDate: string;
}): AerobicEfficiencyCandidate | null {
  const { workout, stravaEvidence } = input;
  const block = getAerobicEfficiencyBlock({
    workoutDate: workout.workout_date,
    referenceDate: input.referenceDate,
  });
  const distanceKm = workout.distance_km ?? stravaEvidence?.distanceKm ?? null;
  const durationSec = workout.duration_sec ?? stravaEvidence?.durationSec ?? null;
  const paceSecPerKm =
    workout.avg_pace_sec_per_km ??
    stravaEvidence?.avgPaceSecPerKm ??
    (distanceKm !== null && durationSec !== null && distanceKm > 0
      ? Math.round(durationSec / distanceKm)
      : null);

  if (
    !block ||
    distanceKm === null ||
    durationSec === null ||
    paceSecPerKm === null ||
    distanceKm < 3 ||
    durationSec < 15 * 60 ||
    !isReliableAerobicPace(paceSecPerKm) ||
    hasWorkoutContextSignal(workout.notes ?? "")
  ) {
    return null;
  }

  const avgHeartRate =
    workout.avg_heart_rate ?? stravaEvidence?.averageHeartRate ?? null;
  const avgPowerWatts =
    stravaEvidence?.weightedAveragePowerWatts ??
    stravaEvidence?.averagePowerWatts ??
    null;
  const elevationGainM =
    workout.elevation_gain_m ?? stravaEvidence?.elevationGainM ?? null;
  const isVeryHilly =
    (elevationGainM !== null && elevationGainM / distanceKm > 20) ||
    (stravaEvidence?.altitudeRangeM !== null &&
      stravaEvidence?.altitudeRangeM !== undefined &&
      stravaEvidence.altitudeRangeM > 120) ||
    (stravaEvidence?.gradeRangePercent !== null &&
      stravaEvidence?.gradeRangePercent !== undefined &&
      stravaEvidence.gradeRangePercent > 8);
  const hasValidPower = isValidAerobicPower(avgPowerWatts);

  if (isVeryHilly && !hasValidPower) {
    return null;
  }

  return {
    workout,
    block,
    paceSecPerKm,
    speedMps: 1000 / paceSecPerKm,
    avgHeartRate,
    avgPowerWatts,
    hrEligible: isValidAerobicHeartRate(avgHeartRate) && !isVeryHilly,
    powerEligible: hasValidPower,
    paceEligible: !isVeryHilly,
  };
}

function buildAerobicEfficiencyTrendForMethod(input: {
  method: Exclude<PlanGenerationAerobicEfficiencyMethod, "unknown">;
  candidates: AerobicEfficiencyCandidate[];
  referenceDate: string;
}): AerobicEfficiencyTrendResult | null {
  const metricCandidates = getComparableAerobicEfficiencyCandidates(input);

  if (!hasEnoughAerobicEfficiencyBlocks(metricCandidates)) {
    return null;
  }

  const blockSummaries = buildAerobicEfficiencyBlockSummaries({
    candidates: metricCandidates,
    referenceDate: input.referenceDate,
  });
  const trend = classifyAerobicEfficiencyTrend(blockSummaries);

  return {
    trend,
    confidence: getAerobicEfficiencyConfidence({
      method: input.method,
      trend,
      blockSummaries,
    }),
    method: input.method,
    block_summaries: blockSummaries,
    recent_vs_old_percent: getAerobicEfficiencyBlockComparison(
      blockSummaries,
      "0_14_days",
      "29_42_days",
    ),
    recent_vs_middle_percent: getAerobicEfficiencyBlockComparison(
      blockSummaries,
      "0_14_days",
      "15_28_days",
    ),
  };
}

function getComparableAerobicEfficiencyCandidates(input: {
  method: Exclude<PlanGenerationAerobicEfficiencyMethod, "unknown">;
  candidates: AerobicEfficiencyCandidate[];
}): AerobicEfficiencyMetricCandidate[] {
  if (input.method === "pace_only") {
    return input.candidates.map((candidate) => ({
      ...candidate,
      metricValue: null,
      efficiency: candidate.speedMps,
    }));
  }

  const metricValues = input.candidates
    .map((candidate) =>
      input.method === "heart_rate"
        ? candidate.avgHeartRate
        : candidate.avgPowerWatts,
    )
    .filter(isFiniteNumber)
    .sort((a, b) => a - b);

  if (metricValues.length === 0) {
    return [];
  }

  const referenceMetric = getMedian(metricValues);
  const tolerance =
    input.method === "heart_rate"
      ? Math.max(8, referenceMetric * 0.06)
      : Math.max(20, referenceMetric * 0.1);

  return input.candidates
    .map((candidate): AerobicEfficiencyMetricCandidate | null => {
      const metricValue =
        input.method === "heart_rate"
          ? candidate.avgHeartRate
          : candidate.avgPowerWatts;

      if (
        metricValue === null ||
        !Number.isFinite(metricValue) ||
        Math.abs(metricValue - referenceMetric) > tolerance
      ) {
        return null;
      }

      return {
        ...candidate,
        metricValue,
        efficiency: candidate.speedMps * (referenceMetric / metricValue),
      };
    })
    .filter(
      (candidate): candidate is AerobicEfficiencyMetricCandidate =>
        candidate !== null,
    );
}

function hasEnoughAerobicEfficiencyBlocks(
  candidates: AerobicEfficiencyMetricCandidate[],
): boolean {
  const blocks = new Set(candidates.map((candidate) => candidate.block));

  return blocks.has("0_14_days") && blocks.size >= 2;
}

function buildAerobicEfficiencyBlockSummaries(input: {
  candidates: AerobicEfficiencyMetricCandidate[];
  referenceDate: string;
}): PlanGenerationAerobicEfficiencySummary["block_summaries"] {
  return aerobicEfficiencyBlocks.map((blockDefinition) => {
    const candidates = input.candidates.filter(
      (candidate) => candidate.block === blockDefinition.block,
    );
    const efficiencies = candidates.map((candidate) => candidate.efficiency);
    const paces = candidates.map((candidate) => candidate.paceSecPerKm);
    const heartRates = candidates
      .map((candidate) => candidate.avgHeartRate)
      .filter(isFiniteNumber);
    const powers = candidates
      .map((candidate) => candidate.avgPowerWatts)
      .filter(isFiniteNumber);

    return {
      block: blockDefinition.block,
      start_date: addDaysToDateText(input.referenceDate, -blockDefinition.maxAgeDays),
      end_date: addDaysToDateText(input.referenceDate, -blockDefinition.minAgeDays),
      sample_count: candidates.length,
      efficiency:
        efficiencies.length > 0 ? roundToThousandth(mean(efficiencies)) : null,
      avg_pace_sec_per_km: paces.length > 0 ? Math.round(mean(paces)) : null,
      avg_heart_rate:
        heartRates.length > 0 ? Math.round(mean(heartRates)) : null,
      avg_power_watts: powers.length > 0 ? Math.round(mean(powers)) : null,
    };
  });
}

function classifyAerobicEfficiencyTrend(
  blockSummaries: PlanGenerationAerobicEfficiencySummary["block_summaries"],
): PlanGenerationAerobicEfficiencyTrend {
  const oldComparison = getAerobicEfficiencyBlockComparison(
    blockSummaries,
    "0_14_days",
    "29_42_days",
  );
  const middleComparison = getAerobicEfficiencyBlockComparison(
    blockSummaries,
    "0_14_days",
    "15_28_days",
  );
  const oldToMiddleComparison = getAerobicEfficiencyBlockComparison(
    blockSummaries,
    "15_28_days",
    "29_42_days",
  );
  const priorComparisons = [oldComparison, middleComparison].filter(
    isFiniteNumber,
  );

  if (priorComparisons.length === 0) {
    return "unknown";
  }

  if (oldComparison !== null && middleComparison !== null) {
    if (
      (oldComparison > aerobicEfficiencyThresholdPercent &&
        middleComparison >= -aerobicEfficiencyThresholdPercent) ||
      (oldToMiddleComparison !== null &&
        oldToMiddleComparison > aerobicEfficiencyThresholdPercent &&
        middleComparison > aerobicEfficiencyThresholdPercent)
    ) {
      return "improving";
    }

    if (
      (oldComparison < -aerobicEfficiencyThresholdPercent &&
        middleComparison < -aerobicEfficiencyThresholdPercent) ||
      (oldToMiddleComparison !== null &&
        oldToMiddleComparison < -aerobicEfficiencyThresholdPercent &&
        middleComparison < -aerobicEfficiencyThresholdPercent)
    ) {
      return "declining";
    }

    if (
      Math.abs(oldComparison) <= aerobicEfficiencyThresholdPercent &&
      Math.abs(middleComparison) <= aerobicEfficiencyThresholdPercent
    ) {
      return "stable";
    }

    return "noisy";
  }

  const comparison = priorComparisons[0];

  if (comparison > aerobicEfficiencyThresholdPercent) {
    return "improving";
  }

  if (comparison < -aerobicEfficiencyThresholdPercent) {
    return "declining";
  }

  return "stable";
}

function getAerobicEfficiencyConfidence(input: {
  method: Exclude<PlanGenerationAerobicEfficiencyMethod, "unknown">;
  trend: PlanGenerationAerobicEfficiencyTrend;
  blockSummaries: PlanGenerationAerobicEfficiencySummary["block_summaries"];
}): PlanGenerationAerobicEfficiencyConfidence {
  if (input.trend === "unknown") {
    return "unknown";
  }

  if (input.method === "pace_only") {
    return "low";
  }

  const sampledBlocks = input.blockSummaries.filter(
    (summary) => summary.sample_count > 0,
  );
  const blocksWithTwoSamples = sampledBlocks.filter(
    (summary) => summary.sample_count >= 2,
  );

  if (
    blocksWithTwoSamples.length >= 2 &&
    blocksWithTwoSamples.some((summary) => summary.block === "0_14_days")
  ) {
    return "high";
  }

  return "medium";
}

function getAerobicEfficiencyBlockComparison(
  blockSummaries: PlanGenerationAerobicEfficiencySummary["block_summaries"],
  newerBlock: PlanGenerationAerobicEfficiencyBlockLabel,
  olderBlock: PlanGenerationAerobicEfficiencyBlockLabel,
): number | null {
  const newer = blockSummaries.find((summary) => summary.block === newerBlock);
  const older = blockSummaries.find((summary) => summary.block === olderBlock);

  if (
    !newer?.efficiency ||
    !older?.efficiency ||
    older.efficiency <= 0
  ) {
    return null;
  }

  return roundToTenth(((newer.efficiency - older.efficiency) / older.efficiency) * 100);
}

function buildUnknownAerobicEfficiencyTrendResult(
  referenceDate: string | null,
): AerobicEfficiencyTrendResult {
  return {
    trend: "unknown",
    confidence: "unknown",
    method: "unknown",
    block_summaries: referenceDate
      ? buildAerobicEfficiencyBlockSummaries({
          candidates: [],
          referenceDate,
        })
      : [],
    recent_vs_old_percent: null,
    recent_vs_middle_percent: null,
  };
}

function getAerobicEfficiencyFitnessAdjustment(input: {
  summary: AerobicEfficiencyTrendResult;
  baseFitnessConfidence: TrainingEvidenceConfidence;
  runnerProfile: RunnerProfile;
  raceGoal: RaceGoal;
  historyMetrics: ReturnType<typeof buildHistoryMetricsFromWeeks> | ReturnType<typeof buildFallbackHistoryMetrics>;
  durabilityMetrics: ReturnType<typeof buildDurabilityMetrics>;
  thresholdEstimateSource: ThresholdEstimateSource;
}): PlanGenerationFitnessConfidenceAdjustment {
  const noChange = (
    reason: string | null = null,
  ): PlanGenerationFitnessConfidenceAdjustment => ({
    direction: "none",
    from: input.baseFitnessConfidence,
    to: input.baseFitnessConfidence,
    reason,
  });

  if (
    input.summary.method === "pace_only" ||
    input.summary.method === "unknown" ||
    input.summary.confidence === "low" ||
    input.summary.confidence === "unknown"
  ) {
    return noChange();
  }

  if (input.summary.trend === "improving") {
    if (
      input.baseFitnessConfidence === "high" ||
      !canUpgradeFitnessConfidenceFromAerobicTrend(input)
    ) {
      return noChange();
    }

    return {
      direction: "upgraded",
      from: input.baseFitnessConfidence,
      to: upgradeFitnessConfidence(input.baseFitnessConfidence),
      reason: "Improving HR/power-normalized aerobic efficiency with strong guardrails.",
    };
  }

  if (input.summary.trend === "declining") {
    if (
      input.baseFitnessConfidence === "low" ||
      input.thresholdEstimateSource === "race_time_trial"
    ) {
      return noChange();
    }

    return {
      direction: "downgraded",
      from: input.baseFitnessConfidence,
      to: downgradeFitnessConfidence(input.baseFitnessConfidence),
      reason: "Declining HR/power-normalized aerobic efficiency.",
    };
  }

  return noChange();
}

function canUpgradeFitnessConfidenceFromAerobicTrend(input: {
  runnerProfile: RunnerProfile;
  raceGoal: RaceGoal;
  historyMetrics: ReturnType<typeof buildHistoryMetricsFromWeeks> | ReturnType<typeof buildFallbackHistoryMetrics>;
  durabilityMetrics: ReturnType<typeof buildDurabilityMetrics>;
  thresholdEstimateSource: ThresholdEstimateSource;
}): boolean {
  return (
    input.historyMetrics.completedWeeks6w >= 6 &&
    input.historyMetrics.loadConsistency >= 0.75 &&
    input.durabilityMetrics.durabilityTrend === "stable" &&
    !input.runnerProfile.current_pain_or_injury &&
    !input.runnerProfile.serious_recent_injury &&
    input.thresholdEstimateSource !== "missing" &&
    !hasLowTrainingBaseForRace(input.historyMetrics.avgKm6w, input.raceGoal.distance)
  );
}

function upgradeFitnessConfidence(
  confidence: TrainingEvidenceConfidence,
): TrainingEvidenceConfidence {
  if (confidence === "low") {
    return "medium";
  }

  return "high";
}

function downgradeFitnessConfidence(
  confidence: TrainingEvidenceConfidence,
): TrainingEvidenceConfidence {
  if (confidence === "high") {
    return "medium";
  }

  return "low";
}

function hasLowTrainingBaseForRace(
  avgKm6w: number,
  raceDistance: RaceDistance,
): boolean {
  return raceDistance === "marathon" ? avgKm6w < 30 : avgKm6w < 20;
}

function getAerobicEfficiencyBlock(input: {
  workoutDate: string;
  referenceDate: string;
}): PlanGenerationAerobicEfficiencyBlockLabel | null {
  const ageDays = getDateDiffDays(input.workoutDate, input.referenceDate);

  return (
    aerobicEfficiencyBlocks.find(
      (block) => ageDays >= block.minAgeDays && ageDays <= block.maxAgeDays,
    )?.block ?? null
  );
}

function getFitnessAnchorReferenceDate(input: {
  sixWeekHistory: RecentTrainingWeekInput[] | null;
  workouts: LoggedWorkout[];
}): string | null {
  if (input.sixWeekHistory && input.sixWeekHistory.length > 0) {
    return input.sixWeekHistory[input.sixWeekHistory.length - 1].week_end_date;
  }

  return input.workouts.reduce<string | null>(
    (latestDate, workout) =>
      latestDate === null || workout.workout_date > latestDate
        ? workout.workout_date
        : latestDate,
    null,
  );
}

function selectFitnessAnchor(input: {
  workouts: LoggedWorkout[];
  effortClassifications: WorkoutEffortClassification[];
  stravaEvidenceByActivityId: Map<string, StravaActivityEvidence>;
  anchorReferenceDate: string | null;
}): {
  selected: FitnessAnchorCandidate | null;
  recencyWeightingChangedSelection: boolean;
} {
  const candidates = buildFitnessAnchorCandidates(input);
  const selected = getBestFitnessAnchorCandidate(candidates, true);
  const unweightedSelected = getBestFitnessAnchorCandidate(candidates, false);

  return {
    selected,
    recencyWeightingChangedSelection:
      Boolean(selected && unweightedSelected) &&
      selected?.workout.id !== unweightedSelected?.workout.id,
  };
}

function buildFitnessAnchorCandidates(input: {
  workouts: LoggedWorkout[];
  effortClassifications: WorkoutEffortClassification[];
  stravaEvidenceByActivityId: Map<string, StravaActivityEvidence>;
  anchorReferenceDate: string | null;
}): FitnessAnchorCandidate[] {
  const workoutsById = new Map(
    input.workouts.map((workout) => [workout.id, workout]),
  );
  const candidates: FitnessAnchorCandidate[] = [];

  for (const classification of input.effortClassifications) {
    const workout = workoutsById.get(classification.loggedWorkoutId) ?? null;
    const anchorSource = getThresholdSourceForAnchorQuality(classification.quality);

    if (
      !workout ||
      !anchorSource ||
      workout.avg_pace_sec_per_km === null ||
      !isLongEnoughForFitnessAnchor(workout)
    ) {
      continue;
    }

    const stravaEvidence = getMatchingStravaEvidence(
      workout,
      input.stravaEvidenceByActivityId,
    );
    const recency = getFitnessAnchorRecency({
      workoutDate: workout.workout_date,
      referenceDate: input.anchorReferenceDate,
    });
    const effortQualityScore = getEffortQualityScore(classification.quality);
    const sourceQualityScore = getSourceQualityScore({
      workout,
      classification,
      stravaEvidence,
    });
    const dataConfidenceScore = getDataConfidenceScore({
      workout,
      stravaEvidence,
    });
    const unweightedScore = roundToHundredth(
      effortQualityScore * sourceQualityScore * dataConfidenceScore,
    );
    const weightedScore = roundToHundredth(
      unweightedScore * recency.weight,
    );

    candidates.push({
      workout,
      classification,
      source: anchorSource.source,
      multiplier: anchorSource.multiplier,
      recencyBucket: recency.bucket,
      recencyWeight: recency.weight,
      effortQualityScore,
      sourceQualityScore,
      dataConfidenceScore,
      weightedScore,
      unweightedScore,
    });
  }

  return candidates;
}

function getBestFitnessAnchorCandidate(
  candidates: FitnessAnchorCandidate[],
  useRecencyWeight: boolean,
): FitnessAnchorCandidate | null {
  return candidates.reduce<FitnessAnchorCandidate | null>((best, candidate) => {
    if (!best) {
      return candidate;
    }

    return compareFitnessAnchorCandidates(
      candidate,
      best,
      useRecencyWeight,
    ) > 0
      ? candidate
      : best;
  }, null);
}

function compareFitnessAnchorCandidates(
  left: FitnessAnchorCandidate,
  right: FitnessAnchorCandidate,
  useRecencyWeight: boolean,
): number {
  const leftScore = useRecencyWeight ? left.weightedScore : left.unweightedScore;
  const rightScore = useRecencyWeight ? right.weightedScore : right.unweightedScore;

  if (leftScore !== rightScore) {
    return leftScore - rightScore;
  }

  const qualityDifference =
    getEffortQualityScore(left.classification.quality) -
    getEffortQualityScore(right.classification.quality);

  if (qualityDifference !== 0) {
    return qualityDifference;
  }

  const leftPace = left.workout.avg_pace_sec_per_km ?? Number.MAX_SAFE_INTEGER;
  const rightPace = right.workout.avg_pace_sec_per_km ?? Number.MAX_SAFE_INTEGER;

  if (leftPace !== rightPace) {
    return rightPace - leftPace;
  }

  if (left.recencyWeight !== right.recencyWeight) {
    return left.recencyWeight - right.recencyWeight;
  }

  return left.workout.workout_date.localeCompare(right.workout.workout_date);
}

function getThresholdSourceForAnchorQuality(
  quality: EffortQuality,
): { source: FitnessAnchorCandidate["source"]; multiplier: number } | null {
  if (quality === "race_time_trial") {
    return { source: "race_time_trial", multiplier: 1.02 };
  }

  if (quality === "possible_near_max") {
    return { source: "near_max_effort", multiplier: 1.04 };
  }

  if (quality === "hard_workout") {
    return { source: "hard_workout", multiplier: 1.08 };
  }

  return null;
}

function getFitnessAnchorRecency(input: {
  workoutDate: string;
  referenceDate: string | null;
}): {
  bucket: PlanGenerationFitnessAnchorRecencyBucket;
  weight: number;
} {
  const ageDays =
    input.referenceDate !== null
      ? Math.max(0, getDateDiffDays(input.workoutDate, input.referenceDate))
      : 0;

  if (ageDays <= 14) {
    return { bucket: "0_14_days", weight: 1 };
  }

  if (ageDays <= 28) {
    return { bucket: "15_28_days", weight: 0.85 };
  }

  return { bucket: "29_42_days", weight: 0.7 };
}

function getEffortQualityScore(quality: EffortQuality): number {
  if (quality === "race_time_trial") {
    return 1;
  }

  if (quality === "possible_near_max") {
    return 0.88;
  }

  if (quality === "hard_workout") {
    return 0.74;
  }

  if (quality === "controlled") {
    return 0.52;
  }

  return 0.2;
}

function getSourceQualityScore(input: {
  workout: LoggedWorkout;
  classification: WorkoutEffortClassification;
  stravaEvidence: StravaActivityEvidence | null;
}): number {
  if (
    input.classification.quality === "race_time_trial" &&
    input.classification.evidence.some((evidence) =>
      evidence.includes("race/time-trial effort signal"),
    )
  ) {
    return 1;
  }

  if (input.stravaEvidence?.hasDetail && input.stravaEvidence.hasStreams) {
    return 0.95;
  }

  if (input.stravaEvidence?.hasDetail || input.stravaEvidence?.hasStreams) {
    return 0.9;
  }

  if (input.workout.source === "strava" || input.stravaEvidence) {
    return 0.82;
  }

  if (input.classification.evidence.length > 0) {
    return 0.78;
  }

  return 0.7;
}

function getDataConfidenceScore(input: {
  workout: LoggedWorkout;
  stravaEvidence: StravaActivityEvidence | null;
}): number {
  let score = 0.85;

  if (
    input.workout.avg_heart_rate !== null ||
    input.workout.max_heart_rate !== null ||
    input.stravaEvidence?.hasHeartRateStream
  ) {
    score += 0.08;
  }

  if (input.stravaEvidence?.hasPowerStream) {
    score += 0.08;
  }

  if (
    input.stravaEvidence?.paceFadePercent != null ||
    input.stravaEvidence?.heartRateDriftPercent != null ||
    input.stravaEvidence?.negativeSplit != null ||
    input.stravaEvidence?.splitPaceVariationPercent != null
  ) {
    score += 0.08;
  }

  if (
    (input.stravaEvidence?.prCount ?? 0) > 0 ||
    (input.stravaEvidence?.bestEffortCount ?? 0) > 0 ||
    (input.stravaEvidence?.achievementCount ?? 0) > 0
  ) {
    score += 0.1;
  }

  return roundToHundredth(clamp(score, 0.85, 1.15));
}

function getDurabilityTrend(input: {
  maxLongRunShare6w: number | null;
  paceFadeValues: number[];
  heartRateDriftValues: number[];
  longestRunToGoalDistanceRatio: number;
  raceDistance: RaceDistance;
  historySource: TrainingHistorySource;
  evidenceCount: number;
}): DurabilityTrend {
  const maxPaceFade = getMaxOrZero(input.paceFadeValues);
  const maxHeartRateDrift = getMaxOrZero(input.heartRateDriftValues);

  if (
    input.evidenceCount === 0 &&
    input.historySource === "fallback_estimate"
  ) {
    return "unknown";
  }

  if (
    (input.maxLongRunShare6w !== null && input.maxLongRunShare6w > 0.55) ||
    maxPaceFade >= 10 ||
    maxHeartRateDrift >= 10
  ) {
    return "poor";
  }

  if (
    (input.maxLongRunShare6w !== null && input.maxLongRunShare6w > 0.42) ||
    maxPaceFade >= 6 ||
    maxHeartRateDrift >= 6 ||
    (input.raceDistance === "marathon" &&
      input.longestRunToGoalDistanceRatio < 0.35)
  ) {
    return "caution";
  }

  return "stable";
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

function hasRaceTimeTrialNote(notes: string): boolean {
  return /\b(race|time trial|tt)\b/.test(notes);
}

function hasHardWorkoutNote(notes: string): boolean {
  return /\b(tempo|threshold|interval|workout|hard|progression)\b/.test(notes);
}

function hasWorkoutContextSignal(notes: string): boolean {
  return /\b(race|time trial|tt|all out|max effort|near max|pr|pb|tempo|threshold|interval|workout|hard|progression|fartlek)\b/i.test(notes);
}

function hasAggressiveGoalSignal(
  runnerProfile: RunnerProfile,
  raceGoal: RaceGoal,
): boolean {
  return (
    runnerProfile.training_aggressiveness === "aggressive" ||
    runnerProfile.training_aggressiveness === "very_aggressive" ||
    raceGoal.target_priority === "aggressive" ||
    (raceGoal.race_priority === "A" && raceGoal.target_finish_time_sec !== null)
  );
}

function isReliableAerobicPace(paceSecPerKm: number): boolean {
  return Number.isFinite(paceSecPerKm) && paceSecPerKm >= 180 && paceSecPerKm <= 900;
}

function isValidAerobicHeartRate(heartRate: number | null): heartRate is number {
  return heartRate !== null && heartRate >= 80 && heartRate <= 210;
}

function isValidAerobicPower(powerWatts: number | null): powerWatts is number {
  return powerWatts !== null && powerWatts >= 50 && powerWatts <= 700;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function addDaysToDateText(dateText: string, days: number): string {
  const date = parseDateOnly(dateText);
  date.setDate(date.getDate() + days);

  return formatDateOnly(date);
}

function getDateDiffDays(startDateText: string, endDateText: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.round(
    (parseDateOnly(endDateText).getTime() - parseDateOnly(startDateText).getTime()) /
      millisecondsPerDay,
  );
}

function parseDateOnly(dateText: string): Date {
  const [year, month, day] = dateText.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 10) / 10;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToThousandth(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getMedian(values: number[]): number {
  const middleIndex = Math.floor(values.length / 2);

  return values.length % 2 === 0
    ? (values[middleIndex - 1] + values[middleIndex]) / 2
    : values[middleIndex];
}

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return roundToTenth(values.reduce((total, value) => total + value, 0) / values.length);
}

function getMaxOrZero(values: number[]): number {
  return values.length > 0 ? Math.max(...values) : 0;
}

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatRaceDistance(raceDistance: RaceDistance): string {
  return raceDistance === "marathon" ? "marathon" : "half marathon";
}
