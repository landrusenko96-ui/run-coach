import {
  getEffectiveGarminExportStatus,
} from "./publishSelection.ts";
import type {
  GarminBulkExportStatus,
  GarminPlanDeletePreviewWorkout,
  PlannedWorkout,
  WorkoutExport,
} from "../../types/training.ts";

export type GarminPlanDeleteCandidate = {
  workout: PlannedWorkout;
  exportRecord: WorkoutExport;
  currentStatus: GarminBulkExportStatus;
  garminWorkoutId: string;
  warnings: string[];
};

function canAttemptGarminPlanDelete(status: GarminBulkExportStatus): boolean {
  return status === "synced" || status === "stale" || status === "partial";
}

function buildWarnings(status: GarminBulkExportStatus): string[] {
  const warnings = [
    "This plan has workouts already exported to Garmin.",
  ];

  if (status === "stale") {
    warnings.push("Changed after Garmin export — update if needed");
  }

  if (status === "partial") {
    warnings.push("Workout may exist in Garmin but may not be scheduled.");
  }

  return warnings;
}

export function buildFutureGarminPlanDeleteCandidates(input: {
  workouts: PlannedWorkout[];
  workoutExports: WorkoutExport[];
  todayDateText: string;
}): GarminPlanDeleteCandidate[] {
  const exportsByPlannedWorkoutId = new Map<string, WorkoutExport[]>();

  for (const workoutExport of input.workoutExports) {
    if (
      workoutExport.export_provider !== "garmin_direct" ||
      !workoutExport.planned_workout_id
    ) {
      continue;
    }

    const existingExports =
      exportsByPlannedWorkoutId.get(workoutExport.planned_workout_id) ?? [];
    existingExports.push(workoutExport);
    exportsByPlannedWorkoutId.set(
      workoutExport.planned_workout_id,
      existingExports,
    );
  }

  return input.workouts
    .filter(
      (workout) =>
        workout.status === "planned" &&
        workout.workout_date >= input.todayDateText,
    )
    .flatMap((workout) => {
      const exportRecords = exportsByPlannedWorkoutId.get(workout.id) ?? [];

      return exportRecords
        .filter((exportRecord) => exportRecord.provider_workout_id)
        .map((exportRecord) => {
          const currentStatus = getEffectiveGarminExportStatus(exportRecord);

          if (!canAttemptGarminPlanDelete(currentStatus)) {
            return null;
          }

          return {
            workout,
            exportRecord,
            currentStatus,
            garminWorkoutId: exportRecord.provider_workout_id as string,
            warnings: buildWarnings(currentStatus),
          };
        })
        .filter((candidate): candidate is GarminPlanDeleteCandidate =>
          Boolean(candidate),
        );
    })
    .sort((firstCandidate, secondCandidate) => {
      const dateOrder = firstCandidate.workout.workout_date.localeCompare(
        secondCandidate.workout.workout_date,
      );

      if (dateOrder !== 0) {
        return dateOrder;
      }

      const titleOrder = firstCandidate.workout.title.localeCompare(
        secondCandidate.workout.title,
      );

      if (titleOrder !== 0) {
        return titleOrder;
      }

      return firstCandidate.exportRecord.created_at.localeCompare(
        secondCandidate.exportRecord.created_at,
      );
    });
}

export function toGarminPlanDeletePreviewWorkout(
  candidate: GarminPlanDeleteCandidate,
): GarminPlanDeletePreviewWorkout {
  return {
    plannedWorkoutId: candidate.workout.id,
    workoutDate: candidate.workout.workout_date,
    title: candidate.workout.title,
    workoutType: candidate.workout.workout_type,
    currentStatus: candidate.currentStatus,
    garminWorkoutId: candidate.garminWorkoutId,
    warnings: candidate.warnings,
  };
}
