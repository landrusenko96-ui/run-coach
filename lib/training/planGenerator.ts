import { getEffectiveRunningDaysPerWeek } from "./runningDays.ts";
import { getLocalDateText } from "./planStart.ts";
import { buildStructuredWorkout } from "./structuredWorkout.ts";
import {
  analyzeTrainingEvidence,
  type TrainingEvidence,
} from "./trainingEvidence.ts";
import {
  getRoleForSubtype,
  getStressForSubtype,
  getTitleForSubtype,
  getWorkoutTypeForSubtype,
  resolveWorkoutPrescription,
  type PlanWorkoutSubtype,
  type WorkoutLibraryRole,
  type WorkoutLibraryStress,
} from "./workoutLibrary.ts";
import type {
  GeneratedPlannedWorkout,
  GeneratedTrainingPlan,
  LoggedWorkout,
  PlanGenerationFeasibilityRating,
  PlanGenerationFitnessConfidence,
  PlanGenerationPeakSummary,
  PlanGenerationPhaseLabel,
  PlanGenerationPhaseSummary,
  PlanGenerationTaperSummary,
  RaceDistance,
  RaceGoal,
  RecentTrainingWeekInput,
  RunnerProfile,
  RunningDaysPerWeek,
  StructuredWorkout,
  TerrainAvailable,
  TrainingAggressiveness,
  TrainingDay,
  WorkoutType,
} from "@/types/training";

type PlanGeneratorOptions = {
  startDate?: string;
  recentHistory?: RecentTrainingWeekInput[];
  recentHistoryWorkouts?: LoggedWorkout[];
};

type PlanMode = "relaxed" | "moderate" | "aggressive" | "very_aggressive";

type RacePriority = "A" | "B" | "casual";

type GoalFlexibility = "fixed" | "flexible" | "finish_only";

type FitnessConfidence = PlanGenerationFitnessConfidence;

type GoalFeasibilityRating = PlanGenerationFeasibilityRating;

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

type PhaseLabel = PlanGenerationPhaseLabel;

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
  preferredRestDay: TrainingDay | null;
  preferredWorkoutDays: TrainingDay[];
  longRunDay: TrainingDay;
  unavailableDays: TrainingDay[];
  maximumWeekdaySessionDurationMin: number | null;
  maximumWeekendSessionDurationMin: number | null;
  crossTrainingAvailable: boolean;
  doubleRunWillingness: boolean;
};

type AthleteProfile = {
  age: number | null;
  sex: RunnerProfile["sex"];
  heightCm: number | null;
  weightKg: number | null;
  easyPaceSecPerKm: number | null;
  thresholdPaceSecPerKm: number | null;
  runningExperienceLevel: RunnerProfile["running_experience_level"];
  injurySignal: "none" | "note" | "current_or_serious";
};

type EnvironmentProfile = {
  terrainAvailable: TerrainAvailable[];
  flatRoutesAvailable: boolean;
  hillsAvailable: boolean;
  treadmillAvailable: boolean;
  trailAccess: boolean;
  raceCourseProfile: RaceGoal["race_course_profile"];
  raceCourseNotes: string | null;
  expectedWeatherNotes: string | null;
  raceCourseProfileKnown: boolean;
  raceCourseLooksFlat: boolean;
  raceCourseLooksRolling: boolean;
  raceCourseLooksHilly: boolean;
  weatherCaution: boolean;
  effortTargetBias: boolean;
};

type RecentTrainingHistory = TrainingEvidence;

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
  structuredWorkout: StructuredWorkout | null;
};

type WeekWorkoutDraft = {
  day: PlannedDay;
  workoutType: WorkoutType;
  subtype: PlanWorkoutSubtype;
  role: WorkoutLibraryRole;
  stress: WorkoutLibraryStress;
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
    recentHistoryWorkouts: options.recentHistoryWorkouts,
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
  const generationMetadata = buildPlanGenerationMetadata({
    metrics: derivedMetrics,
    weekPlans,
    assumptions: normalizedInput.assumptions,
    warnings: normalizedInput.warnings,
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
      generator_version: generationMetadata.generator_version,
      feasibility_rating: generationMetadata.feasibility_rating,
      fitness_confidence: generationMetadata.fitness_confidence,
      generation_assumptions: generationMetadata.generation_assumptions,
      generation_warnings: generationMetadata.generation_warnings,
      phase_summaries: generationMetadata.phase_summaries,
      weekly_summaries: generationMetadata.weekly_summaries,
      peak_summary: generationMetadata.peak_summary,
      taper_summary: generationMetadata.taper_summary,
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
  recentHistoryWorkouts?: LoggedWorkout[];
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
    preferredRestDay: input.runnerProfile.preferred_rest_day,
    assumptions,
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
      preferredRestDay: input.runnerProfile.preferred_rest_day,
      preferredWorkoutDays: sortTrainingDays(input.runnerProfile.preferred_workout_days),
      longRunDay,
      unavailableDays: dayOrder.filter((day) => !selectedRunningDays.includes(day)),
      maximumWeekdaySessionDurationMin:
        input.runnerProfile.maximum_weekday_session_duration_min,
      maximumWeekendSessionDurationMin:
        input.runnerProfile.maximum_weekend_session_duration_min,
      crossTrainingAvailable: input.runnerProfile.cross_training_available,
      doubleRunWillingness: input.runnerProfile.double_run_willingness,
    },
    athlete,
    environment: {
      terrainAvailable,
      flatRoutesAvailable: terrainAvailable.includes("flat") || terrainAvailable.includes("track"),
      hillsAvailable: terrainAvailable.includes("hills"),
      treadmillAvailable: terrainAvailable.includes("treadmill"),
      trailAccess: terrainAvailable.includes("trails"),
      raceCourseProfile: input.raceGoal.race_course_profile,
      raceCourseNotes: input.raceGoal.course_elevation_notes,
      expectedWeatherNotes: input.raceGoal.expected_weather_notes,
      raceCourseProfileKnown:
        Boolean(input.raceGoal.race_course_profile) ||
        Boolean(input.raceGoal.course_elevation_notes?.trim()),
      raceCourseLooksFlat:
        input.raceGoal.race_course_profile === "flat" ||
        hasFlatSignal(input.raceGoal.course_elevation_notes),
      raceCourseLooksRolling: input.raceGoal.race_course_profile === "rolling",
      raceCourseLooksHilly:
        input.raceGoal.race_course_profile === "hilly" ||
        input.raceGoal.race_course_profile === "mountainous" ||
        input.raceGoal.race_course_profile === "rolling" ||
        hasHillSignal(input.raceGoal.course_elevation_notes),
      weatherCaution: hasWeatherCautionSignal(input.raceGoal.expected_weather_notes),
      effortTargetBias:
        terrainAvailable.includes("trails") ||
        input.raceGoal.race_course_profile === "hilly" ||
        input.raceGoal.race_course_profile === "mountainous" ||
        input.raceGoal.race_course_profile === "rolling" ||
        hasWeatherCautionSignal(input.raceGoal.expected_weather_notes),
    },
    history: buildRecentTrainingHistory({
      runnerProfile: input.runnerProfile,
      raceGoal: input.raceGoal,
      runningDaysPerWeek: selectedRunningDays.length,
      recentHistory: input.recentHistory,
      recentHistoryWorkouts: input.recentHistoryWorkouts,
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
    runningExperienceLevel: runnerProfile.running_experience_level,
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
  raceGoal: RaceGoal;
  runningDaysPerWeek: number;
  recentHistory?: RecentTrainingWeekInput[];
  recentHistoryWorkouts?: LoggedWorkout[];
  assumptions: string[];
  warnings: string[];
}): RecentTrainingHistory {
  const evidence = analyzeTrainingEvidence({
    runnerProfile: input.runnerProfile,
    raceGoal: input.raceGoal,
    selectedRunningDaysPerWeek: input.runningDaysPerWeek,
    recentHistory: input.recentHistory,
    recentHistoryWorkouts: input.recentHistoryWorkouts,
  });

  input.assumptions.push(...evidence.assumptions);
  input.warnings.push(...evidence.warnings);

  return evidence;
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
    fitnessConfidence: input.input.history.fitnessConfidence,
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
  let startLoadKm = getStartLoadKm(input.input);
  let peakLoadKm = getPeakLoadKm({
    raceDistance: input.input.goal.raceType,
    planMode: input.input.goal.planMode,
    avgKm6w: input.input.history.avgKm6w,
    runDaysPerWeek: input.input.availability.selectedRunningDays.length,
    injurySignal: input.input.athlete.injurySignal,
    runningExperienceLevel: input.input.athlete.runningExperienceLevel,
    age: input.input.athlete.age,
    heightCm: input.input.athlete.heightCm,
    weightKg: input.input.athlete.weightKg,
    doubleRunWillingness: input.input.availability.doubleRunWillingness,
  });
  const weeklyDurationCapacityKm = getWeeklyDurationCapacityKm(input.input, easySecPerKm);

  if (weeklyDurationCapacityKm !== null && peakLoadKm > weeklyDurationCapacityKm) {
    input.input.warnings.push(
      `Max session duration limits reduce peak load from ${peakLoadKm} km/week to about ${weeklyDurationCapacityKm} km/week.`,
    );
    peakLoadKm = Math.max(
      input.input.goal.raceType === "marathon" ? 14 : 8,
      Math.round(weeklyDurationCapacityKm),
    );
    startLoadKm = Math.min(startLoadKm, Math.max(8, Math.round(peakLoadKm * 0.82)));
  }
  const cutbackIntervalWeeks = getCutbackIntervalWeeks({
    planMode: input.input.goal.planMode,
    age: input.input.athlete.age,
    injurySignal: input.input.athlete.injurySignal,
    runningExperienceLevel: input.input.athlete.runningExperienceLevel,
  });
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
    runningExperienceLevel: input.input.athlete.runningExperienceLevel,
    age: input.input.athlete.age,
    heightCm: input.input.athlete.heightCm,
    weightKg: input.input.athlete.weightKg,
    avgKm6w: input.input.history.avgKm6w,
  });
  const peakLongRunKm = getPeakLongRunKm({
    raceDistance: input.input.goal.raceType,
    volumeCategory,
    planMode: input.input.goal.planMode,
    peakLoadKm,
    easySecPerKm,
    longRunDayDurationCapMin: getSessionDurationCapMin(
      input.input.availability.longRunDay,
      input.input.availability,
    ),
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

  if (input.history.thresholdEstimateSecPerKm !== null) {
    return input.history.thresholdEstimateSecPerKm;
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
  fitnessConfidence: FitnessConfidence;
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
  const longRunSharePenalty =
    input.history.maxLongRunShare6w !== null && input.history.maxLongRunShare6w > 0.42
      ? 1.02
      : 1;
  const evidencePenalty = input.fitnessConfidence === "low" ? 1.02 : 1;

  return Math.round(
    input.thresholdSecPerKm *
      baseMultiplier *
      durabilityPenalty *
      longRunSupportPenalty *
      longRunSharePenalty *
      evidencePenalty,
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
  return input.history.fitnessConfidence;
}

function getStartLoadKm(input: NormalizedPlanInput): number {
  const consistencyMultiplier = input.history.loadConsistency < 0.75 ? 0.85 : 1;
  const rampMultiplier =
    input.history.recentRamp > 1.35
      ? 0.9
      : input.history.recentRamp < 0.7
        ? 0.92
        : 1;
  const modeMultiplier =
    input.goal.planMode === "relaxed"
      ? 0.95
      : isAggressivePlanMode(input.goal.planMode)
        ? 1.03
        : 1;
  const injuryMultiplier =
    input.athlete.injurySignal === "current_or_serious" ? 0.85 : 1;
  const beginnerMultiplier =
    input.athlete.runningExperienceLevel === "beginner" ? 0.92 : 1;
  const bodyLoadMultiplier = getBodyLoadToleranceMultiplier({
    athlete: input.athlete,
    avgKm6w: input.history.avgKm6w,
    planMode: input.goal.planMode,
  });

  return Math.max(
    input.goal.raceType === "marathon" ? 16 : 10,
    Math.round(
      input.history.avgKm6w *
        consistencyMultiplier *
        rampMultiplier *
        modeMultiplier *
        injuryMultiplier *
        beginnerMultiplier *
        bodyLoadMultiplier,
    ),
  );
}

function getBodyLoadToleranceMultiplier(input: {
  athlete: {
    heightCm: number | null;
    weightKg: number | null;
    runningExperienceLevel: AthleteProfile["runningExperienceLevel"];
  };
  avgKm6w: number;
  planMode: PlanMode;
}): number {
  const bmi = getBodyMassIndex(input.athlete.heightCm, input.athlete.weightKg);

  if (bmi === null) {
    return 1;
  }

  const lowBaseOrBeginner =
    input.avgKm6w < 30 || input.athlete.runningExperienceLevel === "beginner";

  if (bmi >= 30 && lowBaseOrBeginner) {
    return 0.93;
  }

  if (bmi >= 27 && input.avgKm6w < 25) {
    return 0.96;
  }

  if (bmi < 18.5 && isAggressivePlanMode(input.planMode)) {
    return 0.95;
  }

  return 1;
}

function getBodyMassIndex(
  heightCm: number | null,
  weightKg: number | null,
): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
    return null;
  }

  const heightM = heightCm / 100;

  return weightKg / (heightM * heightM);
}

function getPeakLoadKm(input: {
  raceDistance: RaceDistance;
  planMode: PlanMode;
  avgKm6w: number;
  runDaysPerWeek: number;
  injurySignal: AthleteProfile["injurySignal"];
  runningExperienceLevel: AthleteProfile["runningExperienceLevel"];
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  doubleRunWillingness: boolean;
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
  const sessionCapacityCap =
    input.runDaysPerWeek *
    getRealisticAverageSessionKm({
      avgKm6w: input.avgKm6w,
      runDaysPerWeek: input.runDaysPerWeek,
      runningExperienceLevel: input.runningExperienceLevel,
      doubleRunWillingness: input.doubleRunWillingness,
      planMode: input.planMode,
    });
  const ageLoadMultiplier = input.age !== null && input.age >= 55 ? 0.92 : input.age !== null && input.age >= 45 ? 0.96 : 1;
  const injuryLoadMultiplier = input.injurySignal === "current_or_serious" ? 0.85 : 1;
  const experienceLoadMultiplier =
    input.runningExperienceLevel === "beginner"
      ? 0.9
      : input.runningExperienceLevel === "advanced"
        ? 1.03
        : 1;
  const bodyLoadMultiplier = getBodyLoadToleranceMultiplier({
    athlete: {
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      runningExperienceLevel: input.runningExperienceLevel,
    },
    avgKm6w: input.avgKm6w,
    planMode: input.planMode,
  });

  return Math.max(
    Math.round(input.avgKm6w),
    Math.round(
      Math.min(rawPeak, sessionCapacityCap) *
        ageLoadMultiplier *
        injuryLoadMultiplier *
        experienceLoadMultiplier *
        bodyLoadMultiplier,
    ),
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

function getRealisticAverageSessionKm(input: {
  avgKm6w: number;
  runDaysPerWeek?: number;
  runningExperienceLevel?: AthleteProfile["runningExperienceLevel"];
  doubleRunWillingness?: boolean;
  planMode?: PlanMode;
}): number {
  let sessionKm: number;

  if (input.avgKm6w < 20) {
    sessionKm = 10;
  } else if (input.avgKm6w < 45) {
    sessionKm = 14;
  } else if (input.avgKm6w < 70) {
    sessionKm = 17;
  } else {
    sessionKm = 20;
  }

  const doubleRunCapacitySignal =
    Boolean(input.doubleRunWillingness) &&
    input.runningExperienceLevel === "advanced" &&
    (input.runDaysPerWeek ?? 0) >= 5 &&
    input.avgKm6w >= 60 &&
    isAggressivePlanMode(input.planMode ?? "moderate");

  return doubleRunCapacitySignal ? sessionKm * 1.06 : sessionKm;
}

function getCutbackIntervalWeeks(input: {
  planMode: PlanMode;
  age: number | null;
  injurySignal: AthleteProfile["injurySignal"];
  runningExperienceLevel: AthleteProfile["runningExperienceLevel"];
}): number {
  let intervalWeeks: number;

  if (input.planMode === "relaxed") {
    intervalWeeks = 3;
  } else if (isAggressivePlanMode(input.planMode)) {
    intervalWeeks = 5;
  } else {
    intervalWeeks = 4;
  }

  if (
    input.injurySignal === "current_or_serious" ||
    input.runningExperienceLevel === "beginner" ||
    (input.age !== null && input.age >= 55)
  ) {
    intervalWeeks -= 1;
  }

  return Math.max(2, intervalWeeks);
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
  runningExperienceLevel: AthleteProfile["runningExperienceLevel"];
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  avgKm6w: number;
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

  if (input.runningExperienceLevel === "beginner") {
    cap = Math.min(cap, 0.045);
  }

  if (input.age !== null && input.age >= 55) {
    cap = Math.min(cap, 0.06);
  } else if (input.age !== null && input.age >= 45) {
    cap = Math.min(cap, 0.08);
  }

  if (
    getBodyLoadToleranceMultiplier({
      athlete: {
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        runningExperienceLevel: input.runningExperienceLevel,
      },
      avgKm6w: input.avgKm6w,
      planMode: input.planMode,
    }) < 1
  ) {
    cap = Math.min(cap, 0.05);
  }

  return cap;
}

function getPeakLongRunKm(input: {
  raceDistance: RaceDistance;
  volumeCategory: VolumeCategory;
  planMode: PlanMode;
  peakLoadKm: number;
  easySecPerKm: number;
  longRunDayDurationCapMin: number | null;
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
  const profileDurationPeak =
    input.longRunDayDurationCapMin !== null
      ? (input.longRunDayDurationCapMin * 60) / (input.easySecPerKm + 65)
      : Number.POSITIVE_INFINITY;

  return roundDistance(
    Math.min(categoryPeak, longRunShareCap, durationPeak, profileDurationPeak),
  );
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

function getWeeklyDurationCapacityKm(
  input: NormalizedPlanInput,
  easySecPerKm: number,
): number | null {
  const hasAnyCap =
    input.availability.maximumWeekdaySessionDurationMin !== null ||
    input.availability.maximumWeekendSessionDurationMin !== null;

  if (!hasAnyCap) {
    return null;
  }

  const capacityKm = input.availability.selectedRunningDays.reduce(
    (total, trainingDay) => {
      const durationCapMin = getSessionDurationCapMin(
        trainingDay,
        input.availability,
      );

      if (durationCapMin === null) {
        return total + getUncappedSessionCapacityKm(input.history.avgKm6w);
      }

      return total + (durationCapMin * 60) / (easySecPerKm + 35);
    },
    0,
  );

  return roundDistance(capacityKm);
}

function getSessionDurationCapMin(
  trainingDay: TrainingDay,
  availability: AvailabilityProfile,
): number | null {
  if (trainingDay === "saturday" || trainingDay === "sunday") {
    return availability.maximumWeekendSessionDurationMin;
  }

  return availability.maximumWeekdaySessionDurationMin;
}

function getUncappedSessionCapacityKm(avgKm6w: number): number {
  return getRealisticAverageSessionKm({ avgKm6w });
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

  if (
    input.input.environment.raceCourseLooksFlat &&
    !input.input.environment.flatRoutesAvailable &&
    !input.input.environment.treadmillAvailable &&
    !input.input.environment.terrainAvailable.includes("track")
  ) {
    input.input.warnings.push(
      "The race course looks flat, but saved terrain does not include flat routes, track, or treadmill access. Race-specific sessions keep effort guidance conservative.",
    );
  }

  if (input.input.environment.raceCourseLooksHilly && !input.input.environment.hillsAvailable) {
    input.input.warnings.push(
      "The race course looks hilly, but the profile does not list hill access. The plan keeps terrain notes conservative until hill exposure is available.",
    );
  }

  if (
    input.input.environment.raceCourseLooksHilly &&
    (input.input.history.elevationTolerance === "unknown" ||
      input.input.history.elevationTolerance === "low")
  ) {
    input.input.warnings.push(
      "The race course looks hilly, but recent elevation exposure is low or unknown.",
    );
  }

  if (input.input.environment.weatherCaution) {
    input.input.warnings.push(
      "Expected weather notes mention heat, humidity, wind, cold, rain, or exposure, so workout instructions emphasize effort control when conditions affect pace.",
    );
  }

  if (input.input.athlete.age !== null && input.input.athlete.age >= 55) {
    input.input.assumptions.push(
      "Age is used as a recovery signal, so progression and high-intensity exposure are kept more conservative.",
    );
  } else if (input.input.athlete.age !== null && input.input.athlete.age >= 45) {
    input.input.assumptions.push(
      "Age is used as a mild recovery signal when selecting progression and hard-session exposure.",
    );
  }

  if (
    getBodyLoadToleranceMultiplier({
      athlete: input.input.athlete,
      avgKm6w: input.input.history.avgKm6w,
      planMode: input.input.goal.planMode,
    }) < 1
  ) {
    input.input.warnings.push(
      "Height and weight are used only as a load-tolerance signal here, so the plan slightly reduces progression because body data and current base suggest extra impact caution.",
    );
  }

  if (input.input.availability.doubleRunWillingness) {
    input.input.assumptions.push(
      "Double-run willingness is treated only as a small capacity signal for supported advanced plans; this schema still schedules at most one workout per date.",
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

    drafts.push(...weekDrafts);
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
    subtype: "rest",
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
    assignOptionalSupportDraft({
      drafts,
      input: input.input,
      weekPlan: input.weekPlan,
    });
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
      applyWorkoutSubtype(draft, "race_day");
      continue;
    }

    if (runDay.dateText === longRunDay.dateText) {
      applyWorkoutSubtype(
        draft,
        getLongRunSubtype({
          input: input.input,
          metrics: input.metrics,
          weekPlan: input.weekPlan,
          runDaysPerWeek: effectiveRunDays.length,
        }),
      );
      continue;
    }

    applyWorkoutSubtype(draft, "easy_base");
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
    input: input.input,
    metrics: input.metrics,
    weekPlan: input.weekPlan,
    runDays: effectiveRunDays,
    longRunDay,
  });
  assignRecoveryDrafts({
    drafts,
    weekPlan: input.weekPlan,
    runDays: effectiveRunDays,
  });
  assignStrideDraft({
    drafts,
    input: input.input,
    metrics: input.metrics,
    weekPlan: input.weekPlan,
    runDays: effectiveRunDays,
    longRunDay,
  });
  assignOptionalSupportDraft({
    drafts,
    input: input.input,
    weekPlan: input.weekPlan,
  });

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

function getLongRunSubtype(input: {
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
  weekPlan: WeekPlan;
  runDaysPerWeek: number;
}): PlanWorkoutSubtype {
  if (
    input.weekPlan.isCutback ||
    input.weekPlan.isTaper ||
    input.weekPlan.phase === "race_prep" ||
    input.input.athlete.injurySignal === "current_or_serious" ||
    input.input.history.recentRamp > 1.35
  ) {
    return "long_easy";
  }

  if (
    input.runDaysPerWeek >= 4 &&
    (input.weekPlan.phase === "specific" || input.weekPlan.phase === "peak") &&
    input.weekPlan.longRunKm >= input.metrics.peakLongRunKm * 0.62 &&
    input.metrics.feasibilityRating !== "not_credible" &&
    input.metrics.feasibilityRating !== "low_confidence" &&
    input.metrics.fitnessConfidence !== "low" &&
    input.metrics.volumeCategory !== "low_base" &&
    input.input.athlete.runningExperienceLevel !== "beginner" &&
    input.weekPlan.weekNumber % 3 === 0
  ) {
    return "long_mp_blocks";
  }

  if (
    input.runDaysPerWeek >= 3 &&
    (input.weekPlan.phase === "build" || input.weekPlan.phase === "specific") &&
    input.metrics.fitnessConfidence !== "low" &&
    input.weekPlan.weekNumber % 4 === 2
  ) {
    return "long_steady_finish";
  }

  return "long_easy";
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

  const primaryQualitySubtype = getPrimaryQualitySubtype({
    input: input.input,
    metrics: input.metrics,
    weekPlan: input.weekPlan,
    raceDistance: input.input.goal.raceType,
    phase: input.weekPlan.phase,
    weekNumber: input.weekPlan.weekNumber,
    runCount,
    volumeCategory: input.metrics.volumeCategory,
    runningExperienceLevel: input.input.athlete.runningExperienceLevel,
    fitnessConfidence: input.metrics.fitnessConfidence,
  });
  const qualityDay = pickQualityDay({
    candidates: input.runDays.filter(
      (runDay) => runDay.dateText !== input.longRunDay.dateText,
    ),
    longRunDay: input.longRunDay,
    role: getRoleForSubtype(primaryQualitySubtype),
    preferredWorkoutDays: input.input.availability.preferredWorkoutDays,
    assumptions: input.input.assumptions,
  });

  if (qualityDay) {
    applyWorkoutSubtype(getDraftForDay(input.drafts, qualityDay), primaryQualitySubtype);
  } else {
    const steadyDay = input.runDays.find(
      (runDay) => runDay.dateText !== input.longRunDay.dateText,
    );

    if (steadyDay) {
      applyWorkoutSubtype(getDraftForDay(input.drafts, steadyDay), "steady_aerobic");
    }
  }

  const canAddSecondControlledStimulus =
    runCount >= 6 &&
    isAggressivePlanMode(input.input.goal.planMode) &&
    (input.weekPlan.phase === "specific" || input.weekPlan.phase === "peak") &&
    input.metrics.volumeCategory !== "low_base" &&
    input.input.athlete.runningExperienceLevel !== "beginner" &&
    (input.input.athlete.age === null || input.input.athlete.age < 50) &&
    getBodyLoadToleranceMultiplier({
      athlete: input.input.athlete,
      avgKm6w: input.input.history.avgKm6w,
      planMode: input.input.goal.planMode,
    }) >= 1 &&
    input.metrics.fitnessConfidence !== "low";

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
    preferredWorkoutDays: input.input.availability.preferredWorkoutDays,
  });

  if (secondQualityDay) {
    applyWorkoutSubtype(getDraftForDay(input.drafts, secondQualityDay), "mp_steady");
  }
}

function getPrimaryQualitySubtype(input: {
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
  weekPlan: WeekPlan;
  raceDistance: RaceDistance;
  phase: PhaseLabel;
  weekNumber: number;
  runCount: number;
  volumeCategory: VolumeCategory;
  runningExperienceLevel: AthleteProfile["runningExperienceLevel"];
  fitnessConfidence: FitnessConfidence;
}): PlanWorkoutSubtype {
  if (
    input.input.environment.raceCourseLooksHilly &&
    input.input.environment.hillsAvailable &&
    (input.input.history.elevationTolerance === "moderate" ||
      input.input.history.elevationTolerance === "high") &&
    (input.phase === "base" || input.phase === "build") &&
    input.weekNumber % 4 === 0 &&
    input.runningExperienceLevel !== "beginner" &&
    (input.input.athlete.age === null || input.input.athlete.age < 55) &&
    input.input.athlete.injurySignal !== "current_or_serious"
  ) {
    return "hill_repeats";
  }

  if (
    input.runningExperienceLevel === "beginner" ||
    input.volumeCategory === "low_base" ||
    input.fitnessConfidence === "low" ||
    input.input.athlete.injurySignal === "current_or_serious" ||
    (input.input.athlete.age !== null && input.input.athlete.age >= 55) ||
    input.input.history.recentRamp > 1.35
  ) {
    if (input.phase === "race_prep") {
      return input.raceDistance === "half_marathon" ? "hm_pace_blocks" : "mp_steady";
    }

    if (
      !input.input.environment.flatRoutesAvailable ||
      input.input.environment.trailAccess ||
      input.fitnessConfidence === "low"
    ) {
      return "fartlek";
    }

    return "steady_aerobic";
  }

  if (input.phase === "race_prep") {
    return input.raceDistance === "half_marathon" ? "hm_pace_blocks" : "mp_steady";
  }

  if (input.runCount === 3) {
    return input.phase === "base" ? "steady_aerobic" : "cruise_intervals";
  }

  if (input.raceDistance === "half_marathon") {
    if (input.phase === "specific" && input.weekNumber % 2 === 0) {
      return "hm_pace_blocks";
    }

    if (input.weekNumber % 3 === 0) {
      return input.input.athlete.age !== null && input.input.athlete.age >= 45
        ? "cruise_intervals"
        : "vo2_intervals";
    }

    return "cruise_intervals";
  }

  if (input.phase === "specific" || input.phase === "peak") {
    return input.weekNumber % 3 === 0 ? "mp_steady" : "broken_tempo";
  }

  if (
    input.phase === "build" &&
    input.weekNumber % 4 === 0
  ) {
    return input.metrics.volumeCategory === "advanced_hobby"
      ? "vo2_intervals"
      : "fartlek";
  }

  return input.phase === "base" ? "steady_aerobic" : "cruise_intervals";
}

function pickQualityDay(input: {
  candidates: PlannedDay[];
  longRunDay: PlannedDay;
  role: WeekWorkoutDraft["role"];
  preferredWorkoutDays: TrainingDay[];
  assumptions: string[];
}): PlannedDay | null {
  const minimumGap = input.role === "interval" ? 3 : 2;
  const sortedCandidates = [...input.candidates].sort(
    (first, second) => first.date.getTime() - second.date.getTime(),
  );
  const safeCandidates = sortedCandidates.filter((candidate) => {
    const daysUntilLongRun = daysBetween(candidate.date, input.longRunDay.date);
    const daysAfterLongRun = daysBetween(input.longRunDay.date, candidate.date);

    return daysUntilLongRun >= minimumGap || daysAfterLongRun >= 2;
  });
  const preferredSafeCandidate = safeCandidates.find((candidate) =>
    input.preferredWorkoutDays.includes(candidate.dayLabel),
  );

  if (preferredSafeCandidate) {
    addUniqueAssumption(
      input.assumptions,
      `Preferred workout day (${formatDayLabel(preferredSafeCandidate.dayLabel)}) is used for quality work when spacing rules allow it.`,
    );
    return preferredSafeCandidate;
  }

  if (
    input.preferredWorkoutDays.length > 0 &&
    sortedCandidates.some((candidate) =>
      input.preferredWorkoutDays.includes(candidate.dayLabel),
    ) &&
    safeCandidates.length > 0
  ) {
    addUniqueAssumption(
      input.assumptions,
      "Saved preferred workout days conflicted with hard-day spacing in at least one week, so the safer quality day was used.",
    );
  }

  return safeCandidates[0] ?? null;
}

function pickSecondQualityDay(input: {
  candidates: PlannedDay[];
  preferredWorkoutDays: TrainingDay[];
}): PlannedDay | null {
  if (input.candidates.length === 0) {
    return null;
  }

  return (
    [...input.candidates]
      .reverse()
      .find((candidate) => input.preferredWorkoutDays.includes(candidate.dayLabel)) ??
    input.candidates[input.candidates.length - 1]
  );
}

function applyWorkoutSubtype(
  draft: WeekWorkoutDraft,
  subtype: PlanWorkoutSubtype,
): void {
  Object.assign(draft, {
    workoutType: getWorkoutTypeForSubtype(subtype),
    subtype,
    role: getRoleForSubtype(subtype),
    stress: getStressForSubtype(subtype),
    title: getTitleForSubtype(subtype),
  } satisfies Partial<WeekWorkoutDraft>);
}

function assignMediumLongDraft(input: {
  drafts: WeekWorkoutDraft[];
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
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

  const mediumLongSubtype =
    input.metrics.fitnessConfidence !== "low" &&
    input.input.athlete.runningExperienceLevel !== "beginner" &&
    (input.weekPlan.phase === "build" || input.weekPlan.phase === "specific")
      ? "medium_long_steady"
      : "medium_long_easy";

  applyWorkoutSubtype(getDraftForDay(input.drafts, mediumLongDay), mediumLongSubtype);
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
    applyWorkoutSubtype(draft, "recovery");
  }
}

function assignStrideDraft(input: {
  drafts: WeekWorkoutDraft[];
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
  weekPlan: WeekPlan;
  runDays: PlannedDay[];
  longRunDay: PlannedDay;
}): void {
  if (
    input.runDays.length < 4 ||
    input.weekPlan.isTaper ||
    input.weekPlan.phase === "race_prep"
  ) {
    return;
  }

  const strideCandidate = input.runDays.find((runDay) => {
    const draft = getDraftForDay(input.drafts, runDay);

    return (
      draft.subtype === "easy_base" &&
      runDay.dateText !== input.longRunDay.dateText &&
      daysBetween(runDay.date, input.longRunDay.date) >= 2
    );
  });

  if (!strideCandidate) {
    return;
  }

  const strideSubtype =
    input.input.environment.hillsAvailable &&
    input.input.history.elevationTolerance !== "low" &&
    input.input.history.elevationTolerance !== "unknown" &&
    input.weekPlan.weekNumber % 3 === 0
      ? "hill_strides"
      : "easy_strides";

  applyWorkoutSubtype(getDraftForDay(input.drafts, strideCandidate), strideSubtype);
}

function assignOptionalSupportDraft(input: {
  drafts: WeekWorkoutDraft[];
  input: NormalizedPlanInput;
  weekPlan: WeekPlan;
}): void {
  if (
    input.weekPlan.isTaper ||
    input.weekPlan.isRaceWeek ||
    input.weekPlan.weekNumber % 4 !== 0
  ) {
    return;
  }

  const restDrafts = input.drafts.filter((draft) => draft.workoutType === "rest");
  const suitableRestDrafts = restDrafts.filter((draft) =>
    isSuitableOptionalSupportDay(draft, input.drafts),
  );

  if (suitableRestDrafts.length === 0) {
    return;
  }

  const preferredRestDraft =
    input.input.availability.preferredRestDay !== null
      ? suitableRestDrafts.find(
          (draft) => draft.day.dayLabel === input.input.availability.preferredRestDay,
        )
      : null;
  const supportDraft =
    preferredRestDraft ?? suitableRestDrafts[Math.floor(suitableRestDrafts.length / 2)];

  if (input.input.availability.crossTrainingAvailable) {
    applyWorkoutSubtype(supportDraft, "cross_training_optional");
    addUniqueAssumption(
      input.input.assumptions,
      "Cross-training availability is used only for optional low-impact support on suitable rest days.",
    );
    return;
  }

  applyWorkoutSubtype(supportDraft, "strength_optional");
}

function isSuitableOptionalSupportDay(
  candidateDraft: WeekWorkoutDraft,
  weekDrafts: WeekWorkoutDraft[],
): boolean {
  return !weekDrafts.some((draft) => {
    if (
      draft.stress !== "hard" &&
      draft.role !== "long_easy" &&
      draft.role !== "long_steady" &&
      draft.role !== "long_race_specific" &&
      draft.role !== "race_day"
    ) {
      return false;
    }

    return Math.abs(daysBetween(candidateDraft.day.date, draft.day.date)) <= 1;
  });
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
  applyWorkoutSubtype(draft, "easy_base");
}

function softenDraftToSteady(draft: WeekWorkoutDraft): void {
  applyWorkoutSubtype(draft, "steady_aerobic");
}

function buildPrescriptionFromDraft(input: {
  draft: WeekWorkoutDraft;
  weekDrafts: WeekWorkoutDraft[];
  weekPlan: WeekPlan;
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
}): WorkoutPrescription {
  const rawDistanceKm = getDraftDistanceKm(input);
  const terrain = getWorkoutTerrain({
    draft: input.draft,
    weekNumber: input.weekPlan.weekNumber,
    environment: input.input.environment,
  });
  const resolvedPrescription = resolveWorkoutPrescription({
    subtype: input.draft.subtype,
    phase: input.weekPlan.phase,
    raceDistance: input.input.goal.raceType,
    weekNumber: input.weekPlan.weekNumber,
    weeklyVolumeKm: input.weekPlan.volumeKm,
    runDaysPerWeek: input.input.availability.selectedRunningDays.length,
    longRunKm: input.weekPlan.longRunKm,
    peakLongRunKm: input.metrics.peakLongRunKm,
    targetDistanceKm: rawDistanceKm,
    maxSessionDurationMin: getSessionDurationCapMin(
      input.draft.day.dayLabel,
      input.input.availability,
    ),
    dayLabel: input.draft.day.dayLabel,
    terrain,
    flatRoutesAvailable: input.input.environment.flatRoutesAvailable,
    trailAccess: input.input.environment.trailAccess,
    raceCourseLooksHilly: input.input.environment.raceCourseLooksHilly,
    effortTargetBias: input.input.environment.effortTargetBias,
    weatherCaution: input.input.environment.weatherCaution,
    fitnessConfidence: input.metrics.fitnessConfidence,
    feasibilityRating: input.metrics.feasibilityRating,
    paces: {
      easySecPerKm: input.metrics.easySecPerKm,
      thresholdSecPerKm: input.metrics.thresholdSecPerKm,
      currentRacePaceSecPerKm: input.metrics.currentRacePaceSecPerKm,
      bridgeRacePaceSecPerKm: input.metrics.bridgeRacePaceSecPerKm,
      goalRacePaceSecPerKm: input.metrics.goalRacePaceSecPerKm,
    },
  });

  if (resolvedPrescription.durationWasCapped) {
    addUniqueWarning(
      input.input.warnings,
      "Some generated workouts were shortened to respect saved maximum weekday or weekend session duration.",
    );
  }

  return {
    ...input.draft.day,
    workoutType: resolvedPrescription.workoutType,
    title: resolvedPrescription.title,
    description: resolvedPrescription.description,
    distanceKm: resolvedPrescription.distanceKm,
    durationMin: resolvedPrescription.durationMin,
    targetPaceMinSecPerKm: resolvedPrescription.targetPaceMinSecPerKm,
    targetPaceMaxSecPerKm: resolvedPrescription.targetPaceMaxSecPerKm,
    targetHrZone: resolvedPrescription.targetHrZone,
    terrain,
    purpose: resolvedPrescription.purpose,
    instructions: resolvedPrescription.instructions,
    structuredWorkout: resolvedPrescription.structuredWorkout,
  };
}

function getDraftDistanceKm(input: {
  draft: WeekWorkoutDraft;
  weekDrafts: WeekWorkoutDraft[];
  weekPlan: WeekPlan;
  input: NormalizedPlanInput;
  metrics: DerivedMetrics;
}): number | null {
  if (
    input.draft.workoutType === "rest" ||
    input.draft.workoutType === "strength_optional" ||
    input.draft.workoutType === "cross_training"
  ) {
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
    cross_training: 0,
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

function getWorkoutTerrain(input: {
  draft: WeekWorkoutDraft;
  weekNumber: number;
  environment: EnvironmentProfile;
}): TerrainAvailable | null {
  if (
    input.draft.workoutType === "rest" ||
    input.draft.workoutType === "strength_optional" ||
    input.draft.workoutType === "cross_training"
  ) {
    return null;
  }

  if (input.draft.subtype === "hill_repeats" || input.draft.subtype === "hill_strides") {
    return input.environment.hillsAvailable
      ? "hills"
      : pickFirstAvailable(input.environment.terrainAvailable, [
          "flat",
          "treadmill",
          "track",
        ]);
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

  if (input.draft.subtype === "fartlek") {
    return pickFirstAvailable(input.environment.terrainAvailable, [
      "trails",
      "hills",
      "flat",
      "treadmill",
      "track",
    ]);
  }

  if (input.draft.role === "threshold" || input.draft.role === "race_pace") {
    if (input.environment.raceCourseLooksFlat) {
      return pickFirstAvailable(input.environment.terrainAvailable, [
        "track",
        "flat",
        "treadmill",
        "hills",
        "trails",
      ]);
    }

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
    structured_workout:
      input.prescription.structuredWorkout ?? buildStructuredWorkout(workout),
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

function buildPlanGenerationMetadata(input: {
  metrics: DerivedMetrics;
  weekPlans: WeekPlan[];
  assumptions: string[];
  warnings: string[];
}): Pick<
  GeneratedTrainingPlan["trainingPlan"],
  | "generator_version"
  | "feasibility_rating"
  | "fitness_confidence"
  | "generation_assumptions"
  | "generation_warnings"
  | "phase_summaries"
  | "weekly_summaries"
  | "peak_summary"
  | "taper_summary"
> {
  return {
    generator_version: "rule_based_v1",
    feasibility_rating: input.metrics.feasibilityRating,
    fitness_confidence: input.metrics.fitnessConfidence,
    generation_assumptions: [...input.assumptions],
    generation_warnings: [...input.warnings],
    phase_summaries: buildPhaseSummaries(input.weekPlans),
    weekly_summaries: input.weekPlans.map((weekPlan) => ({
      week_number: weekPlan.weekNumber,
      phase: weekPlan.phase,
      volume_km: weekPlan.volumeKm,
      long_run_km: weekPlan.longRunKm,
      is_cutback: weekPlan.isCutback,
      is_taper: weekPlan.isTaper,
      is_race_week: weekPlan.isRaceWeek,
    })),
    peak_summary: buildPeakSummary(input.weekPlans),
    taper_summary: buildTaperSummary(input.weekPlans),
  };
}

function buildPhaseSummaries(weekPlans: WeekPlan[]): PlanGenerationPhaseSummary[] {
  const summaries: PlanGenerationPhaseSummary[] = [];

  for (const weekPlan of weekPlans) {
    const currentSummary = summaries[summaries.length - 1];

    if (currentSummary?.phase === weekPlan.phase) {
      currentSummary.end_week = weekPlan.weekNumber;
      currentSummary.week_count += 1;
      currentSummary.end_volume_km = weekPlan.volumeKm;
      currentSummary.peak_volume_km = Math.max(
        currentSummary.peak_volume_km,
        weekPlan.volumeKm,
      );
      currentSummary.peak_long_run_km = Math.max(
        currentSummary.peak_long_run_km,
        weekPlan.longRunKm,
      );

      if (weekPlan.isCutback) {
        currentSummary.cutback_week_numbers.push(weekPlan.weekNumber);
      }

      continue;
    }

    summaries.push({
      phase: weekPlan.phase,
      start_week: weekPlan.weekNumber,
      end_week: weekPlan.weekNumber,
      week_count: 1,
      start_volume_km: weekPlan.volumeKm,
      end_volume_km: weekPlan.volumeKm,
      peak_volume_km: weekPlan.volumeKm,
      peak_long_run_km: weekPlan.longRunKm,
      cutback_week_numbers: weekPlan.isCutback ? [weekPlan.weekNumber] : [],
    });
  }

  return summaries;
}

function buildPeakSummary(
  weekPlans: WeekPlan[],
): PlanGenerationPeakSummary | null {
  if (weekPlans.length === 0) {
    return null;
  }

  const peakWeek = weekPlans.reduce((bestWeek, weekPlan) =>
    weekPlan.volumeKm > bestWeek.volumeKm ? weekPlan : bestWeek,
  );

  return {
    week_number: peakWeek.weekNumber,
    phase: peakWeek.phase,
    volume_km: peakWeek.volumeKm,
    long_run_km: peakWeek.longRunKm,
  };
}

function buildTaperSummary(weekPlans: WeekPlan[]): PlanGenerationTaperSummary {
  const taperWeeks = weekPlans.filter((weekPlan) => weekPlan.isTaper);
  const raceWeek = weekPlans[weekPlans.length - 1] ?? null;
  const peakWeek = buildPeakSummary(weekPlans);
  const raceWeekVolumeKm = raceWeek?.volumeKm ?? 0;
  const peakVolumeKm = peakWeek?.volume_km ?? raceWeekVolumeKm;
  const reductionPercent =
    peakVolumeKm > 0
      ? Math.max(0, Math.round((1 - raceWeekVolumeKm / peakVolumeKm) * 100))
      : 0;

  return {
    taper_weeks: taperWeeks.length,
    start_week: taperWeeks[0]?.weekNumber ?? null,
    end_week: taperWeeks[taperWeeks.length - 1]?.weekNumber ?? null,
    race_week_volume_km: raceWeekVolumeKm,
    peak_to_race_week_reduction_percent: reductionPercent,
  };
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
  preferredRestDay: TrainingDay | null;
  assumptions: string[];
}): TrainingDay[] {
  if (input.availableTrainingDays.length <= input.runningDaysPerWeek) {
    if (
      input.preferredRestDay &&
      input.availableTrainingDays.includes(input.preferredRestDay)
    ) {
      addUniqueAssumption(
        input.assumptions,
        `Preferred rest day (${formatDayLabel(input.preferredRestDay)}) is also needed as a running day because available training days are limited.`,
      );
    }

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

  const selectedCombination = validCombinations.reduce((bestCombination, combination) => {
    if (
      scoreRunningDayCombination(combination, input.preferredRestDay) <
      scoreRunningDayCombination(bestCombination, input.preferredRestDay)
    ) {
      return combination;
    }

    return bestCombination;
  }, validCombinations[0]);

  if (
    input.preferredRestDay &&
    input.availableTrainingDays.includes(input.preferredRestDay)
  ) {
    if (selectedCombination.includes(input.preferredRestDay)) {
      addUniqueAssumption(
        input.assumptions,
        `Preferred rest day (${formatDayLabel(input.preferredRestDay)}) could not be kept free without weakening the running-day spread or long-run anchor.`,
      );
    } else {
      addUniqueAssumption(
        input.assumptions,
        `Preferred rest day (${formatDayLabel(input.preferredRestDay)}) is kept free of planned running when feasible.`,
      );
    }
  }

  return selectedCombination;
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

function scoreRunningDayCombination(
  trainingDays: TrainingDay[],
  preferredRestDay: TrainingDay | null,
): number {
  const restDayPenalty =
    preferredRestDay && trainingDays.includes(preferredRestDay) ? 4 : 0;

  return scoreRunningDaySpread(trainingDays) + restDayPenalty;
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

function hasFlatSignal(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalizedValue = value.toLowerCase();

  return (
    normalizedValue.includes("flat") ||
    normalizedValue.includes("fast") ||
    normalizedValue.includes("pancake") ||
    normalizedValue.includes("track")
  );
}

function hasWeatherCautionSignal(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalizedValue = value.toLowerCase();

  return (
    normalizedValue.includes("heat") ||
    normalizedValue.includes("hot") ||
    normalizedValue.includes("humid") ||
    normalizedValue.includes("humidity") ||
    normalizedValue.includes("wind") ||
    normalizedValue.includes("windy") ||
    normalizedValue.includes("gust") ||
    normalizedValue.includes("cold") ||
    normalizedValue.includes("ice") ||
    normalizedValue.includes("snow") ||
    normalizedValue.includes("rain") ||
    normalizedValue.includes("storm") ||
    normalizedValue.includes("sun") ||
    normalizedValue.includes("exposed")
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

function addUniqueWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function addUniqueAssumption(assumptions: string[], assumption: string): void {
  if (!assumptions.includes(assumption)) {
    assumptions.push(assumption);
  }
}

function formatDayLabel(trainingDay: TrainingDay): string {
  return `${trainingDay.charAt(0).toUpperCase()}${trainingDay.slice(1)}`;
}

function formatPaceLabel(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = String(secondsPerKm % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}
