import { getEffectiveRunningDaysPerWeek } from "./runningDays.ts";
import {
  getLocalDateText,
  validatePlanStartDate,
} from "./planStart.ts";
import { buildStructuredWorkout } from "./structuredWorkout.ts";
import type {
  GeneratedPlannedWorkout,
  GeneratedTrainingPlan,
  RaceDistance,
  RaceGoal,
  RunnerProfile,
  RunningDaysPerWeek,
  TerrainAvailable,
  TrainingAggressiveness,
  TrainingDay,
  WorkoutType,
} from "@/types/training";

type PlanGeneratorOptions = {
  startDate?: string;
};

type AggressivenessSettings = {
  baseMileageMultiplier: number;
  weeklyIncreaseRate: number;
  maxWeeklyMileageKm: Record<RaceDistance, number>;
  longRunShare: number;
  secondQualityStartsWeek: number;
};

type PaceTargets = {
  easySecPerKm: number;
  thresholdSecPerKm: number;
  racePaceSecPerKm: number;
};

type PlannedDay = {
  date: Date;
  dateText: string;
  dayLabel: TrainingDay;
  weekNumber: number;
  workoutType: WorkoutType;
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

const settingsByAggressiveness: Record<
  TrainingAggressiveness,
  AggressivenessSettings
> = {
  conservative: {
    baseMileageMultiplier: 0.9,
    weeklyIncreaseRate: 0.06,
    maxWeeklyMileageKm: {
      marathon: 52,
      half_marathon: 34,
    },
    longRunShare: 0.33,
    secondQualityStartsWeek: 99,
  },
  balanced: {
    baseMileageMultiplier: 1,
    weeklyIncreaseRate: 0.08,
    maxWeeklyMileageKm: {
      marathon: 64,
      half_marathon: 42,
    },
    longRunShare: 0.35,
    secondQualityStartsWeek: 7,
  },
  aggressive: {
    baseMileageMultiplier: 1.08,
    weeklyIncreaseRate: 0.1,
    maxWeeklyMileageKm: {
      marathon: 74,
      half_marathon: 50,
    },
    longRunShare: 0.37,
    secondQualityStartsWeek: 5,
  },
};

export function generateTrainingPlan(
  runnerProfile: RunnerProfile,
  raceGoal: RaceGoal,
  options: PlanGeneratorOptions = {},
): GeneratedTrainingPlan {
  if (raceGoal.distance !== "marathon" && raceGoal.distance !== "half_marathon") {
    throw new Error("Plan Generator v1 only supports marathon and half marathon goals.");
  }

  const assumptions: string[] = [];
  const warnings: string[] = [];
  const effectiveRunningDaysPerWeek = getEffectiveRunningDaysPerWeek(
    runnerProfile,
  );
  const availableTrainingDays = getAvailableTrainingDays(
    runnerProfile,
    effectiveRunningDaysPerWeek,
    assumptions,
    warnings,
  );
  const runningDays = selectRunningDaysForPlan({
    availableTrainingDays,
    runningDaysPerWeek: effectiveRunningDaysPerWeek,
    preferredLongRunDay: runnerProfile.preferred_long_run_day,
  });
  const terrainAvailable = getTerrainAvailable(runnerProfile, assumptions);
  const todayDateText = getLocalDateText();
  const startDateText = options.startDate ?? todayDateText;
  const startDateValidationMessage = validatePlanStartDate({
    startDateText,
    raceDateText: raceGoal.race_date,
    raceDistance: raceGoal.distance,
    todayDateText,
  });

  if (startDateValidationMessage) {
    throw new Error(startDateValidationMessage);
  }

  const startDate = parseDateOnly(startDateText);
  const raceDate = parseDateOnly(raceGoal.race_date);

  const longRunDay = getLongRunDay(
    runnerProfile,
    runningDays,
    assumptions,
  );
  const totalDays = daysBetween(startDate, raceDate) + 1;
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
  addTimelineWarnings(raceGoal.distance, totalWeeks, warnings);

  const settings = settingsByAggressiveness[runnerProfile.training_aggressiveness];
  const startingMileageKm = getStartingMileageKm(
    runnerProfile,
    raceGoal.distance,
    settings,
    assumptions,
    warnings,
  );
  const weeklyMileageTargets = buildWeeklyMileageTargets(
    startingMileageKm,
    totalWeeks,
    raceGoal.distance,
    settings,
  );
  const paceTargets = getPaceTargets(runnerProfile, raceGoal, assumptions);
  addTargetFinishTimeWarnings(runnerProfile, raceGoal, warnings);

  const plannedDays = buildPlannedDays({
    startDate,
    raceDate,
    availableTrainingDays: runningDays,
    longRunDay,
    totalWeeks,
    raceDistance: raceGoal.distance,
    aggressiveness: runnerProfile.training_aggressiveness,
    settings,
  });
  const plannedWorkouts = plannedDays.map((plannedDay) =>
    buildWorkout({
      plannedDay,
      weeklyMileageKm: weeklyMileageTargets[plannedDay.weekNumber - 1],
      raceDistance: raceGoal.distance,
      profileId: runnerProfile.id,
      raceGoalId: raceGoal.id,
      paceTargets,
      terrainAvailable,
      settings,
    }),
  );

  return {
    trainingPlan: {
      profile_id: runnerProfile.id,
      race_goal_id: raceGoal.id,
      name: buildDefaultTrainingPlanName(raceGoal),
      status: "paused",
      start_date: formatDateOnly(startDate),
      end_date: raceGoal.race_date,
      total_weeks: totalWeeks,
      assumptions,
      warnings,
      generated_by: "rule_based_v1",
    },
    plannedWorkouts,
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
      `Available training days are missing, so the plan uses ${fallbackDays.map(formatDayLabel).join(", ")} as a conservative fallback.`,
    );

    return fallbackDays;
  }

  if (runnerProfile.available_training_days.length < runningDaysPerWeek) {
    warnings.push(
      `Profile has ${runnerProfile.available_training_days.length} available training day${runnerProfile.available_training_days.length === 1 ? "" : "s"}, but ${runningDaysPerWeek} running days per week were requested. The plan uses the saved available days instead of failing.`,
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
  if (runnerProfile.terrain_available.length === 0) {
    assumptions.push(
      "No terrain options were saved, so the plan assumes flat routes and treadmill access.",
    );
    return defaultTerrain;
  }

  return runnerProfile.terrain_available;
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
      )}) is not in available training days, so the plan uses another available day.`,
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

function getStartingMileageKm(
  runnerProfile: RunnerProfile,
  raceDistance: RaceDistance,
  settings: AggressivenessSettings,
  assumptions: string[],
  warnings: string[],
): number {
  const defaultMileageKm = raceDistance === "marathon" ? 24 : 16;

  if (
    runnerProfile.current_weekly_mileage_km === null ||
    runnerProfile.current_weekly_mileage_km <= 0
  ) {
    assumptions.push(
      `No current weekly mileage was saved, so the plan starts from a conservative ${defaultMileageKm} km/week baseline.`,
    );
    warnings.push(
      "Current weekly mileage is missing, so early plan volume is only a conservative estimate.",
    );
    return Math.round(defaultMileageKm * settings.baseMileageMultiplier);
  }

  return Math.max(
    8,
    Math.round(
      runnerProfile.current_weekly_mileage_km * settings.baseMileageMultiplier,
    ),
  );
}

function buildWeeklyMileageTargets(
  startingMileageKm: number,
  totalWeeks: number,
  raceDistance: RaceDistance,
  settings: AggressivenessSettings,
): number[] {
  const taperWeeks = raceDistance === "marathon" ? 3 : 2;
  const peakMileageKm = settings.maxWeeklyMileageKm[raceDistance];
  const weeklyMileageTargets: number[] = [];
  let lastBuildMileageKm = Math.min(startingMileageKm, peakMileageKm);
  let previousWeekMileageKm = Math.round(lastBuildMileageKm);

  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
    const weeksUntilRace = totalWeeks - weekNumber + 1;
    const isTaperWeek = weeksUntilRace <= taperWeeks;
    const isRecoveryWeek = weekNumber % 5 === 0 && !isTaperWeek;

    if (isTaperWeek) {
      const taperMileageKm = Math.max(
        8,
        Math.round(lastBuildMileageKm * getTaperMultiplier(weeksUntilRace)),
      );
      weeklyMileageTargets.push(taperMileageKm);
      previousWeekMileageKm = taperMileageKm;
      continue;
    }

    if (weekNumber === 1) {
      weeklyMileageTargets.push(previousWeekMileageKm);
      continue;
    }

    if (isRecoveryWeek) {
      const recoveryMileageKm = Math.max(
        8,
        Math.round(lastBuildMileageKm * 0.72),
      );
      weeklyMileageTargets.push(recoveryMileageKm);
      previousWeekMileageKm = recoveryMileageKm;
      continue;
    }

    const nextBuildMileageKm = Math.min(
      peakMileageKm,
      Math.round(lastBuildMileageKm * (1 + settings.weeklyIncreaseRate)),
    );
    const maxIncreaseFromPreviousWeek = Math.round(previousWeekMileageKm * 1.2);
    lastBuildMileageKm = Math.min(
      nextBuildMileageKm,
      maxIncreaseFromPreviousWeek,
    );
    weeklyMileageTargets.push(lastBuildMileageKm);
    previousWeekMileageKm = lastBuildMileageKm;
  }

  return weeklyMileageTargets;
}

function getTaperMultiplier(weeksUntilRace: number): number {
  if (weeksUntilRace >= 3) {
    return 0.75;
  }

  if (weeksUntilRace === 2) {
    return 0.55;
  }

  return 0.35;
}

function addTimelineWarnings(
  raceDistance: RaceDistance,
  totalWeeks: number,
  warnings: string[],
): void {
  const minimumMeaningfulWeeks = raceDistance === "marathon" ? 12 : 8;
  const raceLabel = raceDistance === "marathon" ? "marathon" : "half marathon";

  if (totalWeeks < minimumMeaningfulWeeks) {
    warnings.push(
      `Race day is only ${totalWeeks} week${totalWeeks === 1 ? "" : "s"} away. A meaningful ${raceLabel} build is usually at least ${minimumMeaningfulWeeks} weeks, so this plan stays conservative.`,
    );
  }
}

function getPaceTargets(
  runnerProfile: RunnerProfile,
  raceGoal: RaceGoal,
  assumptions: string[],
): PaceTargets {
  const easySecPerKm = runnerProfile.easy_pace_sec_per_km ?? 390;
  const thresholdSecPerKm = runnerProfile.threshold_pace_sec_per_km ?? 330;

  if (runnerProfile.easy_pace_sec_per_km === null) {
    assumptions.push(
      "No easy pace was saved, so easy/recovery paces assume 6:30 per km.",
    );
  }

  if (runnerProfile.threshold_pace_sec_per_km === null) {
    assumptions.push(
      "No threshold pace was saved, so tempo/interval paces assume 5:30 per km.",
    );
  }

  if (raceGoal.target_finish_time_sec === null) {
    assumptions.push(
      "No target finish time was saved, so race-pace workouts use an estimated pace between easy and threshold.",
    );
  }

  const racePaceSecPerKm = raceGoal.target_finish_time_sec
    ? Math.round(raceGoal.target_finish_time_sec / distanceKmByRace[raceGoal.distance])
    : Math.round((easySecPerKm + thresholdSecPerKm) / 2);

  return {
    easySecPerKm,
    thresholdSecPerKm,
    racePaceSecPerKm,
  };
}

function addTargetFinishTimeWarnings(
  runnerProfile: RunnerProfile,
  raceGoal: RaceGoal,
  warnings: string[],
): void {
  if (raceGoal.target_finish_time_sec === null) {
    return;
  }

  const targetPaceSecPerKm = Math.round(
    raceGoal.target_finish_time_sec / distanceKmByRace[raceGoal.distance],
  );

  if (
    runnerProfile.threshold_pace_sec_per_km !== null &&
    targetPaceSecPerKm < runnerProfile.threshold_pace_sec_per_km * 0.95
  ) {
    warnings.push(
      `Target finish time requires about ${formatPaceLabel(targetPaceSecPerKm)} per km, which is faster than the saved threshold pace of ${formatPaceLabel(runnerProfile.threshold_pace_sec_per_km)} per km. Treat target pace workouts cautiously.`,
    );
    return;
  }

  if (
    runnerProfile.easy_pace_sec_per_km !== null &&
    runnerProfile.threshold_pace_sec_per_km === null &&
    targetPaceSecPerKm < runnerProfile.easy_pace_sec_per_km * 0.8
  ) {
    warnings.push(
      `Target finish time requires about ${formatPaceLabel(targetPaceSecPerKm)} per km, which is much faster than the saved easy pace of ${formatPaceLabel(runnerProfile.easy_pace_sec_per_km)} per km. Treat target pace workouts cautiously.`,
    );
    return;
  }
}

function buildPlannedDays(input: {
  startDate: Date;
  raceDate: Date;
  availableTrainingDays: TrainingDay[];
  longRunDay: TrainingDay;
  totalWeeks: number;
  raceDistance: RaceDistance;
  aggressiveness: TrainingAggressiveness;
  settings: AggressivenessSettings;
}): PlannedDay[] {
  const plannedDays: PlannedDay[] = [];
  const totalDays = daysBetween(input.startDate, input.raceDate) + 1;

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset += 1) {
    const date = addDays(input.startDate, dayOffset);
    const dayLabel = getTrainingDay(date);
    const weekNumber = Math.floor(dayOffset / 7) + 1;
    const isAvailableTrainingDay = input.availableTrainingDays.includes(dayLabel);

    plannedDays.push({
      date,
      dateText: formatDateOnly(date),
      dayLabel,
      weekNumber,
      workoutType: isAvailableTrainingDay ? "easy" : "rest",
    });
  }

  const firstTrainingDay = plannedDays.find((plannedDay) =>
    input.availableTrainingDays.includes(plannedDay.dayLabel),
  );

  if (firstTrainingDay) {
    firstTrainingDay.workoutType = "calibration";
  }

  for (let weekNumber = 1; weekNumber <= input.totalWeeks; weekNumber += 1) {
    assignWeekWorkoutTypes({
      plannedDays,
      weekNumber,
      availableTrainingDays: input.availableTrainingDays,
      longRunDay: input.longRunDay,
      totalWeeks: input.totalWeeks,
      raceDistance: input.raceDistance,
      aggressiveness: input.aggressiveness,
      settings: input.settings,
      firstTrainingDay,
    });
  }

  return plannedDays;
}

function assignWeekWorkoutTypes(input: {
  plannedDays: PlannedDay[];
  weekNumber: number;
  availableTrainingDays: TrainingDay[];
  longRunDay: TrainingDay;
  totalWeeks: number;
  raceDistance: RaceDistance;
  aggressiveness: TrainingAggressiveness;
  settings: AggressivenessSettings;
  firstTrainingDay?: PlannedDay;
}): void {
  const weekDays = input.plannedDays.filter(
    (plannedDay) => plannedDay.weekNumber === input.weekNumber,
  );
  const availableWeekDays = weekDays.filter((plannedDay) =>
    input.availableTrainingDays.includes(plannedDay.dayLabel),
  );
  const weeksUntilRace = input.totalWeeks - input.weekNumber + 1;
  const taperWeeks = input.raceDistance === "marathon" ? 3 : 2;
  const isTaperWeek = weeksUntilRace <= taperWeeks;
  const isRecoveryWeek = input.weekNumber % 5 === 0 && !isTaperWeek;

  if (availableWeekDays.length === 0) {
    return;
  }

  const longRunDay =
    availableWeekDays.find(
      (plannedDay) => plannedDay.dayLabel === input.longRunDay,
    ) ?? availableWeekDays[availableWeekDays.length - 1];

  for (const plannedDay of availableWeekDays) {
    if (plannedDay === input.firstTrainingDay) {
      continue;
    }

    plannedDay.workoutType = plannedDay === longRunDay ? "long_run" : "easy";
  }

  const nonLongTrainingDays = availableWeekDays.filter(
    (plannedDay) =>
      plannedDay !== longRunDay && plannedDay !== input.firstTrainingDay,
  );

  if (isRecoveryWeek) {
    assignRecoveryWeek(nonLongTrainingDays);
    assignOptionalStrengthDay(weekDays, input.weekNumber, isTaperWeek);
    return;
  }

  if (isTaperWeek) {
    assignTaperWeek(nonLongTrainingDays, weeksUntilRace);
    return;
  }

  assignNormalWeek({
    nonLongTrainingDays,
    weekNumber: input.weekNumber,
    aggressiveness: input.aggressiveness,
    settings: input.settings,
  });
  assignOptionalStrengthDay(weekDays, input.weekNumber, isTaperWeek);
}

function assignRecoveryWeek(nonLongTrainingDays: PlannedDay[]): void {
  nonLongTrainingDays.forEach((plannedDay, index) => {
    plannedDay.workoutType = index === 0 ? "recovery" : "easy";
  });
}

function assignTaperWeek(
  nonLongTrainingDays: PlannedDay[],
  weeksUntilRace: number,
): void {
  nonLongTrainingDays.forEach((plannedDay, index) => {
    if (weeksUntilRace > 1 && index === 0) {
      plannedDay.workoutType = "marathon_pace";
      return;
    }

    plannedDay.workoutType = index === 0 ? "recovery" : "easy";
  });
}

function assignNormalWeek(input: {
  nonLongTrainingDays: PlannedDay[];
  weekNumber: number;
  aggressiveness: TrainingAggressiveness;
  settings: AggressivenessSettings;
}): void {
  if (input.nonLongTrainingDays.length === 0) {
    return;
  }

  input.nonLongTrainingDays[0].workoutType = getPrimaryQualityWorkout(
    input.weekNumber,
  );

  const canAddSecondQualityWorkout =
    input.nonLongTrainingDays.length >= 3 &&
    input.weekNumber >= input.settings.secondQualityStartsWeek &&
    input.aggressiveness !== "conservative";

  if (canAddSecondQualityWorkout) {
    input.nonLongTrainingDays[input.nonLongTrainingDays.length - 1].workoutType =
      input.weekNumber % 2 === 0 ? "tempo" : "marathon_pace";
  }

}

function assignOptionalStrengthDay(
  weekDays: PlannedDay[],
  weekNumber: number,
  isTaperWeek: boolean,
): void {
  if (weekNumber % 4 !== 0 || isTaperWeek) {
    return;
  }

  const restDays = weekDays.filter(
    (plannedDay) => plannedDay.workoutType === "rest",
  );

  if (restDays.length < 2) {
    return;
  }

  restDays[Math.floor(restDays.length / 2)].workoutType = "strength_optional";
}

function getPrimaryQualityWorkout(weekNumber: number): WorkoutType {
  if (weekNumber % 3 === 1) {
    return "tempo";
  }

  if (weekNumber % 3 === 2) {
    return "interval";
  }

  return "marathon_pace";
}

function buildWorkout(input: {
  plannedDay: PlannedDay;
  weeklyMileageKm: number;
  raceDistance: RaceDistance;
  profileId: string;
  raceGoalId: string;
  paceTargets: PaceTargets;
  terrainAvailable: TerrainAvailable[];
  settings: AggressivenessSettings;
}): GeneratedPlannedWorkout {
  const distanceKm = getWorkoutDistanceKm(
    input.plannedDay.workoutType,
    input.weeklyMileageKm,
    input.raceDistance,
    input.settings,
  );
  const paceRange = getPaceRange(input.plannedDay.workoutType, input.paceTargets);
  const durationMin = getWorkoutDurationMin(
    input.plannedDay.workoutType,
    distanceKm,
    paceRange?.maxSecPerKm ?? null,
  );
  const terrain = getWorkoutTerrain(
    input.plannedDay.workoutType,
    input.plannedDay.weekNumber,
    input.terrainAvailable,
  );
  const workout = {
    profile_id: input.profileId,
    race_goal_id: input.raceGoalId,
    workout_date: input.plannedDay.dateText,
    week_number: input.plannedDay.weekNumber,
    day_label: input.plannedDay.dayLabel,
    workout_type: input.plannedDay.workoutType,
    title: getWorkoutTitle(input.plannedDay.workoutType),
    description: getWorkoutDescription(input.plannedDay.workoutType),
    distance_km: distanceKm,
    duration_min: durationMin,
    target_pace_min_sec_per_km: paceRange?.minSecPerKm ?? null,
    target_pace_max_sec_per_km: paceRange?.maxSecPerKm ?? null,
    target_hr_zone: getTargetHeartRateZone(input.plannedDay.workoutType),
    terrain,
    purpose: getWorkoutPurpose(input.plannedDay.workoutType),
    instructions: getWorkoutInstructions(input.plannedDay.workoutType, terrain),
    status: "planned",
  } satisfies Omit<GeneratedPlannedWorkout, "structured_workout">;

  return {
    ...workout,
    structured_workout: buildStructuredWorkout(workout),
  };
}

function getWorkoutDistanceKm(
  workoutType: WorkoutType,
  weeklyMileageKm: number,
  raceDistance: RaceDistance,
  settings: AggressivenessSettings,
): number | null {
  if (workoutType === "rest" || workoutType === "strength_optional") {
    return null;
  }

  const maxLongRunKm = raceDistance === "marathon" ? 32 : 18;

  if (workoutType === "calibration") {
    return raceDistance === "marathon" ? 5 : 4;
  }

  if (workoutType === "long_run") {
    return roundDistance(
      clamp(weeklyMileageKm * settings.longRunShare, 7, maxLongRunKm),
    );
  }

  if (workoutType === "tempo") {
    return roundDistance(clamp(weeklyMileageKm * 0.18, 5, 12));
  }

  if (workoutType === "interval") {
    return roundDistance(clamp(weeklyMileageKm * 0.16, 5, 10));
  }

  if (workoutType === "marathon_pace") {
    return roundDistance(clamp(weeklyMileageKm * 0.2, 6, 14));
  }

  if (workoutType === "recovery") {
    return roundDistance(clamp(weeklyMileageKm * 0.1, 3, 7));
  }

  return roundDistance(clamp(weeklyMileageKm * 0.14, 4, 10));
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

function getPaceRange(
  workoutType: WorkoutType,
  paceTargets: PaceTargets,
): { minSecPerKm: number; maxSecPerKm: number } | null {
  if (workoutType === "rest" || workoutType === "strength_optional") {
    return null;
  }

  if (workoutType === "tempo") {
    return {
      minSecPerKm: paceTargets.thresholdSecPerKm,
      maxSecPerKm: paceTargets.thresholdSecPerKm + 20,
    };
  }

  if (workoutType === "interval") {
    return {
      minSecPerKm: Math.max(180, paceTargets.thresholdSecPerKm - 25),
      maxSecPerKm: Math.max(180, paceTargets.thresholdSecPerKm - 5),
    };
  }

  if (workoutType === "marathon_pace") {
    return {
      minSecPerKm: Math.max(180, paceTargets.racePaceSecPerKm - 10),
      maxSecPerKm: paceTargets.racePaceSecPerKm + 10,
    };
  }

  if (workoutType === "recovery") {
    return {
      minSecPerKm: paceTargets.easySecPerKm + 30,
      maxSecPerKm: paceTargets.easySecPerKm + 75,
    };
  }

  if (workoutType === "long_run") {
    return {
      minSecPerKm: paceTargets.easySecPerKm + 15,
      maxSecPerKm: paceTargets.easySecPerKm + 60,
    };
  }

  return {
    minSecPerKm: paceTargets.easySecPerKm,
    maxSecPerKm: paceTargets.easySecPerKm + 45,
  };
}

function getWorkoutTerrain(
  workoutType: WorkoutType,
  weekNumber: number,
  terrainAvailable: TerrainAvailable[],
): TerrainAvailable | null {
  if (workoutType === "rest" || workoutType === "strength_optional") {
    return null;
  }

  if (workoutType === "interval") {
    return pickFirstAvailable(terrainAvailable, ["track", "treadmill", "flat"]);
  }

  if (workoutType === "tempo" || workoutType === "marathon_pace") {
    return pickFirstAvailable(terrainAvailable, ["flat", "treadmill", "track"]);
  }

  if (workoutType === "long_run") {
    if (weekNumber % 3 === 0 && terrainAvailable.includes("hills")) {
      return "hills";
    }

    return pickFirstAvailable(terrainAvailable, [
      "trails",
      "flat",
      "treadmill",
      "hills",
    ]);
  }

  if (workoutType === "calibration") {
    return pickFirstAvailable(terrainAvailable, ["track", "flat", "treadmill"]);
  }

  return pickFirstAvailable(terrainAvailable, ["flat", "treadmill", "trails"]);
}

function getWorkoutTitle(workoutType: WorkoutType): string {
  const titles: Record<WorkoutType, string> = {
    calibration: "Calibration run",
    easy: "Easy run",
    long_run: "Long run",
    tempo: "Tempo run",
    interval: "Interval session",
    marathon_pace: "Race-pace practice",
    recovery: "Recovery run",
    rest: "Rest day",
    strength_optional: "Optional strength",
    cross_training: "Cross-training",
  };

  return titles[workoutType];
}

function getWorkoutDescription(workoutType: WorkoutType): string {
  const descriptions: Record<WorkoutType, string> = {
    calibration: "A controlled first run used to confirm that the plan targets feel realistic.",
    easy: "Comfortable aerobic running that builds durability without adding much stress.",
    long_run: "The main endurance workout of the week, kept mostly easy.",
    tempo: "Sustained controlled running near threshold effort.",
    interval: "Shorter faster repeats with easy recovery between efforts.",
    marathon_pace: "Practice settling into goal race rhythm while staying controlled.",
    recovery: "A very light run to keep movement easy during a reduced-load week.",
    rest: "No running planned so your body can absorb the training.",
    strength_optional: "Simple optional strength work to support running durability.",
    cross_training: "Low-impact aerobic work. This type is reserved for later versions.",
  };

  return descriptions[workoutType];
}

function getWorkoutPurpose(workoutType: WorkoutType): string {
  const purposes: Record<WorkoutType, string> = {
    calibration: "Check current fitness and make sure early plan targets are safe.",
    easy: "Build aerobic base and consistency.",
    long_run: "Improve endurance for race day.",
    tempo: "Improve sustainable hard effort without racing the workout.",
    interval: "Improve speed and running economy with controlled volume.",
    marathon_pace: "Practice race-specific pacing and confidence.",
    recovery: "Reduce fatigue while keeping the habit of running.",
    rest: "Protect recovery and lower injury risk.",
    strength_optional: "Support hips, calves, hamstrings, and trunk stability.",
    cross_training: "Maintain aerobic fitness with less impact.",
  };

  return purposes[workoutType];
}

function getWorkoutInstructions(
  workoutType: WorkoutType,
  terrain: TerrainAvailable | null,
): string {
  const terrainNote = terrain
    ? ` Suggested terrain: ${formatTerrainLabel(terrain)}.`
    : "";

  const instructions: Record<WorkoutType, string> = {
    calibration:
      "Warm up for 10 minutes. Run comfortably for the planned time or distance. Finish feeling like you could keep going. Note effort and any discomfort.",
    easy: "Keep the effort conversational. Slow down if breathing becomes forced.",
    long_run:
      "Start slower than you think you need. Keep the effort easy until the final quarter, then finish steady only if you feel good.",
    tempo:
      "Warm up easily. Run the middle portion at controlled hard effort, not all-out. Cool down easily.",
    interval:
      "Warm up well. Run each fast repeat smoothly with easy jogging or walking between repeats. Stop early if form breaks down.",
    marathon_pace:
      "Warm up easily. Settle into planned race rhythm for the focused portion. The effort should feel controlled, not forced.",
    recovery:
      "Keep this deliberately easy. The goal is to finish fresher than you started.",
    rest: "Take the day off running. Gentle walking or mobility is fine if it feels good.",
    strength_optional:
      "Keep it light: squats, lunges, calf raises, glute bridges, and planks. Stop before fatigue affects your next run.",
    cross_training:
      "Use an easy low-impact option like cycling or elliptical. Keep the effort conversational.",
  };

  return `${instructions[workoutType]}${terrainNote}`;
}

function getTargetHeartRateZone(workoutType: WorkoutType): string | null {
  const zones: Record<WorkoutType, string | null> = {
    calibration: "Zone 2 to low Zone 3",
    easy: "Zone 2",
    long_run: "Zone 2",
    tempo: "Zone 3 to Zone 4",
    interval: "Zone 4",
    marathon_pace: "Zone 3",
    recovery: "Zone 1 to Zone 2",
    rest: null,
    strength_optional: null,
    cross_training: "Zone 2",
  };

  return zones[workoutType];
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
  for (const terrain of preferredTerrain) {
    if (terrainAvailable.includes(terrain)) {
      return terrain;
    }
  }

  return terrainAvailable[0] ?? null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 10) / 10;
}

function formatDayLabel(day: TrainingDay): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function formatTerrainLabel(terrain: TerrainAvailable): string {
  return terrain.charAt(0).toUpperCase() + terrain.slice(1);
}

function formatPaceLabel(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = secondsPerKm % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
