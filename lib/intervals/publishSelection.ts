import type { PlannedWorkout } from "../../types/training.ts";

export type IntervalsBulkPublishWindowDays = 7 | 14;

export function addDaysToDateText(dateText: string, days: number): string {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export function isIntervalsBulkPublishEligible(
  workout: PlannedWorkout,
  todayDateText: string,
): boolean {
  return Boolean(
    workout.status === "planned" &&
      workout.workout_date >= todayDateText &&
      workout.structured_workout,
  );
}

export function isWorkoutInIntervalsBulkPublishWindow(
  workout: PlannedWorkout,
  todayDateText: string,
  windowDays: IntervalsBulkPublishWindowDays,
): boolean {
  const endDateText = addDaysToDateText(todayDateText, windowDays - 1);

  return (
    workout.workout_date >= todayDateText && workout.workout_date <= endDateText
  );
}

export function getDefaultIntervalsBulkPublishWorkoutIds(
  workouts: PlannedWorkout[],
  todayDateText: string,
  windowDays: IntervalsBulkPublishWindowDays,
): string[] {
  return workouts
    .filter((workout) =>
      isWorkoutInIntervalsBulkPublishWindow(
        workout,
        todayDateText,
        windowDays,
      ),
    )
    .filter((workout) =>
      isIntervalsBulkPublishEligible(workout, todayDateText),
    )
    .map((workout) => workout.id);
}
