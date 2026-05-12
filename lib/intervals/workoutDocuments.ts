import type { IntervalsCalendarEventPayload } from "./client.ts";
import type { PlannedWorkout, WorkoutStep, WorkoutType } from "../../types/training.ts";

type ExportableWorkoutType = Extract<
  WorkoutType,
  | "calibration"
  | "easy"
  | "long_run"
  | "tempo"
  | "interval"
  | "marathon_pace"
  | "recovery"
>;

export class IntervalsWorkoutDocumentError extends Error {
  plannedWorkoutId: string | null;

  constructor(message: string, plannedWorkoutId?: string) {
    super(message);
    this.name = "IntervalsWorkoutDocumentError";
    this.plannedWorkoutId = plannedWorkoutId ?? null;
  }
}

export function buildIntervalsCalendarEventPayload(
  plannedWorkout: PlannedWorkout,
): IntervalsCalendarEventPayload {
  validatePlannedWorkout(plannedWorkout);

  const description = buildIntervalsWorkoutText(plannedWorkout);
  const movingTime = getMovingTimeSeconds(plannedWorkout);
  const payload: IntervalsCalendarEventPayload = {
    category: "WORKOUT",
    start_date_local: `${plannedWorkout.workout_date}T00:00:00`,
    name: plannedWorkout.title,
    description,
    type: "Run",
    external_id: plannedWorkout.id,
  };

  if (movingTime !== null) {
    payload.moving_time = movingTime;
  }

  return payload;
}

function validatePlannedWorkout(
  plannedWorkout: PlannedWorkout,
): asserts plannedWorkout is PlannedWorkout & {
  workout_type: ExportableWorkoutType;
  structured_workout: NonNullable<PlannedWorkout["structured_workout"]>;
} {
  if (!plannedWorkout.structured_workout) {
    throw new IntervalsWorkoutDocumentError(
      "Planned workout does not have a structured_workout document.",
      plannedWorkout.id,
    );
  }

  if (plannedWorkout.structured_workout.sport !== "Run") {
    throw new IntervalsWorkoutDocumentError(
      "Only Run structured workouts can be exported to Intervals.icu in the MVP.",
      plannedWorkout.id,
    );
  }

  if (!isExportableWorkoutType(plannedWorkout.workout_type)) {
    throw new IntervalsWorkoutDocumentError(
      `Workout type ${plannedWorkout.workout_type} is not supported for Intervals.icu export.`,
      plannedWorkout.id,
    );
  }

  if (plannedWorkout.structured_workout.steps.length === 0) {
    throw new IntervalsWorkoutDocumentError(
      "Structured workout has no steps to export.",
      plannedWorkout.id,
    );
  }

  validateSteps(plannedWorkout.structured_workout.steps, plannedWorkout.id);
}

function isExportableWorkoutType(
  workoutType: WorkoutType,
): workoutType is ExportableWorkoutType {
  return [
    "calibration",
    "easy",
    "long_run",
    "tempo",
    "interval",
    "marathon_pace",
    "recovery",
  ].includes(workoutType);
}

function validateSteps(steps: WorkoutStep[], plannedWorkoutId: string) {
  for (const step of steps) {
    if (step.repeat) {
      if (step.repeat.count < 1 || step.repeat.steps.length === 0) {
        throw new IntervalsWorkoutDocumentError(
          "Repeat blocks must include at least one repeated step.",
          plannedWorkoutId,
        );
      }

      validateSteps(step.repeat.steps, plannedWorkoutId);
      continue;
    }

    if (step.durationType === "open") {
      throw new IntervalsWorkoutDocumentError(
        "Open-duration workout steps cannot be exported to Intervals.icu.",
        plannedWorkoutId,
      );
    }

    if (
      step.durationValue === undefined ||
      step.durationValue <= 0 ||
      step.durationUnit === undefined
    ) {
      throw new IntervalsWorkoutDocumentError(
        "Workout step is missing a positive duration value and unit.",
        plannedWorkoutId,
      );
    }

    if (step.durationUnit !== "seconds" && step.durationUnit !== "meters") {
      throw new IntervalsWorkoutDocumentError(
        `Unsupported workout step duration unit: ${step.durationUnit}.`,
        plannedWorkoutId,
      );
    }
  }
}

function buildIntervalsWorkoutText(
  plannedWorkout: PlannedWorkout & {
    workout_type: ExportableWorkoutType;
    structured_workout: NonNullable<PlannedWorkout["structured_workout"]>;
  },
): string {
  const lines: string[] = [];

  for (const step of plannedWorkout.structured_workout.steps) {
    lines.push(...buildStepLines(plannedWorkout.workout_type, step));
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildStepLines(
  workoutType: ExportableWorkoutType,
  step: WorkoutStep,
): string[] {
  if (step.repeat) {
    return [
      `${step.repeat.count}x`,
      ...step.repeat.steps.map(
        (repeatStep) =>
          `- ${formatStepDuration(repeatStep)} ${getHeartRateTarget(
            workoutType,
            repeatStep,
          )}`,
      ),
      "",
    ];
  }

  const stepLine = `- ${formatStepDuration(step)} ${getHeartRateTarget(
    workoutType,
    step,
  )}`;

  if (step.type === "warmup") {
    return ["Warmup", "", stepLine, ""];
  }

  if (step.type === "cooldown") {
    return ["Cooldown", "", stepLine, ""];
  }

  if (step.name && ["tempo", "marathon_pace"].includes(workoutType)) {
    return [step.name, "", stepLine, ""];
  }

  return [stepLine, ""];
}

function getHeartRateTarget(
  workoutType: ExportableWorkoutType,
  step: WorkoutStep,
): string {
  if (step.type === "recovery") {
    return "Z1-Z2 HR";
  }

  if (step.type === "warmup" || step.type === "cooldown") {
    return "Z2 HR";
  }

  if (workoutType === "recovery") {
    return "Z1-Z2 HR";
  }

  if (workoutType === "easy" || workoutType === "long_run") {
    return "Z2 HR";
  }

  if (workoutType === "tempo" || workoutType === "marathon_pace") {
    return "Z3-Z4 HR";
  }

  if (workoutType === "interval") {
    return "Z4 HR";
  }

  if (workoutType === "calibration") {
    return "Z2-Z3 HR";
  }

  throw new IntervalsWorkoutDocumentError(
    `No Intervals.icu heart-rate target mapping exists for workout type ${workoutType}.`,
  );
}

function formatStepDuration(step: WorkoutStep): string {
  if (step.durationValue === undefined || step.durationUnit === undefined) {
    throw new IntervalsWorkoutDocumentError(
      "Workout step is missing duration details.",
    );
  }

  if (step.durationUnit === "meters") {
    return formatMeters(step.durationValue);
  }

  return formatSeconds(step.durationValue);
}

function formatMeters(meters: number): string {
  const kilometers = meters / 1000;
  const formattedKilometers = Number(kilometers.toFixed(3)).toString();

  return `${formattedKilometers}km`;
}

function formatSeconds(seconds: number): string {
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }

  if (seconds >= 3600 && seconds % 60 === 0) {
    const hours = Math.floor(seconds / 3600);
    const minutes = (seconds % 3600) / 60;

    return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  }

  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }

  if (seconds > 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${seconds}s`;
}

function getMovingTimeSeconds(plannedWorkout: PlannedWorkout): number | null {
  if (plannedWorkout.duration_min !== null && plannedWorkout.duration_min > 0) {
    return plannedWorkout.duration_min * 60;
  }

  const structuredWorkout = plannedWorkout.structured_workout;

  if (!structuredWorkout) {
    return null;
  }

  return getStepsMovingTimeSeconds(structuredWorkout.steps);
}

function getStepsMovingTimeSeconds(steps: WorkoutStep[]): number | null {
  let totalSeconds = 0;

  for (const step of steps) {
    if (step.repeat) {
      const repeatedSeconds = getStepsMovingTimeSeconds(step.repeat.steps);

      if (repeatedSeconds === null) {
        return null;
      }

      totalSeconds += repeatedSeconds * step.repeat.count;
      continue;
    }

    if (step.durationUnit !== "seconds" || step.durationValue === undefined) {
      return null;
    }

    totalSeconds += step.durationValue;
  }

  return totalSeconds > 0 ? totalSeconds : null;
}
