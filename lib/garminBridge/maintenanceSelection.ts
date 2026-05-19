import {
  getEffectiveGarminExportStatus,
  getLatestGarminExportByPlannedWorkoutId,
  isWorkoutInGarminBulkPublishWindow,
  type GarminBulkPublishWindowDays,
} from "./publishSelection.ts";
import type {
  GarminBulkExportStatus,
  GarminBulkMaintenanceAction,
  GarminBulkMaintenanceMode,
  GarminBulkMaintenanceSummary,
  PlannedWorkout,
  WorkoutExport,
} from "../../types/training.ts";

export type GarminBulkMaintenanceCandidate = {
  workout: PlannedWorkout;
  exportRecord: WorkoutExport;
  currentStatus: GarminBulkExportStatus;
  garminWorkoutId: string;
  plannedAction: Exclude<GarminBulkMaintenanceAction, "skip">;
  warnings: string[];
};

function isBaseMaintenanceEligible(
  workout: PlannedWorkout,
  todayDateText: string,
): boolean {
  return workout.status === "planned" && workout.workout_date >= todayDateText;
}

function getMaintenanceWarnings(
  mode: GarminBulkMaintenanceMode,
  currentStatus: GarminBulkExportStatus,
): string[] {
  const warnings: string[] = [];

  if (mode === "update_stale") {
    warnings.push(
      "This will try to remove the old Garmin workout, then publish the current app version.",
    );
  }

  if (mode === "delete_selected") {
    warnings.push(
      "This deletes from Garmin only. It does not delete the planned workout from the app.",
    );
  }

  if (currentStatus === "stale") {
    warnings.push("Changed after Garmin export — update if needed");
  }

  if (currentStatus === "partial") {
    warnings.push("Workout may exist in Garmin but may not be scheduled.");
  }

  return Array.from(new Set(warnings));
}

function getMaintenanceAction(
  mode: GarminBulkMaintenanceMode,
  currentStatus: GarminBulkExportStatus,
): Exclude<GarminBulkMaintenanceAction, "skip"> | null {
  if (mode === "update_stale") {
    return currentStatus === "stale" ? "update" : null;
  }

  if (
    currentStatus === "synced" ||
    currentStatus === "stale" ||
    currentStatus === "partial"
  ) {
    return "delete";
  }

  return null;
}

export function buildGarminBulkMaintenanceCandidates(input: {
  mode: GarminBulkMaintenanceMode;
  workouts: PlannedWorkout[];
  workoutExports: WorkoutExport[];
  todayDateText: string;
  windowDays: GarminBulkPublishWindowDays;
}): GarminBulkMaintenanceCandidate[] {
  const exportByPlannedWorkoutId = getLatestGarminExportByPlannedWorkoutId(
    input.workoutExports,
  );

  return input.workouts
    .filter((workout) =>
      isWorkoutInGarminBulkPublishWindow(
        workout,
        input.todayDateText,
        input.windowDays,
      ),
    )
    .filter((workout) => isBaseMaintenanceEligible(workout, input.todayDateText))
    .map((workout) => {
      const exportRecord = exportByPlannedWorkoutId.get(workout.id) ?? null;

      if (!exportRecord?.provider_workout_id) {
        return null;
      }

      const currentStatus = getEffectiveGarminExportStatus(exportRecord);
      const plannedAction = getMaintenanceAction(input.mode, currentStatus);

      if (!plannedAction) {
        return null;
      }

      return {
        workout,
        exportRecord,
        currentStatus,
        garminWorkoutId: exportRecord.provider_workout_id,
        plannedAction,
        warnings: getMaintenanceWarnings(input.mode, currentStatus),
      };
    })
    .filter((candidate): candidate is GarminBulkMaintenanceCandidate =>
      Boolean(candidate),
    )
    .sort((firstCandidate, secondCandidate) => {
      const dateOrder = firstCandidate.workout.workout_date.localeCompare(
        secondCandidate.workout.workout_date,
      );

      if (dateOrder !== 0) {
        return dateOrder;
      }

      return firstCandidate.workout.title.localeCompare(
        secondCandidate.workout.title,
      );
    });
}

export function emptyGarminBulkMaintenanceSummary(): GarminBulkMaintenanceSummary {
  return {
    updatedCount: 0,
    deletedCount: 0,
    failedCount: 0,
    partialCount: 0,
    skippedCount: 0,
    readyCount: 0,
  };
}

export function summarizeGarminBulkMaintenanceResults(
  results: Array<{ ok: boolean; status: string }>,
): GarminBulkMaintenanceSummary {
  return {
    updatedCount: results.filter((result) => result.status === "UPDATED").length,
    deletedCount: results.filter((result) => result.status === "DELETED").length,
    failedCount: results.filter(
      (result) =>
        !result.ok &&
        result.status !== "UPDATED_PARTIAL" &&
        result.status !== "UNSCHEDULED_ONLY" &&
        !result.status.startsWith("SKIPPED"),
    ).length,
    partialCount: results.filter(
      (result) =>
        result.status === "UPDATED_PARTIAL" ||
        result.status === "UNSCHEDULED_ONLY",
    ).length,
    skippedCount: results.filter((result) => result.status.startsWith("SKIPPED"))
      .length,
    readyCount: results.filter(
      (result) =>
        result.status === "UPDATED" ||
        result.status === "DELETED" ||
        result.status === "UPDATED_PARTIAL" ||
        result.status === "UNSCHEDULED_ONLY",
    ).length,
  };
}
