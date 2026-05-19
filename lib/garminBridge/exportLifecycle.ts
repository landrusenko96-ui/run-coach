import type { WorkoutExport } from "../../types/training.ts";

export const garminExportStaleEligibleStatuses = ["synced", "partial"] as const;

export function isGarminExportStaleEligible(
  workoutExport: WorkoutExport,
  plannedWorkoutIds: string[],
): boolean {
  return Boolean(
    workoutExport.export_provider === "garmin_direct" &&
      workoutExport.planned_workout_id &&
      plannedWorkoutIds.includes(workoutExport.planned_workout_id) &&
      garminExportStaleEligibleStatuses.includes(
        workoutExport.sync_status as (typeof garminExportStaleEligibleStatuses)[number],
      ),
  );
}

export function isGarminExportDeletedEligible(
  workoutExport: WorkoutExport,
  trainingPlanId: string,
): boolean {
  return Boolean(
    workoutExport.export_provider === "garmin_direct" &&
      workoutExport.training_plan_id === trainingPlanId &&
      workoutExport.sync_status !== "deleted",
  );
}
