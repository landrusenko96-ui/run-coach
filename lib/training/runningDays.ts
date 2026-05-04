import type {
  RunningDaysPerWeek,
  TrainingAggressiveness,
} from "@/types/training";

export const runningDaysPerWeekOptions: RunningDaysPerWeek[] = [
  2,
  3,
  4,
  5,
  6,
];

export function getDefaultRunningDaysPerWeek(
  trainingAggressiveness: TrainingAggressiveness,
): RunningDaysPerWeek {
  if (trainingAggressiveness === "conservative") {
    return 2;
  }

  if (trainingAggressiveness === "aggressive") {
    return 5;
  }

  return 3;
}

export function getEffectiveRunningDaysPerWeek(input: {
  running_days_per_week: RunningDaysPerWeek | null;
  training_aggressiveness: TrainingAggressiveness;
}): RunningDaysPerWeek {
  return (
    input.running_days_per_week ??
    getDefaultRunningDaysPerWeek(input.training_aggressiveness)
  );
}

export function parseRunningDaysPerWeek(
  value: number | null,
): RunningDaysPerWeek | null {
  if (value === null) {
    return null;
  }

  if (runningDaysPerWeekOptions.includes(value as RunningDaysPerWeek)) {
    return value as RunningDaysPerWeek;
  }

  throw new Error("Running days per week must be between 2 and 6.");
}
