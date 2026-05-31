import type {
  StructuredWorkout,
  TerrainAvailable,
  TrainingDay,
  WorkoutStep,
  WorkoutType,
} from "../../types/training.ts";
import type { AdvancedWorkoutTargets, WorkoutTargetKind } from "./physiology.ts";

export type PlanWorkoutSubtype =
  | "rest"
  | "strength_optional"
  | "cross_training_optional"
  | "calibration"
  | "easy_base"
  | "easy_strides"
  | "recovery"
  | "steady_aerobic"
  | "medium_long_easy"
  | "medium_long_steady"
  | "long_easy"
  | "long_steady_finish"
  | "long_mp_blocks"
  | "cruise_intervals"
  | "continuous_tempo"
  | "broken_tempo"
  | "mp_steady"
  | "hm_pace_blocks"
  | "vo2_intervals"
  | "fartlek"
  | "hill_strides"
  | "hill_repeats"
  | "race_day";

export type WorkoutLibraryRole =
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
  | "strength"
  | "cross_training";

export type WorkoutLibraryStress = "none" | "easy" | "moderate" | "hard";

export type WorkoutLibraryPhase =
  | "base"
  | "build"
  | "specific"
  | "peak"
  | "taper"
  | "race_prep";

export type WorkoutLibraryContext = {
  subtype: PlanWorkoutSubtype;
  phase: WorkoutLibraryPhase;
  raceDistance: "marathon" | "half_marathon";
  weekNumber: number;
  weeklyVolumeKm: number;
  runDaysPerWeek: number;
  longRunKm: number;
  peakLongRunKm: number;
  targetDistanceKm: number | null;
  maxSessionDurationMin: number | null;
  dayLabel: TrainingDay;
  terrain: TerrainAvailable | null;
  flatRoutesAvailable: boolean;
  trailAccess: boolean;
  raceCourseLooksHilly: boolean;
  effortTargetBias: boolean;
  weatherCaution: boolean;
  fitnessConfidence: "low" | "medium" | "high";
  feasibilityRating:
    | "finish_only"
    | "realistic"
    | "ambitious"
    | "very_ambitious"
    | "low_confidence"
    | "not_credible";
  paces: {
    easySecPerKm: number;
    thresholdSecPerKm: number;
    currentRacePaceSecPerKm: number;
    bridgeRacePaceSecPerKm: number;
    goalRacePaceSecPerKm: number | null;
  };
  advancedTargets: AdvancedWorkoutTargets;
};

export type ResolvedWorkoutPrescription = {
  workoutType: WorkoutType;
  title: string;
  description: string;
  distanceKm: number | null;
  durationMin: number | null;
  targetPaceMinSecPerKm: number | null;
  targetPaceMaxSecPerKm: number | null;
  targetHrZone: string | null;
  purpose: string;
  instructions: string;
  structuredWorkout: StructuredWorkout | null;
  durationWasCapped: boolean;
  variables: WorkoutLibraryVariables;
};

export type WorkoutLibraryVariables = {
  sessionDurationMin: number | null;
  warmupMin: number;
  cooldownMin: number;
  workDurationMin: number;
  recoveryMin: number;
  repeatCount: number;
  thresholdCapKm: number;
  vo2CapKm: number;
  repetitionCapKm: number;
};

type PaceRange = {
  minSecPerKm: number;
  maxSecPerKm: number;
};

type StepDuration = Pick<
  WorkoutStep,
  "durationType" | "durationValue" | "durationUnit"
>;

type StepTarget = Pick<
  WorkoutStep,
  "targetType" | "targetMin" | "targetMax" | "targetUnit"
>;

const simpleRunSubtypes = new Set<PlanWorkoutSubtype>([
  "calibration",
  "easy_base",
  "recovery",
  "steady_aerobic",
  "medium_long_easy",
  "long_easy",
]);

const sustainedSubtypes = new Set<PlanWorkoutSubtype>([
  "continuous_tempo",
  "mp_steady",
  "hm_pace_blocks",
]);

const repeatSubtypes = new Set<PlanWorkoutSubtype>([
  "easy_strides",
  "cruise_intervals",
  "broken_tempo",
  "vo2_intervals",
  "fartlek",
  "hill_strides",
  "hill_repeats",
]);

export function getWorkoutTypeForSubtype(
  subtype: PlanWorkoutSubtype,
): WorkoutType {
  const mapping: Record<PlanWorkoutSubtype, WorkoutType> = {
    rest: "rest",
    strength_optional: "strength_optional",
    cross_training_optional: "cross_training",
    calibration: "calibration",
    easy_base: "easy",
    easy_strides: "easy",
    recovery: "recovery",
    steady_aerobic: "easy",
    medium_long_easy: "easy",
    medium_long_steady: "easy",
    long_easy: "long_run",
    long_steady_finish: "long_run",
    long_mp_blocks: "long_run",
    cruise_intervals: "tempo",
    continuous_tempo: "tempo",
    broken_tempo: "tempo",
    mp_steady: "marathon_pace",
    hm_pace_blocks: "marathon_pace",
    vo2_intervals: "interval",
    fartlek: "easy",
    hill_strides: "easy",
    hill_repeats: "interval",
    race_day: "long_run",
  };

  return mapping[subtype];
}

export function getRoleForSubtype(
  subtype: PlanWorkoutSubtype,
): WorkoutLibraryRole {
  const mapping: Record<PlanWorkoutSubtype, WorkoutLibraryRole> = {
    rest: "rest",
    strength_optional: "strength",
    cross_training_optional: "cross_training",
    calibration: "calibration",
    easy_base: "easy",
    easy_strides: "easy",
    recovery: "recovery",
    steady_aerobic: "steady",
    medium_long_easy: "medium_long",
    medium_long_steady: "medium_long",
    long_easy: "long_easy",
    long_steady_finish: "long_steady",
    long_mp_blocks: "long_race_specific",
    cruise_intervals: "threshold",
    continuous_tempo: "threshold",
    broken_tempo: "threshold",
    mp_steady: "race_pace",
    hm_pace_blocks: "race_pace",
    vo2_intervals: "interval",
    fartlek: "steady",
    hill_strides: "easy",
    hill_repeats: "interval",
    race_day: "race_day",
  };

  return mapping[subtype];
}

export function getStressForSubtype(
  subtype: PlanWorkoutSubtype,
): WorkoutLibraryStress {
  const mapping: Record<PlanWorkoutSubtype, WorkoutLibraryStress> = {
    rest: "none",
    strength_optional: "none",
    cross_training_optional: "none",
    calibration: "moderate",
    easy_base: "easy",
    easy_strides: "easy",
    recovery: "easy",
    steady_aerobic: "moderate",
    medium_long_easy: "easy",
    medium_long_steady: "moderate",
    long_easy: "moderate",
    long_steady_finish: "moderate",
    long_mp_blocks: "hard",
    cruise_intervals: "hard",
    continuous_tempo: "hard",
    broken_tempo: "hard",
    mp_steady: "hard",
    hm_pace_blocks: "hard",
    vo2_intervals: "hard",
    fartlek: "moderate",
    hill_strides: "easy",
    hill_repeats: "hard",
    race_day: "hard",
  };

  return mapping[subtype];
}

export function getTitleForSubtype(subtype: PlanWorkoutSubtype): string {
  const titles: Record<PlanWorkoutSubtype, string> = {
    rest: "Rest day",
    strength_optional: "Optional strength",
    cross_training_optional: "Optional cross-training",
    calibration: "Calibration run",
    easy_base: "Easy run",
    easy_strides: "Easy run with strides",
    recovery: "Recovery run",
    steady_aerobic: "Steady aerobic run",
    medium_long_easy: "Medium-long easy run",
    medium_long_steady: "Medium-long steady run",
    long_easy: "Easy long run",
    long_steady_finish: "Long run with steady finish",
    long_mp_blocks: "Long run with race-pace blocks",
    cruise_intervals: "Cruise interval tempo",
    continuous_tempo: "Continuous tempo",
    broken_tempo: "Broken tempo",
    mp_steady: "Marathon-pace steady run",
    hm_pace_blocks: "Half-marathon pace workout",
    vo2_intervals: "VO2max interval session",
    fartlek: "Controlled fartlek",
    hill_strides: "Easy run with hill strides",
    hill_repeats: "Hill repeat session",
    race_day: "Race day",
  };

  return titles[subtype];
}

export function getWeeklyIntensityCaps(input: {
  weeklyVolumeKm: number;
}): Pick<
  WorkoutLibraryVariables,
  "thresholdCapKm" | "vo2CapKm" | "repetitionCapKm"
> {
  return {
    thresholdCapKm: roundDistance(input.weeklyVolumeKm * 0.1),
    vo2CapKm: roundDistance(input.weeklyVolumeKm * 0.08),
    repetitionCapKm: roundDistance(input.weeklyVolumeKm * 0.05),
  };
}

export function resolveWorkoutPrescription(
  input: WorkoutLibraryContext,
): ResolvedWorkoutPrescription {
  const workoutType = getWorkoutTypeForSubtype(input.subtype);

  if (workoutType === "rest") {
    return buildNonRunPrescription(input, workoutType, null);
  }

  if (workoutType === "cross_training") {
    return buildNonRunPrescription(input, workoutType, 35);
  }

  if (workoutType === "strength_optional") {
    return buildNonRunPrescription(input, workoutType, 25);
  }

  const paceRange = getPaceRange(input);
  const targetDistanceKm = getTargetDistanceKm(input);
  const uncappedDurationMin = getDurationFromDistance(targetDistanceKm, paceRange.maxSecPerKm);
  const durationResult = capDurationAndDistance({
    distanceKm: targetDistanceKm,
    durationMin: uncappedDurationMin,
    paceSecPerKm: paceRange.maxSecPerKm,
    maxSessionDurationMin: input.maxSessionDurationMin,
  });
  const variables = buildWorkoutVariables({
    input,
    durationMin: durationResult.durationMin,
    distanceKm: durationResult.distanceKm,
    paceRange,
  });
  const description = getDescription(input);
  const purpose = getPurpose(input);
  const instructions = getInstructions(input, variables);
  const targetHrZone = getTargetHeartRateZone(input);
  const structuredWorkout = buildLibraryStructuredWorkout({
    input,
    workoutType,
    paceRange,
    distanceKm: durationResult.distanceKm,
    durationMin: durationResult.durationMin,
    targetHrZone,
    description,
    purpose,
    instructions,
    variables,
  });

  return {
    workoutType,
    title:
      input.subtype === "race_day"
        ? `${formatRaceDistance(input.raceDistance)} race day`
        : getTitleForSubtype(input.subtype),
    description,
    distanceKm: durationResult.distanceKm,
    durationMin: durationResult.durationMin,
    targetPaceMinSecPerKm: paceRange.minSecPerKm,
    targetPaceMaxSecPerKm: paceRange.maxSecPerKm,
    targetHrZone,
    purpose,
    instructions,
    structuredWorkout,
    durationWasCapped: durationResult.durationWasCapped,
    variables,
  };
}

function buildNonRunPrescription(
  input: WorkoutLibraryContext,
  workoutType: WorkoutType,
  durationMin: number | null,
): ResolvedWorkoutPrescription {
  const nonRunText = getNonRunText(input);

  return {
    workoutType,
    title: getTitleForSubtype(input.subtype),
    description: nonRunText.description,
    distanceKm: null,
    durationMin,
    targetPaceMinSecPerKm: null,
    targetPaceMaxSecPerKm: null,
    targetHrZone: null,
    purpose: `${nonRunText.purpose} Phase: ${formatPhaseLabel(input.phase)}.`,
    instructions: nonRunText.instructions,
    structuredWorkout: null,
    durationWasCapped: false,
    variables: {
      sessionDurationMin: durationMin,
      warmupMin: 0,
      cooldownMin: 0,
      workDurationMin: 0,
      recoveryMin: 0,
      repeatCount: 0,
      ...getWeeklyIntensityCaps({ weeklyVolumeKm: input.weeklyVolumeKm }),
    },
  };
}

function getNonRunText(input: WorkoutLibraryContext): {
  description: string;
  purpose: string;
  instructions: string;
} {
  if (input.subtype === "strength_optional") {
    return {
      description: "Optional light strength work that should not affect the next run.",
      purpose: "Support basic running durability.",
      instructions:
        "Keep this light: squats, lunges, calf raises, glute bridges, and planks. Stop before fatigue affects running.",
    };
  }

  if (input.subtype === "cross_training_optional") {
    return {
      description: "Optional low-impact aerobic cross-training on a non-running day.",
      purpose: "Support aerobic fitness without adding run impact.",
      instructions:
        "Keep this easy and low impact, such as cycling, elliptical, swimming, or brisk walking. Stop if it affects the next run.",
    };
  }

  return {
    description: "No running planned so the body can absorb training.",
    purpose: "Protect recovery and lower injury risk.",
    instructions: "Take the day off running. Gentle walking or mobility is fine if it feels good.",
  };
}

function getTargetDistanceKm(input: WorkoutLibraryContext): number {
  if (input.subtype === "race_day") {
    return input.raceDistance === "marathon" ? 42.2 : 21.1;
  }

  if (input.targetDistanceKm !== null && input.targetDistanceKm > 0) {
    return input.targetDistanceKm;
  }

  const averageRunKm = input.weeklyVolumeKm / Math.max(1, input.runDaysPerWeek);
  const subtypeMultiplier: Partial<Record<PlanWorkoutSubtype, number>> = {
    calibration: 0.65,
    recovery: 0.55,
    easy_base: 0.9,
    easy_strides: 0.9,
    hill_strides: 0.9,
    steady_aerobic: 1,
    fartlek: 0.95,
    cruise_intervals: 1,
    continuous_tempo: 1.05,
    broken_tempo: 1.05,
    vo2_intervals: 0.95,
    hill_repeats: 0.95,
    mp_steady: 1.1,
    hm_pace_blocks: 1.05,
    medium_long_easy: 1.45,
    medium_long_steady: 1.45,
    long_easy: 1,
    long_steady_finish: 1,
    long_mp_blocks: 1,
  };

  if (
    input.subtype === "long_easy" ||
    input.subtype === "long_steady_finish" ||
    input.subtype === "long_mp_blocks"
  ) {
    return input.longRunKm;
  }

  return roundDistance(
    clamp(averageRunKm * (subtypeMultiplier[input.subtype] ?? 1), 3, input.longRunKm * 0.75),
  );
}

function getPaceRange(input: WorkoutLibraryContext): PaceRange {
  const raceSpecificPace = getRaceSpecificPace(input);
  const paces = input.paces;
  const ranges: Partial<Record<PlanWorkoutSubtype, PaceRange>> = {
    calibration: {
      minSecPerKm: paces.easySecPerKm + 5,
      maxSecPerKm: paces.easySecPerKm + 45,
    },
    recovery: {
      minSecPerKm: paces.easySecPerKm + 40,
      maxSecPerKm: paces.easySecPerKm + 90,
    },
    easy_base: {
      minSecPerKm: paces.easySecPerKm,
      maxSecPerKm: paces.easySecPerKm + 45,
    },
    easy_strides: {
      minSecPerKm: paces.easySecPerKm,
      maxSecPerKm: paces.easySecPerKm + 45,
    },
    hill_strides: {
      minSecPerKm: paces.easySecPerKm,
      maxSecPerKm: paces.easySecPerKm + 50,
    },
    steady_aerobic: {
      minSecPerKm: paces.easySecPerKm + 5,
      maxSecPerKm: paces.easySecPerKm + 35,
    },
    medium_long_easy: {
      minSecPerKm: paces.easySecPerKm + 10,
      maxSecPerKm: paces.easySecPerKm + 55,
    },
    medium_long_steady: {
      minSecPerKm: paces.easySecPerKm + 5,
      maxSecPerKm: paces.easySecPerKm + 40,
    },
    long_easy: {
      minSecPerKm: paces.easySecPerKm + 15,
      maxSecPerKm: paces.easySecPerKm + 65,
    },
    long_steady_finish: {
      minSecPerKm: paces.easySecPerKm + 10,
      maxSecPerKm: paces.easySecPerKm + 55,
    },
    long_mp_blocks: {
      minSecPerKm: Math.max(180, raceSpecificPace - 8),
      maxSecPerKm: raceSpecificPace + 15,
    },
    cruise_intervals: {
      minSecPerKm: paces.thresholdSecPerKm + 2,
      maxSecPerKm: paces.thresholdSecPerKm + 22,
    },
    continuous_tempo: {
      minSecPerKm: paces.thresholdSecPerKm + 5,
      maxSecPerKm: paces.thresholdSecPerKm + 25,
    },
    broken_tempo: {
      minSecPerKm: paces.thresholdSecPerKm,
      maxSecPerKm: paces.thresholdSecPerKm + 22,
    },
    mp_steady: {
      minSecPerKm: Math.max(180, raceSpecificPace - 10),
      maxSecPerKm: raceSpecificPace + 12,
    },
    hm_pace_blocks: {
      minSecPerKm: Math.max(180, raceSpecificPace - 8),
      maxSecPerKm: raceSpecificPace + 12,
    },
    vo2_intervals: {
      minSecPerKm: Math.max(180, paces.thresholdSecPerKm - 25),
      maxSecPerKm: Math.max(180, paces.thresholdSecPerKm - 5),
    },
    fartlek: {
      minSecPerKm: Math.max(180, paces.thresholdSecPerKm - 15),
      maxSecPerKm: paces.easySecPerKm + 35,
    },
    hill_repeats: {
      minSecPerKm: Math.max(180, paces.thresholdSecPerKm - 10),
      maxSecPerKm: paces.thresholdSecPerKm + 30,
    },
    race_day: {
      minSecPerKm: Math.max(180, raceSpecificPace - 8),
      maxSecPerKm: raceSpecificPace + 12,
    },
  };

  return ranges[input.subtype] ?? {
    minSecPerKm: paces.easySecPerKm,
    maxSecPerKm: paces.easySecPerKm + 45,
  };
}

function getRaceSpecificPace(input: WorkoutLibraryContext): number {
  if (input.paces.goalRacePaceSecPerKm === null) {
    return input.paces.currentRacePaceSecPerKm;
  }

  if (
    input.feasibilityRating === "not_credible" ||
    input.feasibilityRating === "low_confidence"
  ) {
    return input.paces.bridgeRacePaceSecPerKm;
  }

  if (input.phase === "specific" || input.phase === "peak" || input.phase === "taper") {
    return input.paces.goalRacePaceSecPerKm;
  }

  return input.paces.bridgeRacePaceSecPerKm;
}

function getDurationFromDistance(
  distanceKm: number,
  paceSecPerKm: number,
): number {
  return Math.max(10, Math.round((distanceKm * paceSecPerKm) / 60));
}

function capDurationAndDistance(input: {
  distanceKm: number;
  durationMin: number;
  paceSecPerKm: number;
  maxSessionDurationMin: number | null;
}): {
  distanceKm: number;
  durationMin: number;
  durationWasCapped: boolean;
} {
  if (
    input.maxSessionDurationMin === null ||
    input.durationMin <= input.maxSessionDurationMin
  ) {
    return {
      distanceKm: input.distanceKm,
      durationMin: input.durationMin,
      durationWasCapped: false,
    };
  }

  return {
    distanceKm: roundDistance(
      Math.max(1.5, (input.maxSessionDurationMin * 60) / input.paceSecPerKm),
    ),
    durationMin: input.maxSessionDurationMin,
    durationWasCapped: true,
  };
}

function buildWorkoutVariables(input: {
  input: WorkoutLibraryContext;
  durationMin: number;
  distanceKm: number;
  paceRange: PaceRange;
}): WorkoutLibraryVariables {
  const caps = getWeeklyIntensityCaps({
    weeklyVolumeKm: input.input.weeklyVolumeKm,
  });
  const warmupMin = getWarmupMin(input.input.subtype, input.durationMin);
  const cooldownMin = getCooldownMin(input.input.subtype, input.durationMin);
  const availableWorkMin = Math.max(5, input.durationMin - warmupMin - cooldownMin);
  const workKmCap = getWorkKmCap(input.input.subtype, caps);
  const workDurationFromCapMin = Math.round(
    (workKmCap * input.paceRange.maxSecPerKm) / 60,
  );
  const targetWorkMin = getTargetWorkMin({
    subtype: input.input.subtype,
    phase: input.input.phase,
    sessionDurationMin: input.durationMin,
    availableWorkMin,
    workDurationFromCapMin,
    longRunKm: input.input.longRunKm,
    distanceKm: input.distanceKm,
  });
  const repeatCount = getRepeatCount({
    subtype: input.input.subtype,
    workDurationMin: targetWorkMin,
    phase: input.input.phase,
  });
  const recoveryMin = getRecoveryMin(input.input.subtype, targetWorkMin, repeatCount);

  return {
    sessionDurationMin: input.durationMin,
    warmupMin,
    cooldownMin,
    workDurationMin: targetWorkMin,
    recoveryMin,
    repeatCount,
    ...caps,
  };
}

function getWarmupMin(
  subtype: PlanWorkoutSubtype,
  durationMin: number,
): number {
  if (subtype === "calibration") {
    return clamp(Math.round(durationMin * 0.22), 8, 15);
  }

  if (
    sustainedSubtypes.has(subtype) ||
    repeatSubtypes.has(subtype) ||
    subtype === "long_mp_blocks"
  ) {
    return clamp(Math.round(durationMin * 0.16), 10, 22);
  }

  return 0;
}

function getCooldownMin(
  subtype: PlanWorkoutSubtype,
  durationMin: number,
): number {
  if (subtype === "calibration") {
    return clamp(Math.round(durationMin * 0.18), 6, 12);
  }

  if (
    sustainedSubtypes.has(subtype) ||
    repeatSubtypes.has(subtype) ||
    subtype === "long_mp_blocks"
  ) {
    return clamp(Math.round(durationMin * 0.14), 8, 18);
  }

  return 0;
}

function getWorkKmCap(
  subtype: PlanWorkoutSubtype,
  caps: Pick<
    WorkoutLibraryVariables,
    "thresholdCapKm" | "vo2CapKm" | "repetitionCapKm"
  >,
): number {
  if (subtype === "vo2_intervals") {
    return caps.vo2CapKm;
  }

  if (
    subtype === "easy_strides" ||
    subtype === "hill_strides" ||
    subtype === "fartlek"
  ) {
    return caps.repetitionCapKm;
  }

  if (
    subtype === "cruise_intervals" ||
    subtype === "continuous_tempo" ||
    subtype === "broken_tempo"
  ) {
    return caps.thresholdCapKm;
  }

  return Math.max(caps.thresholdCapKm, caps.vo2CapKm);
}

function getTargetWorkMin(input: {
  subtype: PlanWorkoutSubtype;
  phase: WorkoutLibraryPhase;
  sessionDurationMin: number;
  availableWorkMin: number;
  workDurationFromCapMin: number;
  longRunKm: number;
  distanceKm: number;
}): number {
  const phaseMultiplier =
    input.phase === "specific" || input.phase === "peak"
      ? 1
      : input.phase === "build"
        ? 0.85
        : 0.7;
  const bySubtype: Partial<Record<PlanWorkoutSubtype, number>> = {
    calibration: input.availableWorkMin,
    steady_aerobic: Math.round(input.sessionDurationMin * 0.45),
    medium_long_steady: Math.round(input.sessionDurationMin * 0.32),
    long_steady_finish: Math.round(input.sessionDurationMin * 0.22),
    long_mp_blocks: Math.round(input.sessionDurationMin * 0.24 * phaseMultiplier),
    cruise_intervals: Math.round(input.workDurationFromCapMin * 0.6 * phaseMultiplier),
    continuous_tempo: Math.round(input.workDurationFromCapMin * 0.75 * phaseMultiplier),
    broken_tempo: Math.round(input.workDurationFromCapMin * 0.75 * phaseMultiplier),
    mp_steady: Math.round(input.sessionDurationMin * 0.28 * phaseMultiplier),
    hm_pace_blocks: Math.round(input.sessionDurationMin * 0.32 * phaseMultiplier),
    vo2_intervals: Math.round(input.workDurationFromCapMin * 0.65 * phaseMultiplier),
    fartlek: Math.round(input.sessionDurationMin * 0.22 * phaseMultiplier),
    easy_strides: Math.round(input.sessionDurationMin * 0.08),
    hill_strides: Math.round(input.sessionDurationMin * 0.08),
    hill_repeats: Math.round(input.workDurationFromCapMin * 0.45 * phaseMultiplier),
  };

  return clamp(
    bySubtype[input.subtype] ?? input.availableWorkMin,
    input.subtype === "easy_strides" || input.subtype === "hill_strides" ? 2 : 6,
    input.availableWorkMin,
  );
}

function getRepeatCount(input: {
  subtype: PlanWorkoutSubtype;
  workDurationMin: number;
  phase: WorkoutLibraryPhase;
}): number {
  if (input.subtype === "easy_strides" || input.subtype === "hill_strides") {
    return clamp(Math.round(input.workDurationMin / 0.35), 4, 8);
  }

  if (input.subtype === "cruise_intervals") {
    return clamp(Math.round(input.workDurationMin / 6), 3, 6);
  }

  if (input.subtype === "broken_tempo") {
    return clamp(Math.round(input.workDurationMin / 10), 2, 4);
  }

  if (input.subtype === "vo2_intervals") {
    return clamp(Math.round(input.workDurationMin / 3), 3, 6);
  }

  if (input.subtype === "fartlek") {
    return clamp(Math.round(input.workDurationMin / 2), 5, 10);
  }

  if (input.subtype === "hill_repeats") {
    return clamp(Math.round(input.workDurationMin / 1.25), 4, 8);
  }

  if (input.subtype === "long_mp_blocks") {
    return input.phase === "peak" ? 3 : 2;
  }

  if (input.subtype === "hm_pace_blocks") {
    return clamp(Math.round(input.workDurationMin / 8), 3, 5);
  }

  return 1;
}

function getRecoveryMin(
  subtype: PlanWorkoutSubtype,
  workDurationMin: number,
  repeatCount: number,
): number {
  if (repeatCount <= 1) {
    return 0;
  }

  const averageRepMin = workDurationMin / repeatCount;

  if (subtype === "easy_strides" || subtype === "hill_strides") {
    return clamp(Math.round(averageRepMin * 3), 1, 2);
  }

  if (subtype === "vo2_intervals") {
    return clamp(Math.round(averageRepMin * 0.9), 2, 5);
  }

  if (subtype === "fartlek") {
    return clamp(Math.round(averageRepMin * 1.4), 1, 4);
  }

  if (subtype === "hill_repeats") {
    return clamp(Math.round(averageRepMin * 1.5), 1, 3);
  }

  if (subtype === "long_mp_blocks") {
    return clamp(Math.round(averageRepMin * 0.3), 3, 8);
  }

  return clamp(Math.round(averageRepMin * 0.25), 1, 5);
}

function buildLibraryStructuredWorkout(input: {
  input: WorkoutLibraryContext;
  workoutType: WorkoutType;
  paceRange: PaceRange;
  distanceKm: number;
  durationMin: number;
  targetHrZone: string | null;
  description: string;
  purpose: string;
  instructions: string;
  variables: WorkoutLibraryVariables;
}): StructuredWorkout {
  const steps = buildStructuredSteps(input);

  return {
    version: 1,
    sport: "Run",
    name:
      input.input.subtype === "race_day"
        ? `${formatRaceDistance(input.input.raceDistance)} race day`
        : getTitleForSubtype(input.input.subtype),
    description: `${input.description} ${input.purpose} ${input.instructions}`,
    exportSafe: true,
    exportWarnings: [],
    steps,
  };
}

function buildStructuredSteps(input: {
  input: WorkoutLibraryContext;
  paceRange: PaceRange;
  distanceKm: number;
  durationMin: number;
  variables: WorkoutLibraryVariables;
}): WorkoutStep[] {
  const subtype = input.input.subtype;

  if (simpleRunSubtypes.has(subtype)) {
    return buildSimpleRunSteps(input);
  }

  if (subtype === "medium_long_steady" || subtype === "long_steady_finish") {
    return buildSteadyFinishSteps(input);
  }

  if (subtype === "long_mp_blocks") {
    return buildRepeatWorkoutSteps(input, "Race-pace block", "Easy float");
  }

  if (sustainedSubtypes.has(subtype)) {
    return buildSustainedWorkoutSteps(input);
  }

  if (repeatSubtypes.has(subtype)) {
    return buildRepeatWorkoutSteps(
      input,
      getRepeatWorkStepName(subtype),
      getRepeatRecoveryStepName(subtype),
    );
  }

  return buildSimpleRunSteps(input);
}

function buildSimpleRunSteps(input: {
  input: WorkoutLibraryContext;
  paceRange: PaceRange;
  distanceKm: number;
  durationMin: number;
  variables: WorkoutLibraryVariables;
}): WorkoutStep[] {
  if (input.input.subtype === "calibration") {
    const workMin = Math.max(
      8,
      input.durationMin - input.variables.warmupMin - input.variables.cooldownMin,
    );

    return [
      buildStep({
        id: "calibration-warmup",
        type: "warmup",
        name: "Warm up",
        duration: timeDuration(input.variables.warmupMin),
        target: paceTarget(input.paceRange),
      }),
      buildStep({
        id: "calibration-work",
        type: "work",
        name: "Steady calibration effort",
        duration: timeDuration(workMin),
        target: paceTarget(input.paceRange),
      }),
      buildStep({
        id: "calibration-cooldown",
        type: "cooldown",
        name: "Cool down",
        duration: timeDuration(input.variables.cooldownMin),
        target: paceTarget(input.paceRange),
      }),
    ];
  }

  return [
    buildStep({
      id: `${input.input.subtype}-main`,
      type: "work",
      name: getTitleForSubtype(input.input.subtype),
      duration: distanceDuration(input.distanceKm),
      target: paceTarget(input.paceRange),
    }),
  ];
}

function buildSteadyFinishSteps(input: {
  input: WorkoutLibraryContext;
  paceRange: PaceRange;
  distanceKm: number;
  durationMin: number;
  variables: WorkoutLibraryVariables;
}): WorkoutStep[] {
  const steadyMin = clamp(
    input.variables.workDurationMin,
    Math.round(input.durationMin * 0.15),
    Math.round(input.durationMin * 0.3),
  );
  const easyMin = Math.max(10, input.durationMin - steadyMin);

  return [
    buildStep({
      id: `${input.input.subtype}-easy`,
      type: "work",
      name: "Easy aerobic running",
      duration: timeDuration(easyMin),
      target: paceTarget({
        minSecPerKm: input.input.paces.easySecPerKm + 10,
        maxSecPerKm: input.input.paces.easySecPerKm + 60,
      }),
    }),
    buildStep({
      id: `${input.input.subtype}-steady`,
      type: "work",
      name: "Steady finish",
      duration: timeDuration(steadyMin),
      target: paceTarget(input.paceRange),
    }),
  ];
}

function buildSustainedWorkoutSteps(input: {
  input: WorkoutLibraryContext;
  paceRange: PaceRange;
  distanceKm: number;
  durationMin: number;
  variables: WorkoutLibraryVariables;
}): WorkoutStep[] {
  return [
    buildStep({
      id: `${input.input.subtype}-warmup`,
      type: "warmup",
      name: "Warm up",
      duration: timeDuration(input.variables.warmupMin),
      target: paceTarget({
        minSecPerKm: input.input.paces.easySecPerKm,
        maxSecPerKm: input.input.paces.easySecPerKm + 60,
      }),
    }),
    buildStep({
      id: `${input.input.subtype}-work`,
      type: "work",
      name: getSustainedWorkStepName(input.input.subtype),
      duration: timeDuration(input.variables.workDurationMin),
      target: paceTarget(input.paceRange),
    }),
    buildStep({
      id: `${input.input.subtype}-cooldown`,
      type: "cooldown",
      name: "Cool down",
      duration: timeDuration(input.variables.cooldownMin),
      target: paceTarget({
        minSecPerKm: input.input.paces.easySecPerKm + 15,
        maxSecPerKm: input.input.paces.easySecPerKm + 75,
      }),
    }),
  ];
}

function buildRepeatWorkoutSteps(
  input: {
    input: WorkoutLibraryContext;
    paceRange: PaceRange;
    distanceKm: number;
    durationMin: number;
    variables: WorkoutLibraryVariables;
  },
  workStepName: string,
  recoveryStepName: string,
): WorkoutStep[] {
  const repeatCount = Math.max(1, input.variables.repeatCount);
  const workMin = Math.max(1, Math.round(input.variables.workDurationMin / repeatCount));
  const recoveryMin = Math.max(1, input.variables.recoveryMin);

  return [
    buildStep({
      id: `${input.input.subtype}-warmup`,
      type: "warmup",
      name: "Warm up",
      duration: timeDuration(input.variables.warmupMin),
      target: paceTarget({
        minSecPerKm: input.input.paces.easySecPerKm,
        maxSecPerKm: input.input.paces.easySecPerKm + 60,
      }),
    }),
    buildStep({
      id: `${input.input.subtype}-repeat`,
      type: "work",
      name: `${repeatCount} x ${workStepName}`,
      duration: { durationType: "open" },
      target: { targetType: "none" },
      repeat: {
        count: repeatCount,
        steps: [
          buildStep({
            id: `${input.input.subtype}-work`,
            type: "work",
            name: workStepName,
            duration:
              input.input.subtype === "easy_strides" ||
              input.input.subtype === "hill_strides"
                ? timeDuration(0.33)
                : timeDuration(workMin),
            target: paceTarget(input.paceRange),
          }),
          buildStep({
            id: `${input.input.subtype}-recovery`,
            type: "recovery",
            name: recoveryStepName,
            duration: timeDuration(recoveryMin),
            target: paceTarget({
              minSecPerKm: input.input.paces.easySecPerKm + 30,
              maxSecPerKm: input.input.paces.easySecPerKm + 90,
            }),
          }),
        ],
      },
    }),
    buildStep({
      id: `${input.input.subtype}-cooldown`,
      type: "cooldown",
      name: "Cool down",
      duration: timeDuration(input.variables.cooldownMin),
      target: paceTarget({
        minSecPerKm: input.input.paces.easySecPerKm + 15,
        maxSecPerKm: input.input.paces.easySecPerKm + 75,
      }),
    }),
  ];
}

function getSustainedWorkStepName(subtype: PlanWorkoutSubtype): string {
  const names: Partial<Record<PlanWorkoutSubtype, string>> = {
    continuous_tempo: "Continuous threshold tempo",
    mp_steady: "Race-pace steady segment",
    hm_pace_blocks: "Half-marathon pace segment",
  };

  return names[subtype] ?? "Focused work";
}

function getRepeatWorkStepName(subtype: PlanWorkoutSubtype): string {
  const names: Partial<Record<PlanWorkoutSubtype, string>> = {
    easy_strides: "Relaxed stride",
    cruise_intervals: "Cruise interval",
    broken_tempo: "Tempo block",
    vo2_intervals: "Fast interval",
    fartlek: "Controlled pickup",
    hill_strides: "Uphill stride",
    hill_repeats: "Uphill repeat",
  };

  return names[subtype] ?? "Work rep";
}

function getRepeatRecoveryStepName(subtype: PlanWorkoutSubtype): string {
  const names: Partial<Record<PlanWorkoutSubtype, string>> = {
    easy_strides: "Full easy recovery",
    cruise_intervals: "Easy jog recovery",
    broken_tempo: "Short easy recovery",
    vo2_intervals: "Recovery jog",
    fartlek: "Easy running",
    hill_strides: "Walk or jog back",
    hill_repeats: "Jog or walk downhill",
  };

  return names[subtype] ?? "Recovery";
}

function getDescription(input: WorkoutLibraryContext): string {
  const phaseLabel = formatPhaseLabel(input.phase);
  const descriptions: Record<PlanWorkoutSubtype, string> = {
    rest: "No running planned so the body can absorb training.",
    strength_optional: "Optional light strength work that should not affect the next run.",
    cross_training_optional: "Optional low-impact aerobic work that supports running without adding run impact.",
    calibration: "A controlled first run used to verify that early targets feel realistic.",
    easy_base: `Comfortable aerobic running for the ${phaseLabel} phase.`,
    easy_strides: `Comfortable aerobic running with short relaxed strides for the ${phaseLabel} phase.`,
    recovery: "A short, very easy run to absorb nearby training stress.",
    steady_aerobic: "A controlled upper-aerobic run below threshold effort.",
    medium_long_easy: "A longer aerobic support run that builds durability without becoming the key long run.",
    medium_long_steady: "A longer aerobic support run with a controlled steady section.",
    long_easy: "The key endurance run of the week, kept mostly easy.",
    long_steady_finish: "The key endurance run of the week with a controlled steady finish.",
    long_mp_blocks: "A specific long run that introduces controlled race-pace blocks.",
    cruise_intervals: "A threshold session built from repeatable cruise intervals.",
    continuous_tempo: "A sustained controlled tempo run below all-out effort.",
    broken_tempo: "A stamina tempo split into longer controlled blocks.",
    mp_steady: "Race-specific rhythm work using current, bridge, or goal pace as appropriate.",
    hm_pace_blocks: "Half-marathon specific rhythm work with recoveries.",
    vo2_intervals: "A controlled VO2max or economy interval session with capped fast volume.",
    fartlek: "A flexible controlled workout for low-confidence, hilly, or early-build situations.",
    hill_strides: "An easy run with short uphill strides for economy and hill exposure.",
    hill_repeats: "A controlled uphill repeat session with conservative volume.",
    race_day: `Race day for the ${formatRaceDistance(input.raceDistance)} goal.`,
  };

  return descriptions[input.subtype];
}

function getPurpose(input: WorkoutLibraryContext): string {
  const purposes: Record<PlanWorkoutSubtype, string> = {
    rest: "Protect recovery and lower injury risk.",
    strength_optional: "Support basic running durability.",
    cross_training_optional: "Support aerobic fitness without adding another run.",
    calibration: "Check current fitness and calibrate early plan feel.",
    easy_base: "Build aerobic volume while preserving recovery.",
    easy_strides: "Build aerobic volume and maintain relaxed running economy.",
    recovery: "Reduce fatigue and keep the running habit light.",
    steady_aerobic: "Build aerobic strength without turning the week into a hard block.",
    medium_long_easy: "Support durability with more aerobic volume.",
    medium_long_steady: "Support durability and controlled aerobic strength.",
    long_easy: "Develop endurance and durability.",
    long_steady_finish: "Develop durability and late-run control.",
    long_mp_blocks: "Practice race-specific rhythm after base durability has been established.",
    cruise_intervals: "Improve sustainable hard effort while respecting threshold caps.",
    continuous_tempo: "Build sustained threshold stamina within weekly intensity limits.",
    broken_tempo: "Build stamina with recoverable tempo blocks.",
    mp_steady: "Introduce goal or bridge race pace only when phase and feasibility support it.",
    hm_pace_blocks: "Build half-marathon specific rhythm and threshold-adjacent control.",
    vo2_intervals: "Maintain speed and economy without letting VO2max dominate the plan.",
    fartlek: "Bridge easy running and workouts with flexible controlled pickups.",
    hill_strides: "Add low-cost hill exposure and running economy.",
    hill_repeats: "Build hill-specific strength without excessive downhill or speed load.",
    race_day: "Execute the goal race.",
  };

  return `${purposes[input.subtype]} Phase: ${formatPhaseLabel(input.phase)}.`;
}

function getInstructions(
  input: WorkoutLibraryContext,
  variables: WorkoutLibraryVariables,
): string {
  const terrainNote = input.terrain
    ? ` Suggested terrain: ${formatTerrainLabel(input.terrain)}.`
    : "";
  const effortNote =
    !input.flatRoutesAvailable || input.trailAccess || input.effortTargetBias
      ? " Use effort and breathing as the primary guide if terrain makes exact pace unrealistic."
      : "";
  const weatherNote = input.weatherCaution
    ? " Adjust effort for expected weather rather than forcing the faster end of the pace range."
    : "";
  const bridgeNote =
    input.feasibilityRating === "low_confidence" ||
    input.feasibilityRating === "not_credible"
      ? " Goal pace is not the default target yet; use the planned target range, not dream pace."
      : "";
  const fuelingNote =
    variables.sessionDurationMin !== null && variables.sessionDurationMin >= 105
      ? " Practice fueling because this run is long enough to require it."
      : "";
  const advancedTargetNote = getAdvancedTargetInstruction(input);
  const variableNote = getVariableInstruction(input.subtype, variables);

  return `${variableNote}${bridgeNote}${effortNote}${weatherNote}${advancedTargetNote}${fuelingNote}${terrainNote}`;
}

function getAdvancedTargetInstruction(input: WorkoutLibraryContext): string {
  const targetKind = getAdvancedTargetKind(input);
  const heartRateTarget = input.advancedTargets.heartRate[targetKind];
  const powerTarget = input.advancedTargets.power[targetKind];

  if (!heartRateTarget && !powerTarget) {
    return "";
  }

  const targetParts = [
    heartRateTarget ? `HR ${heartRateTarget}` : null,
    powerTarget ? `power ${powerTarget}` : null,
  ].filter(Boolean);
  const biasText =
    input.effortTargetBias || input.weatherCaution
      ? " Use these before exact pace if conditions make pace unreliable."
      : "";

  return ` Optional physiology target: ${targetParts.join("; ")}.${biasText}`;
}

function getVariableInstruction(
  subtype: PlanWorkoutSubtype,
  variables: WorkoutLibraryVariables,
): string {
  if (subtype === "rest") {
    return "Take the day off running. Gentle walking or mobility is fine if it feels good.";
  }

  if (subtype === "strength_optional") {
    return "Keep this light and stop before fatigue affects running.";
  }

  if (subtype === "cross_training_optional") {
    return "Keep this easy and low impact. This is optional support, not extra intensity.";
  }

  if (repeatSubtypes.has(subtype) || subtype === "long_mp_blocks") {
    return `Warm up for ${variables.warmupMin} minutes, run ${variables.repeatCount} controlled repeat${variables.repeatCount === 1 ? "" : "s"} with ${variables.recoveryMin}-minute easy recoveries, then cool down for ${variables.cooldownMin} minutes.`;
  }

  if (sustainedSubtypes.has(subtype)) {
    return `Warm up for ${variables.warmupMin} minutes, run the focused block for about ${variables.workDurationMin} minutes, then cool down for ${variables.cooldownMin} minutes.`;
  }

  if (subtype === "long_steady_finish" || subtype === "medium_long_steady") {
    return `Keep most of this easy, then finish the final ${variables.workDurationMin} minutes steady if effort and form are stable.`;
  }

  if (subtype === "calibration") {
    return `Warm up for ${variables.warmupMin} minutes, run the middle section steady and controlled, then cool down for ${variables.cooldownMin} minutes. Record effort and any discomfort.`;
  }

  if (subtype === "recovery") {
    return "Keep this deliberately easy enough to finish fresher than you started.";
  }

  return "Keep the effort controlled and do not race the workout.";
}

function getTargetHeartRateZone(input: WorkoutLibraryContext): string | null {
  const advancedTarget =
    input.advancedTargets.heartRate[getAdvancedTargetKind(input)];

  if (advancedTarget) {
    return advancedTarget;
  }

  const subtype = input.subtype;
  const zones: Record<PlanWorkoutSubtype, string | null> = {
    rest: null,
    strength_optional: null,
    cross_training_optional: "Zone 1 to Zone 2",
    calibration: "Zone 2 to low Zone 3",
    easy_base: "Zone 2",
    easy_strides: "Zone 2 with relaxed fast strides",
    recovery: "Zone 1 to Zone 2",
    steady_aerobic: "Upper Zone 2 to Zone 3",
    medium_long_easy: "Zone 2",
    medium_long_steady: "Zone 2 to Zone 3",
    long_easy: "Zone 2",
    long_steady_finish: "Zone 2 to Zone 3",
    long_mp_blocks: "Zone 2 to Zone 3",
    cruise_intervals: "Zone 3 to Zone 4",
    continuous_tempo: "Zone 3 to Zone 4",
    broken_tempo: "Zone 3 to Zone 4",
    mp_steady: "Zone 3",
    hm_pace_blocks: "Zone 3 to Zone 4",
    vo2_intervals: "Zone 4",
    fartlek: "Zone 2 to Zone 4",
    hill_strides: "Zone 2 with short fast efforts",
    hill_repeats: "Zone 3 to Zone 4",
    race_day: "Race effort",
  };

  return zones[subtype];
}

function getAdvancedTargetKind(input: WorkoutLibraryContext): WorkoutTargetKind {
  const role = getRoleForSubtype(input.subtype);

  if (role === "recovery") {
    return "recovery";
  }

  if (
    role === "threshold" ||
    role === "long_steady" ||
    role === "steady"
  ) {
    return role === "threshold" ? "threshold" : "steady";
  }

  if (role === "interval") {
    return "interval";
  }

  if (
    role === "race_pace" ||
    role === "long_race_specific" ||
    role === "race_day"
  ) {
    return "race_pace";
  }

  if (role === "medium_long") {
    return input.phase === "specific" || input.phase === "peak"
      ? "steady"
      : "easy";
  }

  return "easy";
}

function buildStep(input: {
  id: string;
  type: WorkoutStep["type"];
  name: string;
  duration: StepDuration;
  target: StepTarget;
  notes?: string;
  repeat?: WorkoutStep["repeat"];
}): WorkoutStep {
  const step: WorkoutStep = {
    id: input.id,
    type: input.type,
    name: input.name,
    ...input.duration,
    ...input.target,
  };

  if (input.notes) {
    step.notes = input.notes;
  }

  if (input.repeat) {
    step.repeat = input.repeat;
  }

  return step;
}

function paceTarget(paceRange: PaceRange): StepTarget {
  return {
    targetType: "pace",
    targetMin: Math.min(paceRange.minSecPerKm, paceRange.maxSecPerKm),
    targetMax: Math.max(paceRange.minSecPerKm, paceRange.maxSecPerKm),
    targetUnit: "sec_per_km",
  };
}

function distanceDuration(distanceKm: number): StepDuration {
  return {
    durationType: "distance",
    durationValue: Math.max(100, Math.round(distanceKm * 1000)),
    durationUnit: "meters",
  };
}

function timeDuration(minutes: number): StepDuration {
  return {
    durationType: "time",
    durationValue: Math.max(20, Math.round(minutes * 60)),
    durationUnit: "seconds",
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 10) / 10;
}

function formatRaceDistance(raceDistance: "marathon" | "half_marathon"): string {
  return raceDistance === "marathon" ? "marathon" : "half marathon";
}

function formatPhaseLabel(phase: WorkoutLibraryPhase): string {
  const labels: Record<WorkoutLibraryPhase, string> = {
    base: "base",
    build: "build",
    specific: "specific",
    peak: "peak",
    taper: "taper",
    race_prep: "race prep",
  };

  return labels[phase];
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
