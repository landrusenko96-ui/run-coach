import { getEffectiveRunningDaysPerWeek } from "./runningDays.ts";
import { getLocalDateText } from "./planStart.ts";
import { buildStructuredWorkout } from "./structuredWorkout.ts";
import type {
  GeneratedPlannedWorkout,
  GeneratedTrainingPlan,
  RaceDistance,
  RaceGoal,
  RecentTrainingWeekInput,
  RunnerProfile,
  RunningDaysPerWeek,
  TerrainAvailable,
  TrainingAggressiveness,
  TrainingDay,
  WorkoutType,
} from "@/types/training";

type PlanGeneratorOptions = {
  startDate?: string;
  recentHistory?: RecentTrainingWeekInput[];
};

type PlanMode = "relaxed" | "moderate" | "aggressive" | "very_aggressive";

type RacePriority = "A" | "B" | "casual";

type GoalFlexibility = "fixed" | "flexible" | "finish_only";

type FitnessConfidence = "low" | "medium" | "high";

type GoalFeasibilityRating =
  | "finish_only"
  | "realistic"
  | "ambitious"
  | "very_ambitious"
  | "low_confidence"
  | "not_credible";

type VolumeCategory =
  | "low_base"
  | "developing"
  | "intermediate"
  | "strong_hobby"
  | "advanced_hobby";

type FrequencyCategory =
  | "minimal"
  | "basic_structured"
  | "standard_performance"
  | "advanced_hobby";

type PhaseLabel = "base" | "build" | "specific" | "peak" | "taper" | "race_prep";

type GoalProfile = {
  raceType: RaceDistance;
  raceDate: string;
  targetFinishTimeSec: number | null;
  racePriority: RacePriority;
  goalFlexibility: GoalFlexibility;
  planMode: PlanMode;
};

type AvailabilityProfile = {
  availableRunsPerWeek: RunningDaysPerWeek;
  maximumTrainingDaysPerWeek: number;
  availableTrainingDays: TrainingDay[];
  selectedRunningDays: TrainingDay[];
  preferredLongRunDay: TrainingDay | null;
  longRunDay: TrainingDay;
  unavailableDays: TrainingDay[];
  maximumWeekdaySessionDurationMin: number | null;
  maximumWeekendSessionDurationMin: number | null;
};

type AthleteProfile = {
  age: number | null;
  sex: RunnerProfile["sex"];
  heightCm: number | null;
  weightKg: number | null;
  easyPaceSecPerKm: number | null;
  thresholdPaceSecPerKm: number | null;
  injurySignal: "none" | "note" | "current_or_serious";
};

type EnvironmentProfile = {
  terrainAvailable: TerrainAvailable[];
  flatRoutesAvailable: boolean;
  hillsAvailable: boolean;
  treadmillAvailable: boolean;
  trailAccess: boolean;
  raceCourseProfileKnown: boolean;
  raceCourseLooksHilly: boolean;
};

type RecentTrainingHistory = {
  avgKm6w: number;
  avgTimeMin6w: number | null;
  medianKm6w: number;
  maxWeekKm6w: number;
  minNonzeroWeekKm6w: number;
  runsPerWeek6w: number;
  loadConsistency: number;
  recentRamp: number;
  longestRunKm6w: number;
  longestRunDurationMin6w: number | null;
  source:
    | "assembled_six_week_history"
    | "manual_six_week_history"
    | "self_reported_profile"
    | "fallback_estimate";
};

type DerivedMetrics = {
  volumeCategory: VolumeCategory;
  frequencyCategory: FrequencyCategory;
  startLoadKm: number;
  peakLoadKm: number;
  easySecPerKm: number;
  thresholdSecPerKm: number;
  currentRacePaceSecPerKm: number;
  goalRacePaceSecPerKm: number | null;
  bridgeRacePaceSecPerKm: number;
  feasibilityRating: GoalFeasibilityRating;
  fitnessConfidence: FitnessConfidence;
  taperWeeks: number;
  cutbackIntervalWeeks: number;
  weeklyIncreaseCap: number;
  initialLongRunKm: number;
  peakLongRunKm: number;
};

type NormalizedPlanInput = {
  profileId: string;
  raceGoalId: string;
  goal: GoalProfile;
  availability: AvailabilityProfile;
  athlete: AthleteProfile;
  environment: EnvironmentProfile;
  history: RecentTrainingHistory;
  assumptions: string[];
  warnings: string[];
};

type WeekPlan = {
  weekNumber: number;
  phase: PhaseLabel;
  volumeKm: number;
  longRunKm: number;
  isCutback: boolean;
  isTaper: boolean;
  isRaceWeek: boolean;
};

type PlannedDay = {
  date: Date;
  dateText: string;
  dayLabel: TrainingDay;
  weekNumber: number;
};

type WorkoutPrescription = PlannedDay & {
  workoutType: WorkoutType;
  title: string;
  description: string;
  distanceKm: number | null;
  durationMin: number | null;
  targetPaceMinSecPerKm: number | null;
  targetPaceMaxSecPerKm: number | null;
  targetHrZone: string | null;
  terrain: TerrainAvailable | null;
  purpose: string;
  instructions: string;
};

type PaceRange = {
  minSecPerKm: number;
  maxSecPerKm: number;
};

type WeekWorkoutDraft = {
  day: PlannedDay;
  workoutType: WorkoutType;
  role:
    | "calibration"
    | "easy"
    | "recovery"
    | "medium_long"
    | "steady"
    | "threshold"
    | "interval"
    | "race_pace"
    | "long_easy"
    | "long_steady"
    | "long_race_specific"
    | "race_day"
    | "rest"
    | "strength";
  stress: "none" | "easy" | "moderate" | "hard";
  title: string;
};

const dayOrder: TrainingDay[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const fallbackTrainingDaysByCount: Record<RunningDaysPerWeek, TrainingDay[]> = {
  2: ["tuesday", "saturday"],
  3: ["tuesday", "thursday", "saturday"],
  4: ["monday", "wednesday", "friday", "saturday"],
  5: ["monday", "tuesday", "wednesday", "friday", "saturday"],
  6: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
};

const defaultTerrain: TerrainAvailable[] = ["flat", "treadmill"];

const distanceKmByRace: Record<RaceDistance, number> = {
  marathon: 42.2,
  half_marathon: 21.1,
};

const runWorkoutTypes = new Set<WorkoutType>([
  "calibration",
  "easy",
  "long_run",
  "tempo",
  "interval",
  "marathon_pace",
  "recovery",
]);

export function generateTrainingPlan(
  runnerProfile: RunnerProfile,
  raceGoal: RaceGoal,
  options: PlanGeneratorOptions = {},
): GeneratedTrainingPlan {
  if (raceGoal.distance !== "marathon" && raceGoal.distance !== "half_marathon") {
    throw new Error("Plan Generator v1 only supports marathon and half marathon goals.");
  }

  const startDateText = options.startDate ?? getLocalDateText();
  validateGeneratorDates({
    startDateText,
    raceDateText: raceGoal.race_date,
  });

  const startDate = parseDateOnly(startDateText);
  const raceDate = parseDateOnly(raceGoal.race_date);
  const totalWeeks = Math.max(1, Math.ceil((daysBetween(startDate, raceDate) + 1) / 7));
  const normalizedInput = normalizePlanInput({
    runnerProfile,
    raceGoal,
    startDate,
    recentHistory: options.recentHistory,
  });
  const derivedMetrics = deriveMetrics({
    input: normalizedInput,
    totalWeeks,
  });
  const weekPlans = buildWeekPlans({
    totalWeeks,
    raceDistance: normalizedInput.goal.raceType,
    planMode: normalizedInput.goal.planMode,
    metrics: derivedMetrics,
  });
  const plannedDays = buildPlannedDays(startDate, raceDate);
  const prescriptions = buildWorkoutPrescriptions({
    input: normalizedInput,
    metrics: derivedMetrics,
    weekPlans,
    plannedDays,
  });
  const plannedWorkouts = prescriptions.map((prescription) =>
    buildGeneratedWorkout({
      prescription,
      profileId: normalizedInput.profileId,
      raceGoalId: normalizedInput.raceGoalId,
    }),
  );

  addPlanSummaryWarnings({
    input: normalizedInput,
    metrics: derivedMetrics,
    weekPlans,
  });

  return {
    trainingPlan: {
      profile_id: runnerProfile.id,
      race_goal_id: raceGoal.id,
      name: buildDefaultTrainingPlanName(raceGoal),
      status: "paused",
      start_date: formatDateOnly(startDate),
      end_date: raceGoal.race_date,
      total_weeks: totalWeeks,
      assumptions: normalizedInput.assumptions,
      warnings: normalizedInput.warnings,
      generated_by: "rule_based_v1",
    },
    plannedWorkouts,
  };
}

function normalizePlanInput(input: {
  runnerProfile: RunnerProfile;
  raceGoal: RaceGoal;
  startDate: Date;
  recentHistory?: RecentTrainingWeekInput[];
}): NormalizedPlanInput {
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const planMode = getPlanMode(input.runnerProfile.training_aggressiveness);
  const effectiveRunningDaysPerWeek = getEffectiveRunningDaysPerWeek(
    input.runnerProfile,
  );
  const availableTrainingDays = getAvailableTrainingDays(
    input.runnerProfile,
    effectiveRunningDaysPerWeek,
    assumptions,
    warnings,
  );
  const selectedRunningDays = selectRunningDaysForPlan({
    availableTrainingDays,
    runningDaysPerWeek: effectiveRunningDaysPerWeek,
    preferredLongRunDay: input.runnerProfile.preferred_long_run_day,
  });
  const longRunDay = getLongRunDay(
    input.runnerProfile,
    selectedRunningDays,
    assumptions,
  );
  const terrainAvailable = getTerrainAvailable(input.runnerProfile, assumptions);
  const athlete = buildAthleteProfile(input.runnerProfile, input.startDate, warnings);
  let normalizedPlanMode = planMode;

  if (
    athlete.injurySignal === "current_or_serious" &&
    isAggressivePlanMode(normalizedPlanMode)
  ) {
    normalizedPlanMode = "relaxed";
    warnings.push(
      "Injury notes look current or serious, so aggressive mode is blocked and the generated plan uses relaxed load progression.",
    );
  }

  if (
    !input.runnerProfile.maximum_weekday_session_duration_min &&
    !input.runnerProfile.maximum_weekend_session_duration_min
  ) {
    assumptions.push(
      "Maximum weekday and weekend session durations are missing, so session duration is treated as uncapped.",
    );
  }

  return {
    profileId: input.runnerProfile.id,
    raceGoalId: input.raceGoal.id,
    goal: {
      raceType: input.raceGoal.distance,
      raceDate: input.raceGoal.race_date,
      targetFinishTimeSec: input.raceGoal.target_finish_time_sec,
      racePriority: getRacePriority(input.raceGoal),
      goalFlexibility: getGoalFlexibility(input.raceGoal),
      planMode: normalizedPlanMode,
    },
    availability: {
      availableRunsPerWeek: effectiveRunningDaysPerWeek,
      maximumTrainingDaysPerWeek: selectedRunningDays.length,
      availableTrainingDays,
      selectedRunningDays,
      preferredLongRunDay: input.runnerProfile.preferred_long_run_day,
      longRunDay,
      unavailableDays: dayOrder.filter((day) => !selectedRunningDays.includes(day)),
      maximumWeekdaySessionDurationMin:
        input.runnerProfile.maximum_weekday_session_duration_min,
      maximumWeekendSessionDurationMin:
        input.runnerProfile.maximum_weekend_session_duration_min,
    },
    athlete,
    environment: {
      terrainAvailable,
      flatRoutesAvailable: terrainAvailable.includes("flat") || terrainAvailable.includes("track"),
      hillsAvailable: terrainAvailable.includes("hills"),
      treadmillAvailable: terrainAvailable.includes("treadmill"),
      trailAccess: terrainAvailable.includes("trails"),
      raceCourseProfileKnown:
        Boolean(input.raceGoal.race_course_profile) ||
        Boolean(input.raceGoal.course_elevation_notes?.trim()),
      raceCourseLooksHilly:
        input.raceGoal.race_course_profile === "hilly" ||
        input.raceGoal.race_course_profile === "mountainous" ||
        hasHillSignal(input.raceGoal.course_elevation_notes),
    },
    history: buildRecentTrainingHistory({
      runnerProfile: input.runnerProfile,
      raceDistance: input.raceGoal.distance,
      runningDaysPerWeek: selectedRunningDays.length,
      recentHistory: input.recentHistory,
      assumptions,
      warnings,
    }),
    assumptions,
    warnings,
  };
}

function getPlanMode(
  trainingAggressiveness: TrainingAggressiveness | "conservative" | "balanced",
): PlanMode {
  if (trainingAggressiveness === "conservative") {
    return "relaxed";
  }

  if (trainingAggressiveness === "balanced") {
    return "moderate";
  }

  return trainingAggressiveness;
}

function isAggressivePlanMode(planMode: PlanMode): boolean {
  return planMode === "aggressive" || planMode === "very_aggressive";
}

function getRacePriority(raceGoal: RaceGoal): RacePriority {
  if (raceGoal.race_priority) {
    return raceGoal.race_priority;
  }

  if (raceGoal.target_priority === "aggressive") {
    return "A";
  }

  if (raceGoal.target_priority === "personal_best") {
    return "B";
  }

  return "casual";
}

function getGoalFlexibility(raceGoal: RaceGoal): GoalFlexibility {
  if (raceGoal.goal_flexibility) {
    return raceGoal.goal_flexibility;
  }

  if (raceGoal.target_finish_time_sec === null || raceGoal.target_priority === "finish") {
    return raceGoal.target_finish_time_sec === null ? "finish_only" : "flexible";
  }

  return raceGoal.target_priority === "aggressive" ? "fixed" : "flexible";
}

function buildAthleteProfile(
  runnerProfile: RunnerProfile,
  startDate: Date,
  warnings: string[],
): AthleteProfile {
  const age = runnerProfile.birth_year
    ? Math.max(0, startDate.getFullYear() - runnerProfile.birth_year)
    : null;
  const injurySignal =
    runnerProfile.current_pain_or_injury || runnerProfile.serious_recent_injury
      ? "current_or_serious"
      : getInjurySignal(
          [runnerProfile.injury_notes, runnerProfile.injury_risk_notes]
            .filter(Boolean)
            .join(" "),
        );

  if (injurySignal === "note") {
    warnings.push(
      "Injury notes are present, but they do not look like a clear current-pain signal. The plan adds caution without treating the runner as injured.",
    );
  }

  if (injurySignal === "current_or_serious") {
    warnings.push(
      "Injury notes mention current pain, serious injury, or a high-risk area. The plan uses conservative progression and avoids stacking stress.",
    );
  }

  return {
    age,
    sex: runnerProfile.sex,
    heightCm: runnerProfile.height_cm,
    weightKg: runnerProfile.weight_kg,
    easyPaceSecPerKm: runnerProfile.easy_pace_sec_per_km,
    thresholdPaceSecPerKm: runnerProfile.threshold_pace_sec_per_km,
    injurySignal,
  };
}

function getInjurySignal(injuryNotes: string | null): AthleteProfile["injurySignal"] {
  if (!injuryNotes?.trim()) {
    return "none";
  }

  const normalizedNotes = injuryNotes.toLowerCase();
  const currentOrSeriousSignals = [
    "current pain",
    "pain while running",
    "hurts while running",
    "can't run",
    "cannot run",
    "injured now",
    "stress fracture",
    "fracture",
    "achilles",
    "plantar",
    "shin splint",
    "serious injury",
    "recent injury",
  ];

  return currentOrSeriousSignals.some((signal) => normalizedNotes.includes(signal))
    ? "current_or_serious"
    : "note";
}

function buildRecentTrainingHistory(input: {
  runnerProfile: RunnerProfile;
  raceDistance: RaceDistance;
  runningDaysPerWeek: number;
  recentHistory?: RecentTrainingWeekInput[];
  assumptions: string[];
  warnings: string[];
}): RecentTrainingHistory {
  const recentHistory = buildHistoryFromRecentWeeks(input.recentHistory);

  if (recentHistory) {
    input.assumptions.push(
      recentHistory.source === "manual_six_week_history"
        ? "Recent training load uses manually entered six-week history."
        : "Recent training load uses assembled app and Strava six-week history.",
    );

    return recentHistory;
  }

  const fallbackWeeklyKm = input.raceDistance === "marathon" ? 24 : 16;
  const currentWeeklyKm = input.runnerProfile.current_weekly_mileage_km;
  const hasCurrentMileage = currentWeeklyKm !== null && currentWeeklyKm > 0;
  const avgKm6w = hasCurrentMileage ? currentWeeklyKm : fallbackWeeklyKm;
  const easyPace = input.runnerProfile.easy_pace_sec_per_km ?? 390;
  const longestRunFallback = roundDistance(
    clamp(avgKm6w * 0.32, input.raceDistance === "marathon" ? 8 : 5, avgKm6w * 0.45),
  );
  const hasLongestRun =
    input.runnerProfile.longest_recent_run_km !== null &&
    input.runnerProfile.longest_recent_run_km > 0;
  const longestRunKm6w = hasLongestRun
    ? input.runnerProfile.longest_recent_run_km ?? longestRunFallback
    : longestRunFallback;

  if (!hasCurrentMileage) {
    input.assumptions.push(
      `Current weekly mileage is missing, so the generator uses ${fallbackWeeklyKm} km/week as a temporary ${formatRaceDistance(input.raceDistance)} baseline.`,
    );
    input.warnings.push(
      "Current weekly mileage is missing, so load, feasibility, and progression confidence are low.",
    );
  }

  if (!hasLongestRun) {
    input.assumptions.push(
      `Longest recent run is missing, so the generator estimates ${longestRunFallback} km from current weekly mileage.`,
    );
    input.warnings.push(
      "Longest recent run is missing, so long-run progression is estimated conservatively.",
    );
  }

  return {
    avgKm6w,
    avgTimeMin6w: Math.round((avgKm6w * easyPace) / 60),
    medianKm6w: avgKm6w,
    maxWeekKm6w: avgKm6w,
    minNonzeroWeekKm6w: avgKm6w,
    runsPerWeek6w: input.runningDaysPerWeek,
    loadConsistency: hasCurrentMileage ? 1 : 0.5,
    recentRamp: 1,
    longestRunKm6w,
    longestRunDurationMin6w: Math.round((longestRunKm6w * (easyPace + 30)) / 60),
    source: hasCurrentMileage && hasLongestRun ? "self_reported_profile" : "fallback_estimate",
  };
}

function buildHistoryFromRecentWeeks(
  weeks: RecentTrainingWeekInput[] | undefined,
): RecentTrainingHistory | null {
  if (!weeks || weeks.length !== 6 || weeks.some((week) => week.run_count <= 0)) {
    return null;
  }

  const distances = weeks.map((week) => Math.max(0, week.distance_km));
  const totalDistanceKm = distances.reduce((total, distance) => total + distance, 0);
  const durations = weeks.map((week) => week.duration_sec ?? 0);
  const totalDurationSec = durations.reduce((total, duration) => total + duration, 0);
  const longestRunKm6w = Math.max(
    ...weeks.map((week) => week.longest_run_km ?? 0),
    ...distances.map((distance) => distance * 0.4),
  );
  const longestRunDurationMin6w = Math.max(
    ...weeks.map((week) => week.longest_run_duration_sec ?? 0),
  );
  const avgKm6w = roundDistance(totalDistanceKm / 6);
  const sortedDistances = [...distances].sort((a, b) => a - b);
  const maxWeekKm6w = Math.max(...distances);
  const nonzeroDistances = distances.filter((distance) => distance > 0);
  const minNonzeroWeekKm6w =
    nonzeroDistances.length > 0 ? Math.min(...nonzeroDistances) : avgKm6w;
  const firstTwoWeekAvg = (distances[0] + distances[1]) / 2;
  const lastTwoWeekAvg = (distances[4] + distances[5]) / 2;
  const source =
    weeks.every((week) => week.source === "manual")
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
    loadConsistency:
      maxWeekKm6w > 0 ? clamp(minNonzeroWeekKm6w / maxWeekKm6w, 0.35, 1) : 0.5,
    recentRamp:
      firstTwoWeekAvg > 0
        ? clamp(lastTwoWeekAvg / firstTwoWeekAvg, 0.4, 2.5)
        : lastTwoWeekAvg > 0
          ? 2.5
          : 1,
    longestRunKm6w: roundDistance(longestRunKm6w),
    longestRunDurationMin6w:
      longestRunDurationMin6w > 0
        ? Math.round(longestRunDurationMin6w / 60)
        : null,
    source,
  };
}

function deriveMetrics(input: {
  input: NormalizedPlanInput;
  totalWeeks: number;
}): DerivedMetrics {
  const volumeCategory = getVolumeCategory(
    input.input.goal.raceType,
    input.input.history.avgKm6w,
  );
  const frequencyCategory = getFrequencyCategory(
    input.input.availability.selectedRunningDays.length,
  );
  const easySecPerKm = getEasyPace(input.input);
  const thresholdSecPerKm = getThresholdPace(input.input, easySecPerKm);
  const currentRacePaceSecPerKm = getCurrentRacePace({
    raceDistance: input.input.goal.raceType,
    thresholdSecPerKm,
    history: input.input.history,
    volumeCategory,
  });
  const goalRacePaceSecPerKm = input.input.goal.targetFinishTimeSec
    ? Math.round(
        input.input.goal.targetFinishTimeSec /
          distanceKmByRace[input.input.goal.raceType],
      )
    : null;
  const feasibilityRating = getGoalFeasibility({
    goalRacePaceSecPerKm,
    currentRacePaceSecPerKm,
    goalFlexibility: input.input.goal.goalFlexibility,
  });
  const fitnessConfidence = getFitnessConfidence(input.input);
  const startLoadKm = getStartLoadKm(input.input);
  const peakLoadKm = getPeakLoadKm({
    raceDistance: input.input.goal.raceType,
    planMode: input.input.goal.planMode,
    avgKm6w: input.input.history.avgKm6w,
    runDaysPerWeek: input.input.availability.selectedRunningDays.length,
    injurySignal: input.input.athlete.injurySignal,
    age: input.input.athlete.age,
  });
  const cutbackIntervalWeeks = getCutbackIntervalWeeks(input.input.goal.planMode);
  const taperWeeks = getTaperWeeks({
    raceDistance: input.input.goal.raceType,
    totalWeeks: input.totalWeeks,
    planMode: input.input.goal.planMode,
    volumeCategory,
    injurySignal: input.input.athlete.injurySignal,
  });
  const weeklyIncreaseCap = getWeeklyIncreaseCap({
    volumeCategory,
    planMode: input.input.goal.planMode,
    loadConsistency: input.input.history.loadConsistency,
    injurySignal: input.input.athlete.injurySignal,
    age: input.input.athlete.age,
  });
  const peakLongRunKm = getPeakLongRunKm({
    raceDistance: input.input.goal.raceType,
    volumeCategory,
    planMode: input.input.goal.planMode,
    peakLoadKm,
    easySecPerKm,
  });
  const initialLongRunKm = getInitialLongRunKm({
    raceDistance: input.input.goal.raceType,
    planMode: input.input.goal.planMode,
    volumeCategory,
    startLoadKm,
    peakLongRunKm,
    longestRunKm6w: input.input.history.longestRunKm6w,
  });

  addDerivedMetricMessages({
    input: input.input,
    feasibilityRating,
    fitnessConfidence,
    currentRacePaceSecPerKm,
    goalRacePaceSecPerKm,
    bridgeRacePaceSecPerKm: getBridgeRacePace(
      currentRacePaceSecPerKm,
      goalRacePaceSecPerKm,
      feasibilityRating,
    ),
    peakLoadKm,
    peakLongRunKm,
  });

  return {
    volumeCategory,
    frequencyCategory,
    startLoadKm,
    peakLoadKm,
    easySecPerKm,
    thresholdSecPerKm,
    currentRacePaceSecPerKm,
    goalRacePaceSecPerKm,
    bridgeRacePaceSecPerKm: getBridgeRacePace(
      currentRacePaceSecPerKm,
      goalRacePaceSecPerKm,
      feasibilityRating,
    ),
    feasibilityRating,
    fitnessConfidence,
    taperWeeks,
    cutbackIntervalWeeks,
    weeklyIncreaseCap,
    initialLongRunKm,
    peakLongRunKm,
  };
}

function getEasyPace(input: NormalizedPlanInput): number {
  if (input.athlete.easyPaceSecPerKm !== null) {
    return input.athlete.easyPaceSecPerKm;
  }

  input.assumptions.push(
    "No easy pace was saved, so easy and long-run targets assume 6:30 per km.",
  );

  return 390;
}

function getThresholdPace(
  input: NormalizedPlanInput,
  easySecPerKm: number,
): number {
  if (input.athlete.thresholdPaceSecPerKm !== null) {
    return input.athlete.thresholdPaceSecPerKm;
  }

  const estimatedThresholdPace = Math.round(easySecPerKm * 0.88);

  input.assumptions.push(
    `No threshold pace was saved, so quality workout targets estimate threshold at ${formatPaceLabel(estimatedThresholdPace)} per km from easy pace.`,
  );

  return estimatedThresholdPace;
}

function getCurrentRacePace(input: {
  raceDistance: RaceDistance;
  thresholdSecPerKm: number;
  history: RecentTrainingHistory;
  volumeCategory: VolumeCategory;
}): number {
  const baseMultiplier = input.raceDistance === "marathon" ? 1.18 : 1.08;
  const durabilityPenalty =
    input.raceDistance === "marathon" &&
    (input.volumeCategory === "low_base" || input.volumeCategory === "developing")
      ? 1.06
      : 1;
  const longRunSupportPenalty =
    input.raceDistance === "marathon" && input.history.longestRunKm6w < 18
      ? 1.04
      : 1;

  return Math.round(
    input.thresholdSecPerKm *
      baseMultiplier *
      durabilityPenalty *
      longRunSupportPenalty,
  );
}

function getGoalFeasibility(input: {
  goalRacePaceSecPerKm: number | null;
  currentRacePaceSecPerKm: number;
  goalFlexibility: GoalFlexibility;
}): GoalFeasibilityRating {
  if (input.goalRacePaceSecPerKm === null || input.goalFlexibility === "finish_only") {
    return "finish_only";
  }

  const improvementPct =
    (input.currentRacePaceSecPerKm - input.goalRacePaceSecPerKm) /
    input.currentRacePaceSecPerKm;

  if (improvementPct <= 0.03) {
    return "realistic";
  }

  if (improvementPct <= 0.07) {
    return "ambitious";
  }

  if (improvementPct <= 0.12) {
    return "very_ambitious";
  }

  if (improvementPct <= 0.18) {
    return "low_confidence";
  }

  return "not_credible";
}

function getFitnessConfidence(input: NormalizedPlanInput): FitnessConfidence {
  const hasPaces =
    input.athlete.easyPaceSecPerKm !== null &&
    input.athlete.thresholdPaceSecPerKm !== null;
  const hasLoadHistory = input.history.source === "self_reported_profile";

  if (hasPaces && hasLoadHistory) {
    return "high";
  }

  if (input.athlete.easyPaceSecPerKm !== null && input.history.avgKm6w > 0) {
    return "medium";
  }

  return "low";
}

function getStartLoadKm(input: NormalizedPlanInput): number {
  const consistencyMultiplier = input.history.loadConsistency < 0.75 ? 0.85 : 1;
  const modeMultiplier =
    input.goal.planMode === "relaxed"
      ? 0.95
      : isAggressivePlanMode(input.goal.planMode)
        ? 1.03
        : 1;
  const injuryMultiplier =
    input.athlete.injurySignal === "current_or_serious" ? 0.85 : 1;

  return Math.max(
    input.goal.raceType === "marathon" ? 16 : 10,
    Math.round(
      input.history.avgKm6w *
        consistencyMultiplier *
        modeMultiplier *
        injuryMultiplier,
    ),
  );
}

function getPeakLoadKm(input: {
  raceDistance: RaceDistance;
  planMode: PlanMode;
  avgKm6w: number;
  runDaysPerWeek: number;
  injurySignal: AthleteProfile["injurySignal"];
  age: number | null;
}): number {
  const [low, high] = getPeakLoadRange(input.raceDistance, input.avgKm6w, input.planMode);
  const modePosition =
    input.planMode === "relaxed"
      ? 0.35
      : input.planMode === "very_aggressive"
        ? 1
        : input.planMode === "aggressive"
          ? 0.9
          : 0.6;
  const rawPeak = low + (high - low) * modePosition;
  const sessionCapacityCap = input.runDaysPerWeek * getRealisticAverageSessionKm(input.avgKm6w);
  const ageLoadMultiplier = input.age !== null && input.age >= 55 ? 0.92 : input.age !== null && input.age >= 45 ? 0.96 : 1;
  const injuryLoadMultiplier = input.injurySignal === "current_or_serious" ? 0.85 : 1;

  return Math.max(
    Math.round(input.avgKm6w),
    Math.round(Math.min(rawPeak, sessionCapacityCap) * ageLoadMultiplier * injuryLoadMultiplier),
  );
}

function getPeakLoadRange(
  raceDistance: RaceDistance,
  avgKm6w: number,
  planMode: PlanMode,
): [number, number] {
  if (raceDistance === "marathon") {
    if (avgKm6w < 20) {
      return planMode === "relaxed" ? [30, 38] : planMode === "moderate" ? [35, 45] : [40, 50];
    }

    if (avgKm6w < 30) {
      return planMode === "relaxed" ? [35, 45] : planMode === "moderate" ? [45, 55] : [50, 65];
    }

    if (avgKm6w < 45) {
      return planMode === "relaxed" ? [45, 60] : planMode === "moderate" ? [55, 70] : [65, 80];
    }

    if (avgKm6w < 60) {
      return planMode === "relaxed" ? [60, 75] : planMode === "moderate" ? [70, 85] : [80, 95];
    }

    if (avgKm6w < 75) {
      return planMode === "relaxed" ? [75, 90] : planMode === "moderate" ? [85, 100] : [95, 115];
    }

    return planMode === "relaxed" ? [90, 110] : planMode === "moderate" ? [100, 125] : [115, 140];
  }

  if (avgKm6w < 15) {
    return planMode === "relaxed" ? [20, 30] : planMode === "moderate" ? [25, 35] : [30, 40];
  }

  if (avgKm6w < 30) {
    return planMode === "relaxed" ? [30, 40] : planMode === "moderate" ? [35, 50] : [45, 60];
  }

  if (avgKm6w < 45) {
    return planMode === "relaxed" ? [40, 55] : planMode === "moderate" ? [50, 65] : [60, 75];
  }

  if (avgKm6w < 60) {
    return planMode === "relaxed" ? [55, 70] : planMode === "moderate" ? [65, 80] : [75, 90];
  }

  return planMode === "relaxed" ? [70, 90] : planMode === "moderate" ? [80, 100] : [95, 115];
}

function getRealisticAverageSessionKm(avgKm6w: number): number {
  if (avgKm6w < 20) {
    return 10;
  }

  if (avgKm6w < 45) {
    return 14;
  }

  if (avgKm6w < 70) {
    return 17;
  }

  return 20;
}

function getCutbackIntervalWeeks(planMode: PlanMode): number {
  if (planMode === "relaxed") {
    return 3;
  }

  if (isAggressivePlanMode(planMode)) {
    return 5;
  }

  return 4;
}

function getTaperWeeks(input: {
  raceDistance: RaceDistance;
  totalWeeks: number;
  planMode: PlanMode;
  volumeCategory: VolumeCategory;
  injurySignal: AthleteProfile["injurySignal"];
}): number {
  if (input.raceDistance === "half_marathon") {
    if (input.totalWeeks < 6) {
      return 1;
    }

    return isAggressivePlanMode(input.planMode) || input.volumeCategory !== "low_base" ? 2 : 1;
  }

  if (input.totalWeeks < 8) {
    return 1;
  }

  if (
    isAggressivePlanMode(input.planMode) ||
    input.volumeCategory === "strong_hobby" ||
    input.volumeCategory === "advanced_hobby" ||
    input.injurySignal === "current_or_serious"
  ) {
    return 3;
  }

  return 2;
}

function getWeeklyIncreaseCap(input: {
  volumeCategory: VolumeCategory;
  planMode: PlanMode;
  loadConsistency: number;
  injurySignal: AthleteProfile["injurySignal"];
  age: number | null;
}): number {
  const baseCaps: Record<VolumeCategory, number> = {
    low_base: isAggressivePlanMode(input.planMode) ? 0.05 : 0.04,
    developing: input.planMode === "relaxed" ? 0.04 : isAggressivePlanMode(input.planMode) ? 0.07 : 0.06,
    intermediate: input.planMode === "relaxed" ? 0.05 : isAggressivePlanMode(input.planMode) ? 0.09 : 0.07,
    strong_hobby: input.planMode === "relaxed" ? 0.06 : isAggressivePlanMode(input.planMode) ? 0.1 : 0.08,
    advanced_hobby: input.planMode === "relaxed" ? 0.07 : input.planMode === "very_aggressive" ? 0.12 : input.planMode === "aggressive" ? 0.1 : 0.09,
  };
  let cap = baseCaps[input.volumeCategory];

  if (input.loadConsistency < 0.75) {
    cap = Math.min(cap, 0.05);
  }

  if (input.injurySignal === "current_or_serious") {
    cap = Math.min(cap, 0.04);
  }

  if (input.age !== null && input.age >= 55) {
    cap = Math.min(cap, 0.06);
  } else if (input.age !== null && input.age >= 45) {
    cap = Math.min(cap, 0.08);
  }

  return cap;
}

function getPeakLongRunKm(input: {
  raceDistance: RaceDistance;
  volumeCategory: VolumeCategory;
  planMode: PlanMode;
  peakLoadKm: number;
  easySecPerKm: number;
}): number {
  const [low, high] = getLongRunPeakRange(input.raceDistance, input.volumeCategory);
  const modePosition =
    input.planMode === "relaxed"
      ? 0.25
      : input.planMode === "very_aggressive"
        ? 1
        : input.planMode === "aggressive"
          ? 0.9
          : 0.6;
  const categoryPeak = low + (high - low) * modePosition;
  const longRunShareCap = getLongRunShareCap(input.volumeCategory) * input.peakLoadKm;
  const durationCapMin = getLongRunDurationCapMin(input.raceDistance, input.volumeCategory);
  const durationPeak = (durationCapMin * 60) / (input.easySecPerKm + 45);

  return roundDistance(Math.min(categoryPeak, longRunShareCap, durationPeak));
}

function getInitialLongRunKm(input: {
  raceDistance: RaceDistance;
  planMode: PlanMode;
  volumeCategory: VolumeCategory;
  startLoadKm: number;
  peakLongRunKm: number;
  longestRunKm6w: number;
}): number {
  const initialIncreaseCap =
    isAggressivePlanMode(input.planMode) &&
    (input.volumeCategory === "strong_hobby" ||
      input.volumeCategory === "advanced_hobby")
      ? 1.25
      : isAggressivePlanMode(input.planMode)
        ? 1.2
        : 1.12;
  const shareCap = getLongRunShareCap(input.volumeCategory) * input.startLoadKm;
  const distanceFloor = input.raceDistance === "marathon" ? 7 : 5;

  return roundDistance(
    Math.max(
      distanceFloor,
      Math.min(
        input.longestRunKm6w * initialIncreaseCap,
        shareCap,
        input.peakLongRunKm,
      ),
    ),
  );
}

function getLongRunPeakRange(
  raceDistance: RaceDistance,
  volumeCategory: VolumeCategory,
): [number, number] {
  if (raceDistance === "half_marathon") {
    const ranges: Record<VolumeCategory, [number, number]> = {
      low_base: [12, 16],
      developing: [16, 20],
      intermediate: [18, 24],
      strong_hobby: [22, 28],
      advanced_hobby: [24, 30],
    };

    return ranges[volumeCategory];
  }

  const ranges: Record<VolumeCategory, [number, number]> = {
    low_base: [22, 28],
    developing: [26, 30],
    intermediate: [28, 34],
    strong_hobby: [30, 36],
    advanced_hobby: [32, 38],
  };

  return ranges[volumeCategory];
}

function getLongRunShareCap(volumeCategory: VolumeCategory): number {
  const caps: Record<VolumeCategory, number> = {
    low_base: 0.4,
    developing: 0.35,
    intermediate: 0.32,
    strong_hobby: 0.3,
    advanced_hobby: 0.28,
  };

  return caps[volumeCategory];
}

function getLongRunDurationCapMin(
  raceDistance: RaceDistance,
  volumeCategory: VolumeCategory,
): number {
  if (raceDistance === "half_marathon") {
    return 150;
  }

  const caps: Record<VolumeCategory, number> = {
    low_base: 180,
    developing: 190,
    intermediate: 200,
    strong_hobby: 195,
    advanced_hobby: 190,
  };

  return caps[volumeCategory];
}

function getVolumeCategory(
  raceDistance: RaceDistance,
  avgKm6w: number,
): VolumeCategory {
  if (raceDistance === "half_marathon") {
    if (avgKm6w < 15) {
      return "low_base";
    }

    if (avgKm6w < 30) {
      return "developing";
    }

    if (avgKm6w < 45) {
      return "intermediate";
    }

    if (avgKm6w < 65) {
      return "strong_hobby";
    }

    return "advanced_hobby";
  }

  if (avgKm6w < 25) {
    return "low_base";
  }

  if (avgKm6w < 40) {
    return "developing";
  }

  if (avgKm6w < 60) {
    return "intermediate";
  }

  if (avgKm6w < 80) {
    return "strong_hobby";
  }

  return "advanced_hobby";
}

function getFrequencyCategory(runDaysPerWeek: number): FrequencyCategory {
  if (runDaysPerWeek <= 3) {
    return "minimal";
  }

  if (runDaysPerWeek === 4) {
    return "basic_structured";
  }

  if (runDaysPerWeek === 5) {
    return "standard_performance";
  }

  return "advanced_hobby";
}

function getBridgeRacePace(
  currentRacePaceSecPerKm: number,
  goalRacePaceSecPerKm: number | null,
  feasibilityRating: GoalFeasibilityRating,
): number {
  if (goalRacePaceSecPerKm === null || feasibilityRating === "finish_only") {
    return currentRacePaceSecPerKm;
  }

  if (feasibilityRating === "realistic" || feasibilityRating === "ambitious") {
    return Math.round((currentRacePaceSecPerKm + goalRacePaceSecPerKm) / 2);
  }

  return Math.round(currentRacePaceSecPerKm * 0.97);
}

function addDerivedMetricMessages(input: {
  input: NormalizedPlanInput;
  feasibilityRating: GoalFeasibilityRating;
  fitnessConfidence: FitnessConfidence;
  currentRacePaceSecPerKm: number;
  goalRacePaceSecPerKm: number | null;
  bridgeRacePaceSecPerKm: number;
  peakLoadKm: number;
  peakLongRunKm: number;
}): void {
  input.input.assumptions.push(
    `Current race ability is estimated at roughly ${formatPaceLabel(input.currentRacePaceSecPerKm)} per km with ${input.fitnessConfidence} confidence.`,
  );
  input.input.assumptions.push(
    `Peak load is planned around ${input.peakLoadKm} km/week with a peak long run around ${input.peakLongRunKm} km.`,
  );

  if (input.goalRacePaceSecPerKm !== null) {
    input.input.assumptions.push(
      `Goal pace is ${formatPaceLabel(input.goalRacePaceSecPerKm)} per km; bridge pace starts around ${formatPaceLabel(input.bridgeRacePaceSecPerKm)} per km when goal pace is not yet justified.`,
    );
  }

  if (input.feasibilityRating === "very_ambitious") {
    input.input.warnings.push(
      "The target finish time is very ambitious compared with the current estimate, so goal pace appears later and in controlled doses.",
    );
  }

  if (input.feasibilityRating === "low_confidence") {
    input.input.warnings.push(
      "The target finish time requires a large jump from the current estimate. The plan allows the goal but uses bridge pace before goal pace.",
    );
  }

  if (input.feasibilityRating === "not_credible") {
    input.input.warnings.push(
      "The target finish time is more than 18% faster than the current estimate. The plan does not use dream-goal pace as the main training target.",
    );
  }

  if (!input.input.environment.flatRoutesAvailable && !input.input.environment.treadmillAvailable) {
    input.input.warnings.push(
      "Flat routes and treadmill access are missing, so pace targets should be treated as secondary to controlled effort on hilly or trail terrain.",
    );
  }
}

function buildWeekPlans(input: {
  totalWeeks: number;
  raceDistance: RaceDistance;
  planMode: PlanMode;
  metrics: DerivedMetrics;
}): WeekPlan[] {
  const weekPlans: WeekPlan[] = [];
  const minimumFullBuildWeeks = input.raceDistance === "marathon" ? 8 : 6;
  let lastBuildVolumeKm = input.metrics.startLoadKm;
  let previousLongRunKm = input.metrics.initialLongRunKm;

  for (let weekNumber = 1; weekNumber <= input.totalWeeks; weekNumber += 1) {
    const weeksUntilRace = input.totalWeeks - weekNumber + 1;
    const isRaceWeek = weekNumber === input.totalWeeks;
    const phase = getPhaseForWeek({
      weekNumber,
      totalWeeks: input.totalWeeks,
      raceDistance: input.raceDistance,
      taperWeeks: input.metrics.taperWeeks,
    });
    const isTaper = phase === "taper";
    const isRacePrep = input.totalWeeks < minimumFullBuildWeeks;
    const isCutback =
      !isRacePrep &&
      !isTaper &&
      weekNumber > 1 &&
      weekNumber % input.metrics.cutbackIntervalWeeks === 0;
    let volumeKm: number;

    if (isRacePrep) {
      volumeKm = Math.round(input.metrics.startLoadKm * (weeksUntilRace === 1 ? 0.65 : 0.9));
    } else if (isTaper) {
      volumeKm = Math.round(lastBuildVolumeKm * getTaperVolumeMultiplier(weeksUntilRace));
    } else if (weekNumber === 1) {
      volumeKm = input.metrics.startLoadKm;
    } else if (isCutback) {
      volumeKm = Math.round(lastBuildVolumeKm * getCutbackVolumeMultiplier(input.planMode));
    } else {
      lastBuildVolumeKm = Math.min(
        input.metrics.peakLoadKm,
        Math.round(lastBuildVolumeKm * (1 + input.metrics.weeklyIncreaseCap)),
      );
      volumeKm = lastBuildVolumeKm;
    }

    const longRunKm = getWeekLongRunKm({
      weekNumber,
      totalWeeks: input.totalWeeks,
      raceDistance: input.raceDistance,
      phase,
      volumeKm,
      metrics: input.metrics,
      isCutback,
      isRaceWeek,
      previousLongRunKm,
    });

    if (!isRaceWeek) {
      previousLongRunKm = longRunKm;
    }

    weekPlans.push({
      weekNumber,
      phase,
      volumeKm,
      longRunKm,
      isCutback,
      isTaper,
      isRaceWeek,
    });
  }

  return weekPlans;
}

function getPhaseForWeek(input: {
  weekNumber: number;
  totalWeeks: number;
  raceDistance: RaceDistance;
  taperWeeks: number;
}): PhaseLabel {
  const weeksUntilRace = input.totalWeeks - input.weekNumber + 1;
  const racePrepCutoff = input.raceDistance === "marathon" ? 8 : 6;

  if (input.totalWeeks < racePrepCutoff) {
    return "race_prep";
  }

  if (weeksUntilRace <= input.taperWeeks) {
    return "taper";
  }

  const lastBuildWeek = input.totalWeeks - input.taperWeeks;

  if (input.weekNumber === lastBuildWeek) {
    return "peak";
  }

  if (input.raceDistance === "marathon") {
    if (input.totalWeeks >= 18) {
      const baseEnd = Math.max(2, Math.round(lastBuildWeek * 0.22));
      const buildEnd = Math.max(baseEnd + 1, Math.round(lastBuildWeek * 0.52));

      if (input.weekNumber <= baseEnd) {
        return "base";
      }

      return input.weekNumber <= buildEnd ? "build" : "specific";
    }

    const buildEnd = Math.max(2, Math.round(lastBuildWeek * 0.35));
    return input.weekNumber <= buildEnd ? "build" : "specific";
  }

  if (input.totalWeeks >= 16) {
    const baseEnd = Math.max(2, Math.round(lastBuildWeek * 0.25));
    const buildEnd = Math.max(baseEnd + 1, Math.round(lastBuildWeek * 0.55));

    if (input.weekNumber <= baseEnd) {
      return "base";
    }

    return input.weekNumber <= buildEnd ? "build" : "specific";
  }

  const buildEnd = Math.max(1, Math.round(lastBuildWeek * 0.4));
  return input.weekNumber <= buildEnd ? "build" : "specific";
}

function getTaperVolumeMultiplier(weeksUntilRace: number): number {
  if (weeksUntilRace >= 3) {
    return 0.8;
  }

  if (weeksUntilRace === 2) {
    return 0.62;
  }

  return 0.45;
}

function getCutbackVolumeMultiplier(planMode: PlanMode): number {
  if (planMode === "relaxed") {
    return 0.75;
  }

  if (isAggressivePlanMode(planMode)) {
    return 0.86;
  }

  return 0.82;
}

function getWeekLongRunKm(input: {
  weekNumber: number;
  totalWeeks: number;
  raceDistance: RaceDistance;
  phase: PhaseLabel;
  volumeKm: number;
  metrics: DerivedMetrics;
  isCutback: boolean;
  isRaceWeek: boolean;
  previousLongRunKm: number;
}): number {
  if (input.isRaceWeek) {
    return distanceKmByRace[input.raceDistance];
  }

  if (input.weekNumber === 1) {
    return input.metrics.initialLongRunKm;
  }

  const buildWeeks = Math.max(1, input.totalWeeks - input.metrics.taperWeeks - 1);
  const progress = clamp((input.weekNumber - 1) / buildWeeks, 0, 1);
  const shareLimitedLongRunKm =
    input.volumeKm * getLongRunShareCap(input.metrics.volumeCategory);
  const phaseLongRunTarget =
    input.metrics.peakLongRunKm * (0.72 + progress * 0.28);
  const desiredLongRunKm = Math.min(phaseLongRunTarget, shareLimitedLongRunKm);
  const maxIncreaseMultiplier =
    input.metrics.volumeCategory === "strong_hobby" ||
    input.metrics.volumeCategory === "advanced_hobby"
      ? 1.14
      : 1.1;
  let longRunKm = Math.min(
    desiredLongRunKm,
    input.previousLongRunKm * maxIncreaseMultiplier,
  );

  if (input.isCutback) {
    longRunKm *= 0.82;
  }

  if (input.phase === "taper") {
    longRunKm *= 0.7;
  }

  return roundDistance(Math.max(input.raceDistance === "marathon" ? 7 : 5, longRunKm));
}

function buildPlannedDays(startDate: Date, raceDate: Date): PlannedDay[] {
  const plannedDays: PlannedDay[] = [];
  const totalDays = daysBetween(startDate, raceDate) + 1;

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset += 1) {
    const date = addDays(startDate, dayOffset);

    plannedDays.push({
      date,
      dateText: formatDateOnly(date),
      dayLabel: getTrainingDay(date),
      weekNumber: Math.floor(dayOffset / 7) + 1,
    });
  }

  return plannedDays;
}

function buildWorkoutPrescriptions(input: {
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
  weekPlans: WeekPlan[];
  plannedDays: PlannedDay[];
}): WorkoutPrescription[] {
  const drafts: WeekWorkoutDraft[] = [];
  let firstTrainingRunAssigned = false;

  for (const weekPlan of input.weekPlans) {
    const weekDays = input.plannedDays.filter(
      (plannedDay) => plannedDay.weekNumber === weekPlan.weekNumber,
    );
    const weekDrafts = buildWeekDrafts({
      input: input.input,
      metrics: input.metrics,
      weekPlan,
      weekDays,
    });

    for (const draft of weekDrafts) {
      if (
        !firstTrainingRunAssigned &&
        draft.role !== "race_day" &&
        runWorkoutTypes.has(draft.workoutType)
      ) {
        drafts.push({
          ...draft,
          workoutType: "calibration",
          role: "calibration",
          stress: "moderate",
          title: "Calibration run",
        });
        firstTrainingRunAssigned = true;
        continue;
      }

      drafts.push(draft);
    }
  }

  softenUnsafeHardWorkoutSpacing(drafts);

  return drafts.map((draft) =>
    buildPrescriptionFromDraft({
      draft,
      weekDrafts: drafts.filter((candidate) => candidate.day.weekNumber === draft.day.weekNumber),
      weekPlan: input.weekPlans[draft.day.weekNumber - 1],
      input: input.input,
      metrics: input.metrics,
    }),
  );
}

function buildWeekDrafts(input: {
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
  weekPlan: WeekPlan;
  weekDays: PlannedDay[];
}): WeekWorkoutDraft[] {
  const drafts = input.weekDays.map((day): WeekWorkoutDraft => ({
    day,
    workoutType: "rest",
    role: "rest",
    stress: "none",
    title: "Rest day",
  }));
  const runDays = input.weekDays.filter((day) =>
    input.input.availability.selectedRunningDays.includes(day.dayLabel),
  );
  const raceDay = input.weekDays.find(
    (day) => day.dateText === input.input.goal.raceDate,
  );
  const effectiveRunDays =
    raceDay && !runDays.some((day) => day.dateText === raceDay.dateText)
      ? [...runDays, raceDay].sort((first, second) => first.date.getTime() - second.date.getTime())
      : runDays;

  if (effectiveRunDays.length === 0) {
    assignOptionalStrengthDraft(drafts, input.weekPlan);
    return drafts;
  }

  const longRunDay = getLongRunDraftDay({
    runDays: effectiveRunDays,
    raceDay,
    preferredLongRunDay: input.input.availability.longRunDay,
  });

  for (const runDay of effectiveRunDays) {
    const draft = getDraftForDay(drafts, runDay);

    if (raceDay && runDay.dateText === raceDay.dateText) {
      Object.assign(draft, {
        workoutType: input.input.goal.raceType === "marathon" ? "long_run" : "marathon_pace",
        role: "race_day",
        stress: "hard",
        title: `${formatRaceDistance(input.input.goal.raceType)} race day`,
      } satisfies Partial<WeekWorkoutDraft>);
      continue;
    }

    if (runDay.dateText === longRunDay.dateText) {
      const longRunRole = getLongRunRole(input.weekPlan, input.metrics, effectiveRunDays.length);
      Object.assign(draft, {
        workoutType: "long_run",
        role: longRunRole,
        stress: longRunRole === "long_race_specific" ? "hard" : "moderate",
        title: getLongRunTitle(longRunRole),
      } satisfies Partial<WeekWorkoutDraft>);
      continue;
    }

    Object.assign(draft, {
      workoutType: "easy",
      role: "easy",
      stress: "easy",
      title: "Easy run",
    } satisfies Partial<WeekWorkoutDraft>);
  }

  assignQualityDrafts({
    drafts,
    input: input.input,
    metrics: input.metrics,
    weekPlan: input.weekPlan,
    runDays: effectiveRunDays,
    longRunDay,
  });
  assignMediumLongDraft({
    drafts,
    weekPlan: input.weekPlan,
    runDays: effectiveRunDays,
    longRunDay,
  });
  assignRecoveryDrafts({
    drafts,
    weekPlan: input.weekPlan,
    runDays: effectiveRunDays,
  });
  assignOptionalStrengthDraft(drafts, input.weekPlan);

  return drafts;
}

function getLongRunDraftDay(input: {
  runDays: PlannedDay[];
  raceDay?: PlannedDay;
  preferredLongRunDay: TrainingDay;
}): PlannedDay {
  if (input.raceDay) {
    return input.raceDay;
  }

  return (
    input.runDays.find((runDay) => runDay.dayLabel === input.preferredLongRunDay) ??
    input.runDays[input.runDays.length - 1]
  );
}

function getLongRunRole(
  weekPlan: WeekPlan,
  metrics: DerivedMetrics,
  runDaysPerWeek: number,
): WeekWorkoutDraft["role"] {
  if (weekPlan.isCutback || weekPlan.isTaper || weekPlan.phase === "race_prep") {
    return "long_easy";
  }

  if (
    runDaysPerWeek >= 4 &&
    (weekPlan.phase === "specific" || weekPlan.phase === "peak") &&
    weekPlan.longRunKm >= metrics.peakLongRunKm * 0.62 &&
    metrics.feasibilityRating !== "not_credible" &&
    weekPlan.weekNumber % 3 === 0
  ) {
    return "long_race_specific";
  }

  if (
    runDaysPerWeek >= 3 &&
    (weekPlan.phase === "build" || weekPlan.phase === "specific") &&
    weekPlan.weekNumber % 4 === 2
  ) {
    return "long_steady";
  }

  return "long_easy";
}

function getLongRunTitle(role: WeekWorkoutDraft["role"]): string {
  if (role === "long_race_specific") {
    return "Long run with race-pace blocks";
  }

  if (role === "long_steady") {
    return "Long run with steady finish";
  }

  return "Easy long run";
}

function assignQualityDrafts(input: {
  drafts: WeekWorkoutDraft[];
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
  weekPlan: WeekPlan;
  runDays: PlannedDay[];
  longRunDay: PlannedDay;
}): void {
  const runCount = input.runDays.length;

  if (runCount <= 2 || input.weekPlan.isCutback || input.weekPlan.isTaper) {
    return;
  }

  const primaryQualityRole = getPrimaryQualityRole({
    raceDistance: input.input.goal.raceType,
    phase: input.weekPlan.phase,
    weekNumber: input.weekPlan.weekNumber,
    runCount,
    volumeCategory: input.metrics.volumeCategory,
  });
  const qualityDay = pickQualityDay({
    candidates: input.runDays.filter(
      (runDay) => runDay.dateText !== input.longRunDay.dateText,
    ),
    longRunDay: input.longRunDay,
    role: primaryQualityRole,
  });

  if (qualityDay) {
    applyQualityRole(getDraftForDay(input.drafts, qualityDay), primaryQualityRole);
  } else {
    const steadyDay = input.runDays.find(
      (runDay) => runDay.dateText !== input.longRunDay.dateText,
    );

    if (steadyDay) {
      Object.assign(getDraftForDay(input.drafts, steadyDay), {
        workoutType: "easy",
        role: "steady",
        stress: "moderate",
        title: "Steady aerobic run",
      } satisfies Partial<WeekWorkoutDraft>);
    }
  }

  const canAddSecondControlledStimulus =
    runCount >= 6 &&
    isAggressivePlanMode(input.input.goal.planMode) &&
    (input.weekPlan.phase === "specific" || input.weekPlan.phase === "peak") &&
    input.metrics.volumeCategory !== "low_base";

  if (!canAddSecondControlledStimulus) {
    return;
  }

  const secondQualityDay = pickSecondQualityDay({
    candidates: input.runDays.filter((runDay) => {
      const draft = getDraftForDay(input.drafts, runDay);

      return (
        runDay.dateText !== input.longRunDay.dateText &&
        draft.stress === "easy" &&
        daysBetween(runDay.date, input.longRunDay.date) >= 2
      );
    }),
  });

  if (secondQualityDay) {
    applyQualityRole(getDraftForDay(input.drafts, secondQualityDay), "race_pace");
  }
}

function getPrimaryQualityRole(input: {
  raceDistance: RaceDistance;
  phase: PhaseLabel;
  weekNumber: number;
  runCount: number;
  volumeCategory: VolumeCategory;
}): WeekWorkoutDraft["role"] {
  if (input.phase === "race_prep") {
    return "race_pace";
  }

  if (input.runCount === 3) {
    return input.phase === "base" ? "steady" : "threshold";
  }

  if (input.raceDistance === "half_marathon") {
    if (input.phase === "specific" && input.weekNumber % 2 === 0) {
      return "race_pace";
    }

    return input.weekNumber % 3 === 0 ? "interval" : "threshold";
  }

  if (input.phase === "specific" || input.phase === "peak") {
    return input.weekNumber % 3 === 0 ? "race_pace" : "threshold";
  }

  if (
    input.phase === "build" &&
    input.weekNumber % 4 === 0 &&
    input.volumeCategory !== "low_base"
  ) {
    return "interval";
  }

  return input.phase === "base" ? "steady" : "threshold";
}

function pickQualityDay(input: {
  candidates: PlannedDay[];
  longRunDay: PlannedDay;
  role: WeekWorkoutDraft["role"];
}): PlannedDay | null {
  const minimumGap = input.role === "interval" ? 3 : 2;
  const sortedCandidates = [...input.candidates].sort(
    (first, second) => first.date.getTime() - second.date.getTime(),
  );

  return (
    sortedCandidates.find((candidate) => {
      const daysUntilLongRun = daysBetween(candidate.date, input.longRunDay.date);
      const daysAfterLongRun = daysBetween(input.longRunDay.date, candidate.date);

      return daysUntilLongRun >= minimumGap || daysAfterLongRun >= 2;
    }) ?? null
  );
}

function pickSecondQualityDay(input: {
  candidates: PlannedDay[];
}): PlannedDay | null {
  if (input.candidates.length === 0) {
    return null;
  }

  return input.candidates[input.candidates.length - 1];
}

function applyQualityRole(
  draft: WeekWorkoutDraft,
  role: WeekWorkoutDraft["role"],
): void {
  if (role === "interval") {
    Object.assign(draft, {
      workoutType: "interval",
      role: "interval",
      stress: "hard",
      title: "VO2max interval session",
    } satisfies Partial<WeekWorkoutDraft>);
    return;
  }

  if (role === "race_pace") {
    Object.assign(draft, {
      workoutType: "marathon_pace",
      role: "race_pace",
      stress: "hard",
      title: "Race-pace workout",
    } satisfies Partial<WeekWorkoutDraft>);
    return;
  }

  if (role === "threshold") {
    Object.assign(draft, {
      workoutType: "tempo",
      role: "threshold",
      stress: "hard",
      title: "Cruise interval tempo",
    } satisfies Partial<WeekWorkoutDraft>);
    return;
  }

  Object.assign(draft, {
    workoutType: "easy",
    role: "steady",
    stress: "moderate",
    title: "Steady aerobic run",
  } satisfies Partial<WeekWorkoutDraft>);
}

function assignMediumLongDraft(input: {
  drafts: WeekWorkoutDraft[];
  weekPlan: WeekPlan;
  runDays: PlannedDay[];
  longRunDay: PlannedDay;
}): void {
  if (
    input.runDays.length < 5 ||
    input.weekPlan.isTaper ||
    input.weekPlan.phase === "race_prep"
  ) {
    return;
  }

  const candidates = input.runDays.filter((runDay) => {
    const draft = getDraftForDay(input.drafts, runDay);

    return runDay.dateText !== input.longRunDay.dateText && draft.stress === "easy";
  });
  const mediumLongDay =
    candidates.find((candidate) => candidate.dayLabel === "wednesday") ??
    candidates.find((candidate) => candidate.dayLabel === "thursday") ??
    candidates[Math.floor(candidates.length / 2)];

  if (!mediumLongDay) {
    return;
  }

  Object.assign(getDraftForDay(input.drafts, mediumLongDay), {
    workoutType: "easy",
    role: "medium_long",
    stress: "moderate",
    title: "Medium-long run",
  } satisfies Partial<WeekWorkoutDraft>);
}

function assignRecoveryDrafts(input: {
  drafts: WeekWorkoutDraft[];
  weekPlan: WeekPlan;
  runDays: PlannedDay[];
}): void {
  if (input.runDays.length < 5) {
    return;
  }

  const sortedRunDays = [...input.runDays].sort(
    (first, second) => first.date.getTime() - second.date.getTime(),
  );
  const firstRunDay = sortedRunDays[0];

  if (!firstRunDay) {
    return;
  }

  const draft = getDraftForDay(input.drafts, firstRunDay);

  if (draft.stress === "easy") {
    Object.assign(draft, {
      workoutType: "recovery",
      role: "recovery",
      stress: "easy",
      title: "Recovery run",
    } satisfies Partial<WeekWorkoutDraft>);
  }
}

function assignOptionalStrengthDraft(
  drafts: WeekWorkoutDraft[],
  weekPlan: WeekPlan,
): void {
  if (weekPlan.isTaper || weekPlan.weekNumber % 4 !== 0) {
    return;
  }

  const restDrafts = drafts.filter((draft) => draft.workoutType === "rest");

  if (restDrafts.length < 2) {
    return;
  }

  Object.assign(restDrafts[Math.floor(restDrafts.length / 2)], {
    workoutType: "strength_optional",
    role: "strength",
    stress: "none",
    title: "Optional strength",
  } satisfies Partial<WeekWorkoutDraft>);
}

function softenUnsafeHardWorkoutSpacing(drafts: WeekWorkoutDraft[]): void {
  const sortedDrafts = [...drafts].sort(
    (first, second) => first.day.date.getTime() - second.day.date.getTime(),
  );

  for (let index = 1; index < sortedDrafts.length; index += 1) {
    const previousDraft = sortedDrafts[index - 1];
    const currentDraft = sortedDrafts[index];

    if (
      previousDraft.stress === "hard" &&
      currentDraft.stress === "hard" &&
      daysBetween(previousDraft.day.date, currentDraft.day.date) === 1 &&
      currentDraft.role !== "race_day"
    ) {
      softenDraftToEasy(currentDraft);
    }
  }

  for (const draft of sortedDrafts) {
    if (draft.role !== "interval") {
      continue;
    }

    const sameWeekLongRun = sortedDrafts.find(
      (candidate) =>
        candidate.day.weekNumber === draft.day.weekNumber &&
        (candidate.role === "long_easy" ||
          candidate.role === "long_steady" ||
          candidate.role === "long_race_specific" ||
          candidate.role === "race_day"),
    );

    if (
      sameWeekLongRun &&
      daysBetween(draft.day.date, sameWeekLongRun.day.date) > 0 &&
      daysBetween(draft.day.date, sameWeekLongRun.day.date) <= 2
    ) {
      softenDraftToSteady(draft);
    }
  }
}

function softenDraftToEasy(draft: WeekWorkoutDraft): void {
  Object.assign(draft, {
    workoutType: "easy",
    role: "easy",
    stress: "easy",
    title: "Easy run",
  } satisfies Partial<WeekWorkoutDraft>);
}

function softenDraftToSteady(draft: WeekWorkoutDraft): void {
  Object.assign(draft, {
    workoutType: "easy",
    role: "steady",
    stress: "moderate",
    title: "Steady aerobic run",
  } satisfies Partial<WeekWorkoutDraft>);
}

function buildPrescriptionFromDraft(input: {
  draft: WeekWorkoutDraft;
  weekDrafts: WeekWorkoutDraft[];
  weekPlan: WeekPlan;
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
}): WorkoutPrescription {
  const distanceKm = getDraftDistanceKm(input);
  const paceRange = getDraftPaceRange({
    draft: input.draft,
    phase: input.weekPlan.phase,
    metrics: input.metrics,
    raceDistance: input.input.goal.raceType,
  });
  const durationMin = getWorkoutDurationMin(
    input.draft.workoutType,
    distanceKm,
    paceRange?.maxSecPerKm ?? null,
  );
  const terrain = getWorkoutTerrain({
    draft: input.draft,
    weekNumber: input.weekPlan.weekNumber,
    environment: input.input.environment,
  });
  const description = getWorkoutDescription({
    draft: input.draft,
    phase: input.weekPlan.phase,
    raceDistance: input.input.goal.raceType,
  });
  const purpose = getWorkoutPurpose({
    draft: input.draft,
    phase: input.weekPlan.phase,
  });
  const instructions = getWorkoutInstructions({
    draft: input.draft,
    terrain,
    environment: input.input.environment,
    metrics: input.metrics,
  });

  return {
    ...input.draft.day,
    workoutType: input.draft.workoutType,
    title: input.draft.title,
    description,
    distanceKm,
    durationMin,
    targetPaceMinSecPerKm: paceRange?.minSecPerKm ?? null,
    targetPaceMaxSecPerKm: paceRange?.maxSecPerKm ?? null,
    targetHrZone: getTargetHeartRateZone(input.draft),
    terrain,
    purpose,
    instructions,
  };
}

function getDraftDistanceKm(input: {
  draft: WeekWorkoutDraft;
  weekDrafts: WeekWorkoutDraft[];
  weekPlan: WeekPlan;
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
}): number | null {
  if (input.draft.workoutType === "rest" || input.draft.workoutType === "strength_optional") {
    return null;
  }

  if (input.draft.role === "race_day") {
    return distanceKmByRace[input.input.goal.raceType];
  }

  if (input.draft.role === "calibration") {
    return input.input.goal.raceType === "marathon" ? 5 : 4;
  }

  if (
    input.draft.role === "long_easy" ||
    input.draft.role === "long_steady" ||
    input.draft.role === "long_race_specific"
  ) {
    return input.weekPlan.longRunKm;
  }

  const longRunDistance = input.weekDrafts
    .filter(
      (draft) =>
        draft.role === "long_easy" ||
        draft.role === "long_steady" ||
        draft.role === "long_race_specific" ||
        draft.role === "race_day",
    )
    .reduce((total, draft) => {
      if (draft.role === "race_day") {
        return total + distanceKmByRace[input.input.goal.raceType];
      }

      return total + input.weekPlan.longRunKm;
    }, 0);
  const calibrationDistance = input.weekDrafts.some(
    (draft) => draft.role === "calibration",
  )
    ? input.input.goal.raceType === "marathon"
      ? 5
      : 4
    : 0;
  const distributableDrafts = input.weekDrafts.filter(
    (draft) =>
      runWorkoutTypes.has(draft.workoutType) &&
      draft.role !== "calibration" &&
      draft.role !== "long_easy" &&
      draft.role !== "long_steady" &&
      draft.role !== "long_race_specific" &&
      draft.role !== "race_day",
  );
  const remainingVolumeKm = Math.max(
    0,
    input.weekPlan.volumeKm - longRunDistance - calibrationDistance,
  );
  const totalWeight = distributableDrafts.reduce(
    (total, draft) => total + getDistanceWeight(draft.role),
    0,
  );
  const rawDistance =
    totalWeight > 0
      ? remainingVolumeKm * (getDistanceWeight(input.draft.role) / totalWeight)
      : 0;

  return roundDistance(
    clamp(
      rawDistance,
      getMinimumDistanceKm(input.draft.role, input.input.goal.raceType),
      getMaximumDistanceKm(input.draft.role, input.weekPlan.longRunKm),
    ),
  );
}

function getDistanceWeight(role: WeekWorkoutDraft["role"]): number {
  const weights: Record<WeekWorkoutDraft["role"], number> = {
    calibration: 1,
    easy: 1,
    recovery: 0.7,
    medium_long: 1.45,
    steady: 1.15,
    threshold: 1.15,
    interval: 1.05,
    race_pace: 1.2,
    long_easy: 0,
    long_steady: 0,
    long_race_specific: 0,
    race_day: 0,
    rest: 0,
    strength: 0,
  };

  return weights[role];
}

function getMinimumDistanceKm(
  role: WeekWorkoutDraft["role"],
  raceDistance: RaceDistance,
): number {
  if (role === "recovery") {
    return 3;
  }

  if (role === "medium_long") {
    return raceDistance === "marathon" ? 8 : 6;
  }

  if (role === "threshold" || role === "interval" || role === "race_pace") {
    return 5;
  }

  return 4;
}

function getMaximumDistanceKm(
  role: WeekWorkoutDraft["role"],
  longRunKm: number,
): number {
  if (role === "recovery") {
    return 7;
  }

  if (role === "medium_long") {
    return Math.max(9, longRunKm * 0.7);
  }

  if (role === "threshold") {
    return 13;
  }

  if (role === "interval") {
    return 10;
  }

  if (role === "race_pace") {
    return 15;
  }

  if (role === "steady") {
    return 12;
  }

  return 11;
}

function getDraftPaceRange(input: {
  draft: WeekWorkoutDraft;
  phase: PhaseLabel;
  metrics: DerivedMetrics;
  raceDistance: RaceDistance;
}): PaceRange | null {
  if (input.draft.workoutType === "rest" || input.draft.workoutType === "strength_optional") {
    return null;
  }

  if (input.draft.role === "race_day") {
    const racePace =
      input.metrics.goalRacePaceSecPerKm ??
      input.metrics.bridgeRacePaceSecPerKm ??
      input.metrics.currentRacePaceSecPerKm;

    return {
      minSecPerKm: Math.max(180, racePace - 8),
      maxSecPerKm: racePace + 12,
    };
  }

  if (input.draft.role === "recovery") {
    return {
      minSecPerKm: input.metrics.easySecPerKm + 40,
      maxSecPerKm: input.metrics.easySecPerKm + 90,
    };
  }

  if (
    input.draft.role === "long_easy" ||
    input.draft.role === "long_steady" ||
    input.draft.role === "long_race_specific"
  ) {
    return {
      minSecPerKm: input.metrics.easySecPerKm + 15,
      maxSecPerKm: input.metrics.easySecPerKm + 65,
    };
  }

  if (input.draft.role === "steady" || input.draft.role === "medium_long") {
    return {
      minSecPerKm: input.metrics.easySecPerKm + 5,
      maxSecPerKm: input.metrics.easySecPerKm + 35,
    };
  }

  if (input.draft.role === "threshold") {
    return {
      minSecPerKm: input.metrics.thresholdSecPerKm,
      maxSecPerKm: input.metrics.thresholdSecPerKm + 20,
    };
  }

  if (input.draft.role === "interval") {
    return {
      minSecPerKm: Math.max(180, input.metrics.thresholdSecPerKm - 25),
      maxSecPerKm: Math.max(180, input.metrics.thresholdSecPerKm - 5),
    };
  }

  if (input.draft.role === "race_pace") {
    const raceSpecificPace = getRaceSpecificPace(input);

    return {
      minSecPerKm: Math.max(180, raceSpecificPace - 10),
      maxSecPerKm: raceSpecificPace + 12,
    };
  }

  return {
    minSecPerKm: input.metrics.easySecPerKm,
    maxSecPerKm: input.metrics.easySecPerKm + 45,
  };
}

function getRaceSpecificPace(input: {
  phase: PhaseLabel;
  metrics: DerivedMetrics;
}): number {
  if (input.metrics.goalRacePaceSecPerKm === null) {
    return input.metrics.currentRacePaceSecPerKm;
  }

  if (
    input.metrics.feasibilityRating === "not_credible" ||
    input.metrics.feasibilityRating === "low_confidence"
  ) {
    return input.metrics.bridgeRacePaceSecPerKm;
  }

  if (input.phase === "specific" || input.phase === "peak" || input.phase === "taper") {
    return input.metrics.goalRacePaceSecPerKm;
  }

  return input.metrics.bridgeRacePaceSecPerKm;
}

function getWorkoutDurationMin(
  workoutType: WorkoutType,
  distanceKm: number | null,
  paceSecPerKm: number | null,
): number | null {
  if (workoutType === "rest") {
    return null;
  }

  if (workoutType === "strength_optional") {
    return 25;
  }

  if (distanceKm === null || paceSecPerKm === null) {
    return null;
  }

  return Math.max(10, Math.round((distanceKm * paceSecPerKm) / 60));
}

function getWorkoutTerrain(input: {
  draft: WeekWorkoutDraft;
  weekNumber: number;
  environment: EnvironmentProfile;
}): TerrainAvailable | null {
  if (input.draft.workoutType === "rest" || input.draft.workoutType === "strength_optional") {
    return null;
  }

  if (input.draft.role === "interval") {
    if (input.environment.hillsAvailable && input.weekNumber % 5 === 0) {
      return "hills";
    }

    return pickFirstAvailable(input.environment.terrainAvailable, [
      "track",
      "treadmill",
      "flat",
      "hills",
    ]);
  }

  if (input.draft.role === "threshold" || input.draft.role === "race_pace") {
    return pickFirstAvailable(input.environment.terrainAvailable, [
      "flat",
      "treadmill",
      "track",
      "hills",
      "trails",
    ]);
  }

  if (
    input.draft.role === "long_easy" ||
    input.draft.role === "long_steady" ||
    input.draft.role === "long_race_specific"
  ) {
    if (
      (input.environment.raceCourseLooksHilly || input.weekNumber % 4 === 0) &&
      input.environment.hillsAvailable
    ) {
      return "hills";
    }

    return pickFirstAvailable(input.environment.terrainAvailable, [
      "trails",
      "flat",
      "hills",
      "treadmill",
    ]);
  }

  if (input.draft.role === "calibration") {
    return pickFirstAvailable(input.environment.terrainAvailable, [
      "track",
      "flat",
      "treadmill",
    ]);
  }

  return pickFirstAvailable(input.environment.terrainAvailable, [
    "flat",
    "treadmill",
    "trails",
    "hills",
  ]);
}

function getWorkoutDescription(input: {
  draft: WeekWorkoutDraft;
  phase: PhaseLabel;
  raceDistance: RaceDistance;
}): string {
  if (input.draft.role === "race_day") {
    return `Race day for the ${formatRaceDistance(input.raceDistance)} goal.`;
  }

  const phaseLabel = formatPhaseLabel(input.phase);
  const descriptions: Record<WeekWorkoutDraft["role"], string> = {
    calibration: "A controlled first run used to verify that early targets feel realistic.",
    easy: `Comfortable aerobic running for the ${phaseLabel} phase.`,
    recovery: "A short, very easy run to absorb nearby training stress.",
    medium_long: "A longer aerobic support run that builds weekly durability without becoming the key long run.",
    steady: "A controlled upper-aerobic run below threshold effort.",
    threshold: "A cruise-interval or tempo-style workout focused on sustainable hard running.",
    interval: "A controlled VO2max or economy interval session with conservative total fast volume.",
    race_pace: `Race-specific rhythm work for the ${phaseLabel} phase.`,
    long_easy: "The key endurance run of the week, kept mostly easy.",
    long_steady: "The key endurance run of the week with a controlled steady finish if feeling good.",
    long_race_specific: "A specific-phase long run that introduces controlled race-pace blocks.",
    race_day: `Race day for the ${formatRaceDistance(input.raceDistance)} goal.`,
    rest: "No running planned so the body can absorb training.",
    strength: "Optional light strength work that should not affect the next run.",
  };

  return descriptions[input.draft.role];
}

function getWorkoutPurpose(input: {
  draft: WeekWorkoutDraft;
  phase: PhaseLabel;
}): string {
  const purposes: Record<WeekWorkoutDraft["role"], string> = {
    calibration: "Check current fitness and calibrate early plan feel.",
    easy: "Build aerobic volume while preserving recovery.",
    recovery: "Reduce fatigue and keep the running habit light.",
    medium_long: "Support marathon or half-marathon durability with more aerobic volume.",
    steady: "Build aerobic strength without turning the week into a hard block.",
    threshold: "Improve sustainable hard effort while respecting threshold volume caps.",
    interval: "Maintain speed and economy without letting VO2max dominate the plan.",
    race_pace: "Introduce goal or bridge race pace only when the phase and feasibility support it.",
    long_easy: "Develop endurance and durability.",
    long_steady: "Develop durability and late-run control.",
    long_race_specific: "Practice race-specific rhythm after base durability has been established.",
    race_day: "Execute the goal race.",
    rest: "Protect recovery and lower injury risk.",
    strength: "Support basic running durability.",
  };

  return `${purposes[input.draft.role]} Phase: ${formatPhaseLabel(input.phase)}.`;
}

function getWorkoutInstructions(input: {
  draft: WeekWorkoutDraft;
  terrain: TerrainAvailable | null;
  environment: EnvironmentProfile;
  metrics: DerivedMetrics;
}): string {
  const terrainNote = input.terrain
    ? ` Suggested terrain: ${formatTerrainLabel(input.terrain)}.`
    : "";
  const effortNote =
    !input.environment.flatRoutesAvailable && !input.environment.treadmillAvailable
      ? " Use effort as the primary guide if terrain makes exact pace unrealistic."
      : "";
  const bridgeNote =
    input.metrics.feasibilityRating === "low_confidence" ||
    input.metrics.feasibilityRating === "not_credible"
      ? " Goal pace is not the default target yet; use the planned target range, not dream pace."
      : "";
  const instructions: Record<WeekWorkoutDraft["role"], string> = {
    calibration:
      "Warm up for 10 minutes, run the middle section steady and controlled, then cool down. Record effort and any discomfort.",
    easy: "Keep the effort conversational and relaxed.",
    recovery: "Keep this deliberately easy enough to finish fresher than you started.",
    medium_long:
      "Keep most of this easy. If feeling good, let the final third become steady but not hard.",
    steady: "Run controlled and smooth, below threshold. You should not be racing the workout.",
    threshold:
      "Warm up easily. Run the focused work at controlled threshold effort, then cool down.",
    interval:
      "Warm up well. Keep fast reps smooth, with easy recoveries. Stop early if form breaks down.",
    race_pace:
      "Warm up easily, settle into the planned race-specific range for the focused work, then cool down.",
    long_easy:
      "Start slower than planned if needed. Keep the effort easy and practice fueling if the run exceeds 105 minutes.",
    long_steady:
      "Run the first 70-85% easy. Finish steady only if effort, form, and fueling are under control.",
    long_race_specific:
      "Keep the early miles easy. Add controlled race-pace blocks only if the day feels stable; skip the blocks if fatigue is high.",
    race_day:
      "Use the target range as a guide, but prioritize controlled execution and even effort.",
    rest: "Take the day off running. Gentle walking or mobility is fine if it feels good.",
    strength:
      "Keep this light: squats, lunges, calf raises, glute bridges, and planks. Stop before fatigue affects running.",
  };

  return `${instructions[input.draft.role]}${bridgeNote}${effortNote}${terrainNote}`;
}

function getTargetHeartRateZone(draft: WeekWorkoutDraft): string | null {
  const zones: Record<WeekWorkoutDraft["role"], string | null> = {
    calibration: "Zone 2 to low Zone 3",
    easy: "Zone 2",
    recovery: "Zone 1 to Zone 2",
    medium_long: "Zone 2",
    steady: "Upper Zone 2 to Zone 3",
    threshold: "Zone 3 to Zone 4",
    interval: "Zone 4",
    race_pace: "Zone 3",
    long_easy: "Zone 2",
    long_steady: "Zone 2 to Zone 3",
    long_race_specific: "Zone 2 to Zone 3",
    race_day: "Race effort",
    rest: null,
    strength: null,
  };

  return zones[draft.role];
}

function buildGeneratedWorkout(input: {
  prescription: WorkoutPrescription;
  profileId: string;
  raceGoalId: string;
}): GeneratedPlannedWorkout {
  const workout = {
    profile_id: input.profileId,
    race_goal_id: input.raceGoalId,
    workout_date: input.prescription.dateText,
    week_number: input.prescription.weekNumber,
    day_label: input.prescription.dayLabel,
    workout_type: input.prescription.workoutType,
    title: input.prescription.title,
    description: input.prescription.description,
    distance_km: input.prescription.distanceKm,
    duration_min: input.prescription.durationMin,
    target_pace_min_sec_per_km: input.prescription.targetPaceMinSecPerKm,
    target_pace_max_sec_per_km: input.prescription.targetPaceMaxSecPerKm,
    target_hr_zone: input.prescription.targetHrZone,
    terrain: input.prescription.terrain,
    purpose: input.prescription.purpose,
    instructions: input.prescription.instructions,
    status: "planned",
  } satisfies Omit<GeneratedPlannedWorkout, "structured_workout">;

  return {
    ...workout,
    structured_workout: buildStructuredWorkout(workout),
  };
}

function addPlanSummaryWarnings(input: {
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
  weekPlans: WeekPlan[];
}): void {
  const minimumMeaningfulWeeks = input.input.goal.raceType === "marathon" ? 12 : 8;

  if (input.weekPlans.length < minimumMeaningfulWeeks) {
    input.input.warnings.push(
      `Race day is only ${input.weekPlans.length} week${input.weekPlans.length === 1 ? "" : "s"} away, so this is a race-prep plan rather than a full development build.`,
    );
  }

  if (input.input.history.longestRunKm6w < input.metrics.peakLongRunKm * 0.55) {
    input.input.warnings.push(
      "Longest recent run is well below the planned peak long run, so long-run progression is capped and cutback weeks matter.",
    );
  }
}

function getAvailableTrainingDays(
  runnerProfile: RunnerProfile,
  runningDaysPerWeek: RunningDaysPerWeek,
  assumptions: string[],
  warnings: string[],
): TrainingDay[] {
  if (runnerProfile.available_training_days.length === 0) {
    const fallbackDays = fallbackTrainingDaysByCount[runningDaysPerWeek];

    assumptions.push(
      `No available training days were saved, so the plan assumes ${runningDaysPerWeek} evenly spaced running days.`,
    );
    warnings.push(
      `Available training days are missing, so the plan uses ${fallbackDays.map(formatDayLabel).join(", ")} as a fallback.`,
    );

    return fallbackDays;
  }

  if (runnerProfile.available_training_days.length < runningDaysPerWeek) {
    warnings.push(
      `Profile has ${runnerProfile.available_training_days.length} available training day${runnerProfile.available_training_days.length === 1 ? "" : "s"}, but ${runningDaysPerWeek} running days per week were requested. The plan uses the saved available days instead of compressing extra stress.`,
    );
  }

  return sortTrainingDays(runnerProfile.available_training_days);
}

function selectRunningDaysForPlan(input: {
  availableTrainingDays: TrainingDay[];
  runningDaysPerWeek: RunningDaysPerWeek;
  preferredLongRunDay: TrainingDay | null;
}): TrainingDay[] {
  if (input.availableTrainingDays.length <= input.runningDaysPerWeek) {
    return sortTrainingDays(input.availableTrainingDays);
  }

  const anchorDay = getAnchorRunDay(
    input.availableTrainingDays,
    input.preferredLongRunDay,
  );
  const combinations = getTrainingDayCombinations(
    input.availableTrainingDays,
    input.runningDaysPerWeek,
  );
  const validCombinations = anchorDay
    ? combinations.filter((combination) => combination.includes(anchorDay))
    : combinations;

  return validCombinations.reduce((bestCombination, combination) => {
    if (scoreRunningDaySpread(combination) < scoreRunningDaySpread(bestCombination)) {
      return combination;
    }

    return bestCombination;
  }, validCombinations[0]);
}

function getAnchorRunDay(
  availableTrainingDays: TrainingDay[],
  preferredLongRunDay: TrainingDay | null,
): TrainingDay | null {
  if (
    preferredLongRunDay &&
    availableTrainingDays.includes(preferredLongRunDay)
  ) {
    return preferredLongRunDay;
  }

  if (availableTrainingDays.includes("sunday")) {
    return "sunday";
  }

  if (availableTrainingDays.includes("saturday")) {
    return "saturday";
  }

  return null;
}

function getTrainingDayCombinations(
  availableTrainingDays: TrainingDay[],
  runningDaysPerWeek: RunningDaysPerWeek,
): TrainingDay[][] {
  const sortedDays = sortTrainingDays(availableTrainingDays);
  const combinations: TrainingDay[][] = [];

  function buildCombination(startIndex: number, combination: TrainingDay[]) {
    if (combination.length === runningDaysPerWeek) {
      combinations.push(combination);
      return;
    }

    for (let index = startIndex; index < sortedDays.length; index += 1) {
      buildCombination(index + 1, [...combination, sortedDays[index]]);
    }
  }

  buildCombination(0, []);

  return combinations;
}

function scoreRunningDaySpread(trainingDays: TrainingDay[]): number {
  const dayIndexes = trainingDays
    .map((trainingDay) => dayOrder.indexOf(trainingDay))
    .sort((firstIndex, secondIndex) => firstIndex - secondIndex);
  const gaps = dayIndexes.map((dayIndex, index) => {
    const nextDayIndex = dayIndexes[(index + 1) % dayIndexes.length];
    return nextDayIndex > dayIndex
      ? nextDayIndex - dayIndex
      : nextDayIndex + 7 - dayIndex;
  });

  return Math.max(...gaps) - Math.min(...gaps);
}

function getTerrainAvailable(
  runnerProfile: RunnerProfile,
  assumptions: string[],
): TerrainAvailable[] {
  if (runnerProfile.terrain_available.length > 0) {
    return runnerProfile.terrain_available;
  }

  const terrainFromNewFields = getTerrainFromNewProfileFields(runnerProfile);

  if (terrainFromNewFields.length > 0) {
    return terrainFromNewFields;
  }

  if (runnerProfile.terrain_available.length === 0) {
    assumptions.push(
      "No terrain options were saved, so the plan assumes flat routes and treadmill access.",
    );
    return defaultTerrain;
  }

  return runnerProfile.terrain_available;
}

function getTerrainFromNewProfileFields(
  runnerProfile: RunnerProfile,
): TerrainAvailable[] {
  const terrain = new Set<TerrainAvailable>();

  if (
    runnerProfile.typical_surface === "road" ||
    runnerProfile.typical_surface === "mixed"
  ) {
    terrain.add("flat");
  }

  if (runnerProfile.typical_surface === "trail") {
    terrain.add("trails");
  }

  if (runnerProfile.typical_surface === "track") {
    terrain.add("track");
  }

  if (runnerProfile.typical_surface === "treadmill") {
    terrain.add("treadmill");
  }

  if (
    runnerProfile.typical_elevation_profile === "rolling" ||
    runnerProfile.typical_elevation_profile === "hilly" ||
    runnerProfile.typical_elevation_profile === "mountainous" ||
    runnerProfile.typical_elevation_profile === "mixed"
  ) {
    terrain.add("hills");
  }

  return Array.from(terrain);
}

function getLongRunDay(
  runnerProfile: RunnerProfile,
  availableTrainingDays: TrainingDay[],
  assumptions: string[],
): TrainingDay {
  if (
    runnerProfile.preferred_long_run_day &&
    availableTrainingDays.includes(runnerProfile.preferred_long_run_day)
  ) {
    return runnerProfile.preferred_long_run_day;
  }

  if (runnerProfile.preferred_long_run_day) {
    assumptions.push(
      `Preferred long run day (${formatDayLabel(
        runnerProfile.preferred_long_run_day,
      )}) is not in selected running days, so the plan uses another available day.`,
    );
  } else {
    assumptions.push(
      "No preferred long run day was saved, so the plan uses the best available weekend-like day.",
    );
  }

  if (availableTrainingDays.includes("sunday")) {
    return "sunday";
  }

  if (availableTrainingDays.includes("saturday")) {
    return "saturday";
  }

  return availableTrainingDays[availableTrainingDays.length - 1];
}

function getDraftForDay(
  drafts: WeekWorkoutDraft[],
  day: PlannedDay,
): WeekWorkoutDraft {
  const draft = drafts.find((candidate) => candidate.day.dateText === day.dateText);

  if (!draft) {
    throw new Error(`Missing workout draft for ${day.dateText}.`);
  }

  return draft;
}

function validateGeneratorDates(input: {
  startDateText: string;
  raceDateText: string;
}): void {
  const todayDateText = getLocalDateText();

  if (!isValidDateText(input.startDateText)) {
    throw new Error("Choose a valid plan start date.");
  }

  if (!isValidDateText(input.raceDateText)) {
    throw new Error("Race date is missing or invalid. Update the active Race Goal before generating a plan.");
  }

  if (input.startDateText < todayDateText) {
    throw new Error("Plan start date cannot be in the past.");
  }

  if (input.raceDateText < todayDateText) {
    throw new Error("Race date is in the past. Update the active Race Goal before generating a plan.");
  }

  if (input.raceDateText < input.startDateText) {
    throw new Error("Race date must be on or after the plan start date.");
  }
}

function hasHillSignal(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalizedValue = value.toLowerCase();

  return (
    normalizedValue.includes("hill") ||
    normalizedValue.includes("hilly") ||
    normalizedValue.includes("rolling") ||
    normalizedValue.includes("elevation") ||
    normalizedValue.includes("climb")
  );
}

function isValidDateText(dateText: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return false;
  }

  return formatDateOnly(parseDateOnly(dateText)) === dateText;
}

export function buildDefaultTrainingPlanName(raceGoal: RaceGoal): string {
  const distanceLabel =
    raceGoal.distance === "marathon" ? "Marathon" : "Half Marathon";
  return `${raceGoal.race_name} ${distanceLabel} Plan`;
}

function sortTrainingDays(trainingDays: TrainingDay[]): TrainingDay[] {
  return [...trainingDays].sort(
    (firstDay, secondDay) =>
      dayOrder.indexOf(firstDay) - dayOrder.indexOf(secondDay),
  );
}

function parseDateOnly(dateText: string): Date {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, daysToAdd: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + daysToAdd);
  return nextDate;
}

function daysBetween(startDate: Date, endDate: Date): number {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.round(
    (endDate.getTime() - startDate.getTime()) / millisecondsPerDay,
  );
}

function getTrainingDay(date: Date): TrainingDay {
  const jsDay = date.getDay();
  const dayByJsDay: Record<number, TrainingDay> = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
  };

  return dayByJsDay[jsDay];
}

function pickFirstAvailable(
  terrainAvailable: TerrainAvailable[],
  preferredTerrain: TerrainAvailable[],
): TerrainAvailable | null {
  return (
    preferredTerrain.find((terrain) => terrainAvailable.includes(terrain)) ??
    terrainAvailable[0] ??
    null
  );
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

function formatRaceDistance(raceDistance: RaceDistance): string {
  return raceDistance === "marathon" ? "marathon" : "half marathon";
}

function formatPhaseLabel(phase: PhaseLabel): string {
  const labels: Record<PhaseLabel, string> = {
    base: "base",
    build: "build",
    specific: "specific",
    peak: "peak",
    taper: "taper",
    race_prep: "race prep",
  };

  return labels[phase];
}

function formatDayLabel(trainingDay: TrainingDay): string {
  return `${trainingDay.charAt(0).toUpperCase()}${trainingDay.slice(1)}`;
}

function formatTerrainLabel(terrain: TerrainAvailable): string {
  const labels: Record<TerrainAvailable, string> = {
    flat: "flat route",
    hills: "hills",
    track: "track",
    treadmill: "treadmill",
    trails: "trails",
    downhill: "downhill route",
  };

  return labels[terrain];
}

function formatPaceLabel(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = String(secondsPerKm % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}
