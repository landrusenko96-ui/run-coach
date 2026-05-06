import { buildStructuredWorkout } from "./structuredWorkout.ts";
import type {
  AdjustmentType,
  LoggedWorkout,
  PlanAdjustmentDecision,
  PlanAdjustmentInput,
  PlannedWorkout,
  WorkoutEvaluation,
  WorkoutType,
} from "@/types/training";

type EffortTarget = {
  maxRpe: number;
  veryHighRpe: number;
};

type SnapshotWorkout = Pick<
  PlannedWorkout,
  | "id"
  | "workout_date"
  | "workout_type"
  | "title"
  | "description"
  | "distance_km"
  | "duration_min"
  | "target_pace_min_sec_per_km"
  | "target_pace_max_sec_per_km"
  | "target_hr_zone"
  | "purpose"
  | "instructions"
  | "structured_workout"
>;

const qualityWorkoutTypes: WorkoutType[] = [
  "tempo",
  "interval",
  "marathon_pace",
];

const runWorkoutTypes: WorkoutType[] = [
  "easy",
  "long_run",
  "tempo",
  "interval",
  "marathon_pace",
  "recovery",
  "calibration",
];

const effortTargetsByWorkoutType: Record<WorkoutType, EffortTarget> = {
  easy: { maxRpe: 5, veryHighRpe: 8 },
  long_run: { maxRpe: 6, veryHighRpe: 8 },
  tempo: { maxRpe: 8, veryHighRpe: 10 },
  interval: { maxRpe: 9, veryHighRpe: 10 },
  marathon_pace: { maxRpe: 7, veryHighRpe: 9 },
  recovery: { maxRpe: 4, veryHighRpe: 7 },
  calibration: { maxRpe: 9, veryHighRpe: 10 },
  rest: { maxRpe: 2, veryHighRpe: 5 },
  strength_optional: { maxRpe: 6, veryHighRpe: 8 },
  cross_training: { maxRpe: 6, veryHighRpe: 8 },
};

export function suggestPlanAdjustment(
  input: PlanAdjustmentInput,
): PlanAdjustmentDecision {
  const updatedFuturePlannedWorkouts = copyWorkouts(input.futurePlannedWorkouts);
  const plannedFutureWorkouts = getEditableFutureWorkouts(
    updatedFuturePlannedWorkouts,
    input.loggedWorkout.workout_date,
  );
  const fasterThanTargetPercent = getFasterThanTargetPercent(
    input.loggedWorkout,
    input.plannedWorkout,
  );
  const highEffort = isHighEffort(input.loggedWorkout, input.plannedWorkout);
  const veryHighRpe = hasVeryHighRpe(input.loggedWorkout, input.plannedWorkout);
  const longRunNeedsProtection = isMissedOrUnderCompletedLongRun(
    input.loggedWorkout,
    input.workoutEvaluation,
    input.plannedWorkout,
  );
  const distanceMuchLowerThanPlanned = isDistanceMuchLowerThanPlanned(
    input.loggedWorkout,
    input.workoutEvaluation,
    input.plannedWorkout,
  );

  // Rule 1: A high-risk or very-hard latest workout means the next quality
  // session should be made safer. We never respond by adding harder work.
  if (input.workoutEvaluation.risk_level === "high" || veryHighRpe) {
    return reduceNextIntensity({
      adjustmentType: "reduce_next_intensity",
      reason:
        input.workoutEvaluation.risk_level === "high"
          ? "Latest workout was high risk."
          : "Latest workout RPE was very high for the planned workout type.",
      explanation:
        fasterThanTargetPercent >= 0.07 && highEffort
          ? "The workout was faster than target with high effort, so the plan avoids increasing training paces and reduces the next hard session instead."
          : "The next hard session is reduced so fatigue does not stack into the following workouts.",
      futureWorkouts: updatedFuturePlannedWorkouts,
      plannedFutureWorkouts,
      loggedWorkout: input.loggedWorkout,
      profileEasyPaceSecPerKm: input.profile.easy_pace_sec_per_km,
    });
  }

  // Rule 2: Faster-than-target plus high effort can be overreaching, even when
  // the score is not high risk. Do not reward this with faster training paces.
  if (fasterThanTargetPercent >= 0.07 && highEffort) {
    return reduceNextIntensity({
      adjustmentType: "reduce_next_intensity",
      reason: "Workout was much faster than target with high effort.",
      explanation:
        "This may be overreaching. The plan keeps paces conservative and reduces the next hard session instead of making future workouts faster.",
      futureWorkouts: updatedFuturePlannedWorkouts,
      plannedFutureWorkouts,
      loggedWorkout: input.loggedWorkout,
      profileEasyPaceSecPerKm: input.profile.easy_pace_sec_per_km,
    });
  }

  // Rule 3: Long-run progression is protected. If a long run was missed or
  // under-completed, the next long run should hold or step back.
  if (longRunNeedsProtection) {
    return protectLongRunProgression({
      futureWorkouts: updatedFuturePlannedWorkouts,
      plannedFutureWorkouts,
      loggedWorkout: input.loggedWorkout,
      plannedWorkout: input.plannedWorkout,
    });
  }

  // Rule 4: If the runner completed much less distance than planned, reduce the
  // next week's volume. We do not compensate by adding missed distance later.
  if (distanceMuchLowerThanPlanned) {
    return reduceNextWeekVolume({
      futureWorkouts: updatedFuturePlannedWorkouts,
      plannedFutureWorkouts,
      loggedWorkout: input.loggedWorkout,
      currentWeekNumber: input.plannedWorkout.week_number,
    });
  }

  // Rule 5: Only repeated strong results can make paces slightly faster.
  // This is intentionally small and capped so the plan stays conservative.
  if (hasThreeStrongRecentWorkouts(input.recentWorkoutEvaluations)) {
    return updateTrainingPaces({
      futureWorkouts: updatedFuturePlannedWorkouts,
      plannedFutureWorkouts,
    });
  }

  return buildDecision({
    adjustmentType: "none",
    reason: "Latest workout was close enough to target.",
    explanation:
      "No clear adjustment signal was found, so the future plan stays unchanged.",
    affectedWorkoutIds: [],
    beforeWorkouts: [],
    afterWorkouts: [],
    updatedFuturePlannedWorkouts,
  });
}

function reduceNextIntensity(input: {
  adjustmentType: AdjustmentType;
  reason: string;
  explanation: string;
  futureWorkouts: PlannedWorkout[];
  plannedFutureWorkouts: PlannedWorkout[];
  loggedWorkout: LoggedWorkout;
  profileEasyPaceSecPerKm: number | null;
}): PlanAdjustmentDecision {
  const nextQualityWorkout = input.plannedFutureWorkouts.find((workout) =>
    qualityWorkoutTypes.includes(workout.workout_type),
  );
  const targetWorkout =
    nextQualityWorkout ??
    input.plannedFutureWorkouts.find((workout) =>
      runWorkoutTypes.includes(workout.workout_type),
    );

  if (!targetWorkout) {
    return buildDecision({
      adjustmentType: input.adjustmentType,
      reason: input.reason,
      explanation:
        "No editable future run workout was found, so the plan records the signal without changing workouts.",
      affectedWorkoutIds: [],
      beforeWorkouts: [],
      afterWorkouts: [],
      updatedFuturePlannedWorkouts: input.futureWorkouts,
    });
  }

  const beforeWorkout = snapshotWorkout(targetWorkout);
  const reducedWorkout = convertToRecoveryWorkout(
    targetWorkout,
    input.profileEasyPaceSecPerKm,
  );
  replaceWorkout(input.futureWorkouts, reducedWorkout);

  return buildDecision({
    adjustmentType: input.adjustmentType,
    reason: input.reason,
    explanation: input.explanation,
    affectedWorkoutIds: [targetWorkout.id],
    beforeWorkouts: [beforeWorkout],
    afterWorkouts: [snapshotWorkout(reducedWorkout)],
    updatedFuturePlannedWorkouts: input.futureWorkouts,
  });
}

function protectLongRunProgression(input: {
  futureWorkouts: PlannedWorkout[];
  plannedFutureWorkouts: PlannedWorkout[];
  loggedWorkout: LoggedWorkout;
  plannedWorkout: PlannedWorkout;
}): PlanAdjustmentDecision {
  const nextLongRun = input.plannedFutureWorkouts.find(
    (workout) => workout.workout_type === "long_run",
  );

  if (!nextLongRun || nextLongRun.distance_km === null) {
    return buildDecision({
      adjustmentType: "protect_long_run_progression",
      reason: "Long run was missed or under-completed.",
      explanation:
        "No editable future long run with a distance target was found, so no workout was changed.",
      affectedWorkoutIds: [],
      beforeWorkouts: [],
      afterWorkouts: [],
      updatedFuturePlannedWorkouts: input.futureWorkouts,
    });
  }

  const beforeWorkout = snapshotWorkout(nextLongRun);
  const fallbackDistance =
    input.plannedWorkout.distance_km !== null
      ? input.plannedWorkout.distance_km * 0.9
      : nextLongRun.distance_km * 0.9;
  const maxSafeDistance =
    input.loggedWorkout.distance_km !== null && input.loggedWorkout.distance_km > 0
      ? input.loggedWorkout.distance_km
      : fallbackDistance;
  const protectedDistance = roundDistance(
    Math.min(nextLongRun.distance_km * 0.9, maxSafeDistance),
  );
  const updatedLongRun = refreshStructuredWorkout({
    ...nextLongRun,
    distance_km: Math.max(3, protectedDistance),
    duration_min: updateDurationForDistance(nextLongRun, protectedDistance),
    purpose: "Protect long-run progression after a missed or shortened long run.",
    instructions:
      "Keep this long run easy and controlled. Do not add extra distance to make up for the previous long run.",
  });

  replaceWorkout(input.futureWorkouts, updatedLongRun);

  return buildDecision({
    adjustmentType: "protect_long_run_progression",
    reason: "Long run was missed or under-completed.",
    explanation:
      "The next long run is held back so endurance builds safely instead of jumping after a missed or shortened session.",
    affectedWorkoutIds: [nextLongRun.id],
    beforeWorkouts: [beforeWorkout],
    afterWorkouts: [snapshotWorkout(updatedLongRun)],
    updatedFuturePlannedWorkouts: input.futureWorkouts,
  });
}

function reduceNextWeekVolume(input: {
  futureWorkouts: PlannedWorkout[];
  plannedFutureWorkouts: PlannedWorkout[];
  loggedWorkout: LoggedWorkout;
  currentWeekNumber: number;
}): PlanAdjustmentDecision {
  const nextWeekNumber = getNextFutureWeekNumber(
    input.plannedFutureWorkouts,
    input.currentWeekNumber,
  );
  const workoutsToReduce = input.plannedFutureWorkouts.filter(
    (workout) =>
      workout.week_number === nextWeekNumber &&
      runWorkoutTypes.includes(workout.workout_type) &&
      workout.distance_km !== null,
  );

  if (workoutsToReduce.length === 0) {
    return buildDecision({
      adjustmentType: "reduce_weekly_volume",
      reason: "Workout distance was much lower than planned.",
      explanation:
        "No editable next-week run workouts with distance targets were found, so no workout was changed.",
      affectedWorkoutIds: [],
      beforeWorkouts: [],
      afterWorkouts: [],
      updatedFuturePlannedWorkouts: input.futureWorkouts,
    });
  }

  const beforeWorkouts = workoutsToReduce.map(snapshotWorkout);
  const updatedWorkouts = workoutsToReduce.map((workout) => {
    const updatedDistance = roundDistance((workout.distance_km ?? 0) * 0.9);

    return refreshStructuredWorkout({
      ...workout,
      distance_km: Math.max(3, updatedDistance),
      duration_min: updateDurationForDistance(workout, updatedDistance),
      purpose:
        workout.purpose ??
        "Keep next week's volume conservative after a shortened workout.",
      instructions:
        "Keep this workout controlled. Do not add extra intensity or distance to make up missed volume.",
    });
  });

  for (const workout of updatedWorkouts) {
    replaceWorkout(input.futureWorkouts, workout);
  }

  return buildDecision({
    adjustmentType: "reduce_weekly_volume",
    reason: "Workout distance was much lower than planned.",
    explanation:
      "Next week's planned run volume is reduced slightly. The plan does not stack extra work to compensate.",
    affectedWorkoutIds: updatedWorkouts.map((workout) => workout.id),
    beforeWorkouts,
    afterWorkouts: updatedWorkouts.map(snapshotWorkout),
    updatedFuturePlannedWorkouts: input.futureWorkouts,
  });
}

function updateTrainingPaces(input: {
  futureWorkouts: PlannedWorkout[];
  plannedFutureWorkouts: PlannedWorkout[];
}): PlanAdjustmentDecision {
  const workoutsToUpdate = input.plannedFutureWorkouts.filter(
    (workout) =>
      runWorkoutTypes.includes(workout.workout_type) &&
      workout.target_pace_min_sec_per_km !== null &&
      workout.target_pace_max_sec_per_km !== null,
  );

  if (workoutsToUpdate.length === 0) {
    return buildDecision({
      adjustmentType: "update_training_paces",
      reason: "Three recent workouts were completed well.",
      explanation:
        "No editable future workouts with pace targets were found, so no workout was changed.",
      affectedWorkoutIds: [],
      beforeWorkouts: [],
      afterWorkouts: [],
      updatedFuturePlannedWorkouts: input.futureWorkouts,
    });
  }

  const beforeWorkouts = workoutsToUpdate.map(snapshotWorkout);
  const updatedWorkouts = workoutsToUpdate.map((workout) =>
    refreshStructuredWorkout({
      ...workout,
      target_pace_min_sec_per_km: improvePace(
        workout.target_pace_min_sec_per_km,
      ),
      target_pace_max_sec_per_km: improvePace(
        workout.target_pace_max_sec_per_km,
      ),
    }),
  );

  for (const workout of updatedWorkouts) {
    replaceWorkout(input.futureWorkouts, workout);
  }

  return buildDecision({
    adjustmentType: "update_training_paces",
    reason: "Three recent workouts were completed well with low or medium risk.",
    explanation:
      "Future pace targets are improved slightly. The change is capped so the plan stays conservative.",
    affectedWorkoutIds: updatedWorkouts.map((workout) => workout.id),
    beforeWorkouts,
    afterWorkouts: updatedWorkouts.map(snapshotWorkout),
    updatedFuturePlannedWorkouts: input.futureWorkouts,
  });
}

function buildDecision(input: {
  adjustmentType: AdjustmentType;
  reason: string;
  explanation: string;
  affectedWorkoutIds: string[];
  beforeWorkouts: SnapshotWorkout[];
  afterWorkouts: SnapshotWorkout[];
  updatedFuturePlannedWorkouts: PlannedWorkout[];
}): PlanAdjustmentDecision {
  return {
    adjustment_type: input.adjustmentType,
    reason: input.reason,
    explanation: input.explanation,
    affected_workout_ids: input.affectedWorkoutIds,
    before_snapshot:
      input.beforeWorkouts.length > 0 ? { workouts: input.beforeWorkouts } : null,
    after_snapshot:
      input.afterWorkouts.length > 0 ? { workouts: input.afterWorkouts } : null,
    updatedFuturePlannedWorkouts: input.updatedFuturePlannedWorkouts,
  };
}

function copyWorkouts(workouts: PlannedWorkout[]): PlannedWorkout[] {
  return workouts.map((workout) => ({ ...workout }));
}

function refreshStructuredWorkout(workout: PlannedWorkout): PlannedWorkout {
  return {
    ...workout,
    structured_workout: buildStructuredWorkout(workout),
  };
}

function getEditableFutureWorkouts(
  futureWorkouts: PlannedWorkout[],
  latestWorkoutDate: string,
): PlannedWorkout[] {
  return futureWorkouts
    .filter(
      (workout) =>
        workout.status === "planned" &&
        workout.workout_date > latestWorkoutDate,
    )
    .sort((firstWorkout, secondWorkout) =>
      firstWorkout.workout_date.localeCompare(secondWorkout.workout_date),
    );
}

function convertToRecoveryWorkout(
  workout: PlannedWorkout,
  profileEasyPaceSecPerKm: number | null,
): PlannedWorkout {
  const currentMaxPace =
    workout.target_pace_max_sec_per_km ?? profileEasyPaceSecPerKm;
  const recoveryPaceMin =
    currentMaxPace !== null ? currentMaxPace + 30 : null;
  const recoveryPaceMax =
    currentMaxPace !== null ? currentMaxPace + 75 : null;
  const reducedDistance =
    workout.distance_km !== null
      ? Math.max(3, roundDistance(workout.distance_km * 0.7))
      : null;

  return refreshStructuredWorkout({
    ...workout,
    workout_type: "recovery",
    title: "Recovery run",
    description: "A reduced easy run to absorb recent training stress.",
    distance_km: reducedDistance,
    duration_min:
      reducedDistance !== null
        ? getDurationFromDistanceAndPace(reducedDistance, recoveryPaceMax)
        : reduceDuration(workout.duration_min, 0.75),
    target_pace_min_sec_per_km: recoveryPaceMin,
    target_pace_max_sec_per_km: recoveryPaceMax,
    target_hr_zone: "Zone 1 to Zone 2",
    purpose: "Reduce fatigue and protect the next training block.",
    instructions:
      "Keep this deliberately easy. Finish fresher than you started and do not add extra intensity.",
  });
}

function hasVeryHighRpe(
  loggedWorkout: LoggedWorkout,
  plannedWorkout: PlannedWorkout,
): boolean {
  if (loggedWorkout.rpe === null) {
    return false;
  }

  return (
    loggedWorkout.rpe >=
    effortTargetsByWorkoutType[plannedWorkout.workout_type].veryHighRpe
  );
}

function isHighEffort(
  loggedWorkout: LoggedWorkout,
  plannedWorkout: PlannedWorkout,
): boolean {
  if (loggedWorkout.rpe === null) {
    return false;
  }

  return (
    loggedWorkout.rpe >
    effortTargetsByWorkoutType[plannedWorkout.workout_type].maxRpe
  );
}

function isMissedOrUnderCompletedLongRun(
  loggedWorkout: LoggedWorkout,
  evaluation: WorkoutEvaluation,
  plannedWorkout: PlannedWorkout,
): boolean {
  if (plannedWorkout.workout_type !== "long_run") {
    return false;
  }

  if (plannedWorkout.status === "missed") {
    return true;
  }

  if (evaluation.distance_completion_score < 80) {
    return true;
  }

  if (
    plannedWorkout.distance_km !== null &&
    plannedWorkout.distance_km > 0 &&
    loggedWorkout.distance_km !== null
  ) {
    return loggedWorkout.distance_km / plannedWorkout.distance_km < 0.8;
  }

  return false;
}

function isDistanceMuchLowerThanPlanned(
  loggedWorkout: LoggedWorkout,
  evaluation: WorkoutEvaluation,
  plannedWorkout: PlannedWorkout,
): boolean {
  if (evaluation.distance_completion_score < 70) {
    return true;
  }

  if (
    plannedWorkout.distance_km === null ||
    plannedWorkout.distance_km <= 0 ||
    loggedWorkout.distance_km === null
  ) {
    return false;
  }

  return loggedWorkout.distance_km / plannedWorkout.distance_km < 0.7;
}

function hasThreeStrongRecentWorkouts(
  recentWorkoutEvaluations: WorkoutEvaluation[] | undefined,
): boolean {
  if (!recentWorkoutEvaluations || recentWorkoutEvaluations.length < 3) {
    return false;
  }

  const latestThreeEvaluations = [...recentWorkoutEvaluations]
    .sort((firstEvaluation, secondEvaluation) =>
      secondEvaluation.created_at.localeCompare(firstEvaluation.created_at),
    )
    .slice(0, 3);

  return latestThreeEvaluations.every(
    (evaluation) =>
      evaluation.risk_level !== "high" &&
      evaluation.overall_score >= 85 &&
      evaluation.completion_score >= 90 &&
      evaluation.distance_completion_score >= 90 &&
      evaluation.pace_accuracy_score >= 85 &&
      evaluation.effort_control_score >= 80,
  );
}

function getFasterThanTargetPercent(
  loggedWorkout: LoggedWorkout,
  plannedWorkout: PlannedWorkout,
): number {
  if (
    loggedWorkout.avg_pace_sec_per_km === null ||
    plannedWorkout.target_pace_min_sec_per_km === null ||
    loggedWorkout.avg_pace_sec_per_km >= plannedWorkout.target_pace_min_sec_per_km
  ) {
    return 0;
  }

  return (
    (plannedWorkout.target_pace_min_sec_per_km -
      loggedWorkout.avg_pace_sec_per_km) /
    plannedWorkout.target_pace_min_sec_per_km
  );
}

function getNextFutureWeekNumber(
  plannedFutureWorkouts: PlannedWorkout[],
  currentWeekNumber: number,
): number {
  const futureWeekNumbers = plannedFutureWorkouts
    .map((workout) => workout.week_number)
    .filter((weekNumber) => weekNumber > currentWeekNumber)
    .sort((firstWeekNumber, secondWeekNumber) => firstWeekNumber - secondWeekNumber);

  return futureWeekNumbers[0] ?? plannedFutureWorkouts[0]?.week_number ?? currentWeekNumber;
}

function replaceWorkout(
  futureWorkouts: PlannedWorkout[],
  updatedWorkout: PlannedWorkout,
): void {
  const workoutIndex = futureWorkouts.findIndex(
    (workout) => workout.id === updatedWorkout.id,
  );

  if (workoutIndex >= 0) {
    futureWorkouts[workoutIndex] = updatedWorkout;
  }
}

function snapshotWorkout(workout: PlannedWorkout): SnapshotWorkout {
  return {
    id: workout.id,
    workout_date: workout.workout_date,
    workout_type: workout.workout_type,
    title: workout.title,
    description: workout.description,
    distance_km: workout.distance_km,
    duration_min: workout.duration_min,
    target_pace_min_sec_per_km: workout.target_pace_min_sec_per_km,
    target_pace_max_sec_per_km: workout.target_pace_max_sec_per_km,
    target_hr_zone: workout.target_hr_zone,
    purpose: workout.purpose,
    instructions: workout.instructions,
    structured_workout: workout.structured_workout ?? null,
  };
}

function improvePace(paceSecPerKm: number | null): number | null {
  if (paceSecPerKm === null) {
    return null;
  }

  const improvementSeconds = Math.min(10, Math.round(paceSecPerKm * 0.02));

  return Math.max(180, paceSecPerKm - improvementSeconds);
}

function reduceDuration(
  durationMin: number | null,
  multiplier: number,
): number | null {
  return durationMin !== null ? Math.max(10, Math.round(durationMin * multiplier)) : null;
}

function updateDurationForDistance(
  workout: PlannedWorkout,
  distanceKm: number,
): number | null {
  if (workout.target_pace_max_sec_per_km !== null) {
    return getDurationFromDistanceAndPace(
      distanceKm,
      workout.target_pace_max_sec_per_km,
    );
  }

  if (workout.distance_km !== null && workout.distance_km > 0) {
    return reduceDuration(workout.duration_min, distanceKm / workout.distance_km);
  }

  return workout.duration_min;
}

function getDurationFromDistanceAndPace(
  distanceKm: number,
  paceSecPerKm: number | null,
): number | null {
  if (paceSecPerKm === null) {
    return null;
  }

  return Math.max(10, Math.round((distanceKm * paceSecPerKm) / 60));
}

function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 10) / 10;
}
