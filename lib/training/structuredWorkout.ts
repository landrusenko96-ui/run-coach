import type { StructuredWorkout, WorkoutStep, WorkoutType } from "@/types/training";

type StructuredWorkoutSource = {
  workout_type: WorkoutType;
  title: string;
  description: string | null;
  distance_km: number | null;
  duration_min: number | null;
  target_pace_min_sec_per_km: number | null;
  target_pace_max_sec_per_km: number | null;
  target_hr_zone: string | null;
  purpose?: string | null;
  instructions?: string | null;
};

type StepDuration = Pick<
  WorkoutStep,
  "durationType" | "durationValue" | "durationUnit"
>;

type StepTarget = Pick<
  WorkoutStep,
  "targetType" | "targetMin" | "targetMax" | "targetUnit"
>;

const runWorkoutTypes: WorkoutType[] = [
  "easy",
  "long_run",
  "tempo",
  "interval",
  "marathon_pace",
  "recovery",
  "calibration",
];

export function buildStructuredWorkout(
  workout: StructuredWorkoutSource,
): StructuredWorkout | null {
  if (!runWorkoutTypes.includes(workout.workout_type)) {
    return null;
  }

  const description = buildDescription(workout);
  const steps = buildSteps(workout);
  const exportWarnings = getExportWarnings(workout, steps);
  const structuredWorkout: StructuredWorkout = {
    version: 1,
    sport: "Run",
    name: workout.title,
    exportSafe: exportWarnings.length === 0,
    exportWarnings,
    steps,
  };

  if (description) {
    structuredWorkout.description = description;
  }

  return structuredWorkout;
}

function getExportWarnings(
  workout: StructuredWorkoutSource,
  steps: WorkoutStep[],
): string[] {
  const warnings = new Set<string>();

  if (!hasPaceTarget(workout)) {
    warnings.add("Missing planned pace target range for Garmin export.");
  }

  if (hasOpenLeafDuration(steps)) {
    warnings.add("Open-ended workout steps are not export-safe for Garmin MVP.");
  }

  if (hasIncompleteLeafDuration(steps)) {
    warnings.add("Workout has incomplete step duration detail for Garmin export.");
  }

  if (hasIncompletePaceTarget(steps)) {
    warnings.add("Workout has incomplete pace target detail for Garmin export.");
  }

  return [...warnings];
}

function hasOpenLeafDuration(steps: WorkoutStep[]): boolean {
  return steps.some((step) => {
    if (step.repeat) {
      return hasOpenLeafDuration(step.repeat.steps);
    }

    return step.durationType === "open";
  });
}

function hasIncompleteLeafDuration(steps: WorkoutStep[]): boolean {
  return steps.some((step) => {
    if (step.repeat) {
      return (
        step.repeat.count < 1 ||
        step.repeat.steps.length === 0 ||
        hasIncompleteLeafDuration(step.repeat.steps)
      );
    }

    if (step.durationType === "open") {
      return false;
    }

    return (
      step.durationValue === undefined ||
      step.durationValue <= 0 ||
      step.durationUnit === undefined
    );
  });
}

function hasIncompletePaceTarget(steps: WorkoutStep[]): boolean {
  return steps.some((step) => {
    if (step.repeat && hasIncompletePaceTarget(step.repeat.steps)) {
      return true;
    }

    if (step.targetType !== "pace") {
      return false;
    }

    return (
      step.targetMin === undefined ||
      step.targetMax === undefined ||
      step.targetUnit !== "sec_per_km" ||
      step.targetMin <= 0 ||
      step.targetMax <= 0 ||
      step.targetMin > step.targetMax
    );
  });
}

function buildDescription(workout: StructuredWorkoutSource): string | null {
  const descriptionParts = [
    workout.description,
    workout.purpose,
    workout.instructions,
  ].filter((descriptionPart): descriptionPart is string =>
    Boolean(descriptionPart?.trim()),
  );

  return descriptionParts.length > 0 ? descriptionParts.join(" ") : null;
}

function buildSteps(workout: StructuredWorkoutSource): WorkoutStep[] {
  if (workout.workout_type === "calibration") {
    return buildCalibrationSteps(workout);
  }

  if (workout.workout_type === "interval") {
    return buildIntervalSteps(workout);
  }

  if (
    workout.workout_type === "tempo" ||
    workout.workout_type === "marathon_pace"
  ) {
    return buildSustainedQualitySteps(workout);
  }

  return [
    buildStep({
      id: `${workout.workout_type}-main`,
      type: "work",
      name: workout.title,
      duration: getPrimaryDuration(workout),
      target: getPrimaryTarget(workout),
      notes: getStepNotes(workout, workout.instructions ?? undefined),
    }),
  ];
}

function buildCalibrationSteps(workout: StructuredWorkoutSource): WorkoutStep[] {
  return [
    buildStep({
      id: "calibration-warmup",
      type: "warmup",
      name: "Warm up",
      duration: { durationType: "time", durationValue: 600, durationUnit: "seconds" },
      target: getPrimaryTarget(workout),
      notes: getStepNotes(workout, "Keep this easy."),
    }),
    buildStep({
      id: "calibration-work",
      type: "work",
      name: "Steady calibration effort",
      duration: { durationType: "time", durationValue: 1200, durationUnit: "seconds" },
      target: getPrimaryTarget(workout),
      notes: getStepNotes(workout, "Run steady and controlled, not all-out."),
    }),
    buildStep({
      id: "calibration-cooldown",
      type: "cooldown",
      name: "Cool down",
      duration: { durationType: "time", durationValue: 600, durationUnit: "seconds" },
      target: getPrimaryTarget(workout),
      notes: getStepNotes(workout, "Finish easy."),
    }),
  ];
}

function buildSustainedQualitySteps(
  workout: StructuredWorkoutSource,
): WorkoutStep[] {
  return [
    buildStep({
      id: `${workout.workout_type}-warmup`,
      type: "warmup",
      name: "Warm up",
      duration: { durationType: "time", durationValue: 600, durationUnit: "seconds" },
      target: { targetType: "none" },
      notes: getStepNotes(workout, "Start easy before the focused work."),
    }),
    buildStep({
      id: `${workout.workout_type}-work`,
      type: "work",
      name:
        workout.workout_type === "marathon_pace"
          ? "Marathon pace running"
          : "Tempo running",
      duration: getQualityWorkDuration(workout),
      target: getPrimaryTarget(workout),
    }),
    buildStep({
      id: `${workout.workout_type}-cooldown`,
      type: "cooldown",
      name: "Cool down",
      duration: { durationType: "time", durationValue: 600, durationUnit: "seconds" },
      target: { targetType: "none" },
      notes: getStepNotes(workout, "Finish relaxed."),
    }),
  ];
}

function buildIntervalSteps(workout: StructuredWorkoutSource): WorkoutStep[] {
  const repeatCount = getIntervalRepeatCount(workout.distance_km);

  return [
    buildStep({
      id: "interval-warmup",
      type: "warmup",
      name: "Warm up",
      duration: { durationType: "time", durationValue: 600, durationUnit: "seconds" },
      target: { targetType: "none" },
      notes: getStepNotes(workout, "Start easy before the interval set."),
    }),
    buildStep({
      id: "interval-repeat",
      type: "work",
      name: `${repeatCount} x interval set`,
      duration: { durationType: "open" },
      target: { targetType: "none" },
      repeat: {
        count: repeatCount,
        steps: [
          buildStep({
            id: "interval-work",
            type: "work",
            name: "Fast interval",
            duration: {
              durationType: "time",
              durationValue: 180,
              durationUnit: "seconds",
            },
            target: getPrimaryTarget(workout),
          }),
          buildStep({
            id: "interval-recovery",
            type: "recovery",
            name: "Recovery jog",
            duration: {
              durationType: "time",
              durationValue: 120,
              durationUnit: "seconds",
            },
            target: { targetType: "none" },
            notes: getStepNotes(
              workout,
              "Keep this easy enough to repeat the next interval.",
            ),
          }),
        ],
      },
    }),
    buildStep({
      id: "interval-cooldown",
      type: "cooldown",
      name: "Cool down",
      duration: { durationType: "time", durationValue: 600, durationUnit: "seconds" },
      target: { targetType: "none" },
      notes: getStepNotes(workout, "Finish relaxed."),
    }),
  ];
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

function getPrimaryDuration(workout: StructuredWorkoutSource): StepDuration {
  if (workout.distance_km !== null && workout.distance_km > 0) {
    return {
      durationType: "distance",
      durationValue: Math.round(workout.distance_km * 1000),
      durationUnit: "meters",
    };
  }

  if (workout.duration_min !== null && workout.duration_min > 0) {
    return {
      durationType: "time",
      durationValue: workout.duration_min * 60,
      durationUnit: "seconds",
    };
  }

  return { durationType: "open" };
}

function getQualityWorkDuration(
  workout: StructuredWorkoutSource,
): StepDuration {
  if (workout.duration_min !== null && workout.duration_min > 25) {
    return {
      durationType: "time",
      durationValue: Math.max(900, (workout.duration_min - 20) * 60),
      durationUnit: "seconds",
    };
  }

  if (workout.distance_km !== null && workout.distance_km > 3) {
    return {
      durationType: "distance",
      durationValue: Math.round((workout.distance_km - 3) * 1000),
      durationUnit: "meters",
    };
  }

  return getPrimaryDuration(workout);
}

function getPrimaryTarget(workout: StructuredWorkoutSource): StepTarget {
  if (hasPaceTarget(workout)) {
    return {
      targetType: "pace",
      targetMin: Math.min(
        workout.target_pace_min_sec_per_km,
        workout.target_pace_max_sec_per_km,
      ),
      targetMax: Math.max(
        workout.target_pace_min_sec_per_km,
        workout.target_pace_max_sec_per_km,
      ),
      targetUnit: "sec_per_km",
    };
  }

  return { targetType: "none" };
}

function hasPaceTarget(
  workout: StructuredWorkoutSource,
): workout is StructuredWorkoutSource & {
  target_pace_min_sec_per_km: number;
  target_pace_max_sec_per_km: number;
} {
  return (
    workout.target_pace_min_sec_per_km !== null &&
    workout.target_pace_max_sec_per_km !== null &&
    workout.target_pace_min_sec_per_km > 0 &&
    workout.target_pace_max_sec_per_km > 0
  );
}

function getStepNotes(
  workout: StructuredWorkoutSource,
  notes: string | undefined,
): string | undefined {
  if (!hasPaceTarget(workout)) {
    return undefined;
  }

  return notes;
}

function getIntervalRepeatCount(distanceKm: number | null): number {
  if (distanceKm === null) {
    return 4;
  }

  return Math.min(6, Math.max(4, Math.round(distanceKm - 3)));
}
