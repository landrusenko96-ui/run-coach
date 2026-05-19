import type { DeleteTrainingPlanResult } from "../db/trainingPlans.ts";
import type { UpdateWorkoutExportAfterGarminDeleteInput } from "../db/workoutExportShapes.ts";
import { deleteGarminWorkout, type GarminBridgeDeleteResult } from "../garminBridge/client.ts";
import {
  buildFutureGarminPlanDeleteCandidates,
  type GarminPlanDeleteCandidate,
} from "../garminBridge/planDeletion.ts";
import {
  bulkDeleteCalendarEvents,
  type IntervalsCalendarEventDeleteInput,
} from "./client.ts";
import { getFutureIntervalsSyncDeleteCandidates } from "./syncLifecycle.ts";
import type {
  IntervalsWorkoutSync,
  GarminPlanDeleteCleanupMode,
  PlannedWorkout,
  WorkoutExport,
} from "../../types/training.ts";

export type DeleteTrainingPlanWithIntervalsCleanupInput = {
  trainingPlanId: string;
  garminCleanupMode?: GarminPlanDeleteCleanupMode;
  todayDateText?: string;
};

export type DeleteTrainingPlanWithIntervalsCleanupResult =
  DeleteTrainingPlanResult & {
    intervals_delete_attempt_count: number;
    intervals_deleted_event_count: number;
    garmin_cleanup_mode: GarminPlanDeleteCleanupMode;
    garmin_future_export_count: number;
    garmin_delete_attempt_count: number;
    garmin_deleted_count: number;
    garmin_partial_count: number;
    garmin_failed_count: number;
    garmin_direct_exports_marked_deleted_count: number;
  };

export type DeleteTrainingPlanWithIntervalsCleanupDependencies = {
  fetchPlannedWorkouts: (trainingPlanId: string) => Promise<PlannedWorkout[]>;
  fetchIntervalsWorkoutSyncsForTrainingPlan: (
    trainingPlanId: string,
  ) => Promise<IntervalsWorkoutSync[]>;
  markIntervalsWorkoutSyncsFailedByIds: (
    syncIds: string[],
    lastError: string,
  ) => Promise<IntervalsWorkoutSync[]>;
  fetchWorkoutExportsForTrainingPlan?: (
    trainingPlanId: string,
  ) => Promise<WorkoutExport[]>;
  updateGarminWorkoutExportAfterDelete?: (
    workoutExport: UpdateWorkoutExportAfterGarminDeleteInput,
  ) => Promise<WorkoutExport>;
  deleteDirectGarminWorkout?: (
    plannedWorkoutId: string,
    candidate?: GarminPlanDeleteCandidate,
  ) => Promise<GarminBridgeDeleteResult>;
  deleteTrainingPlanAndRelatedData: (
    trainingPlanId: string,
  ) => Promise<DeleteTrainingPlanResult>;
  bulkDeleteCalendarEvents?: (
    events: IntervalsCalendarEventDeleteInput[],
  ) => Promise<number>;
};

function getTodayDateText(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not determine today's date.");
  }

  return `${year}-${month}-${day}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

function groupWorkoutExportsByPlannedWorkoutId(
  workoutExports: WorkoutExport[],
): Map<string, WorkoutExport[]> {
  const exportsByPlannedWorkoutId = new Map<string, WorkoutExport[]>();

  for (const workoutExport of workoutExports) {
    if (!workoutExport.planned_workout_id) {
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

  return exportsByPlannedWorkoutId;
}

function buildGarminPlanDeleteUpdateInput(input: {
  candidate: GarminPlanDeleteCandidate;
  syncStatus: Extract<WorkoutExport["sync_status"], "deleted" | "partial" | "failed">;
  action: string;
  nowIso: string;
  lastError: string | null;
  warnings: string[];
  bridgeStatus: string | null;
}): UpdateWorkoutExportAfterGarminDeleteInput {
  return {
    id: input.candidate.exportRecord.id,
    sync_status: input.syncStatus,
    last_synced_at:
      input.syncStatus === "deleted" || input.syncStatus === "partial"
        ? input.nowIso
        : input.candidate.exportRecord.last_synced_at,
    last_error: input.lastError,
    warnings: input.warnings,
    payload_snapshot: {
      provider: "garmin_direct",
      action: input.action,
      planned_workout_id: input.candidate.workout.id,
      garmin_workout_id: input.candidate.garminWorkoutId,
      workout_date: input.candidate.workout.workout_date,
      bridge_status: input.bridgeStatus,
      warning: input.lastError,
    },
  };
}

async function updateGarminExportAfterPlanDelete(
  workoutExport: UpdateWorkoutExportAfterGarminDeleteInput,
  dependencies: DeleteTrainingPlanWithIntervalsCleanupDependencies,
): Promise<WorkoutExport> {
  if (!dependencies.updateGarminWorkoutExportAfterDelete) {
    throw new Error("Could not update Garmin export tracking.");
  }

  return dependencies.updateGarminWorkoutExportAfterDelete(workoutExport);
}

async function markGarminExportsAppOnlyDeleted(input: {
  candidates: GarminPlanDeleteCandidate[];
  dependencies: DeleteTrainingPlanWithIntervalsCleanupDependencies;
  nowIso: string;
}): Promise<number> {
  let markedCount = 0;

  for (const candidate of input.candidates) {
    await updateGarminExportAfterPlanDelete(
      buildGarminPlanDeleteUpdateInput({
        candidate,
        syncStatus: "deleted",
        action: "plan_delete_app_only",
        nowIso: input.nowIso,
        lastError: null,
        warnings: [
          "App plan was deleted locally. Garmin cleanup was not attempted; workout may remain in Garmin.",
        ],
        bridgeStatus: null,
      }),
      input.dependencies,
    );
    markedCount += 1;
  }

  return markedCount;
}

async function attemptFutureGarminDeletes(input: {
  candidates: GarminPlanDeleteCandidate[];
  plannedWorkouts: PlannedWorkout[];
  workoutExports: WorkoutExport[];
  dependencies: DeleteTrainingPlanWithIntervalsCleanupDependencies;
  nowIso: string;
}): Promise<{
  deletedCount: number;
  partialCount: number;
  failedCount: number;
}> {
  const workoutById = new Map(
    input.plannedWorkouts.map((workout) => [workout.id, workout]),
  );
  const exportsByPlannedWorkoutId = groupWorkoutExportsByPlannedWorkoutId(
    input.workoutExports,
  );
  const deleteWorkout =
    input.dependencies.deleteDirectGarminWorkout ??
    ((plannedWorkoutId: string, candidate?: GarminPlanDeleteCandidate) =>
      deleteGarminWorkout(plannedWorkoutId, {
        fetchPlannedWorkoutById: async (id) => {
          const plannedWorkout = workoutById.get(id);

          if (!plannedWorkout) {
            throw new Error("Could not find the selected planned workout.");
          }

          return plannedWorkout;
        },
        fetchWorkoutExportsForPlannedWorkout: async (id) =>
          exportsByPlannedWorkoutId.get(id) ?? [],
        targetWorkoutExport: candidate?.exportRecord,
        skipWorkoutExportTracking: true,
      }));
  let deletedCount = 0;
  let partialCount = 0;
  let failedCount = 0;

  for (const candidate of input.candidates) {
    const result = await deleteWorkout(candidate.workout.id, candidate);

    if (result.status === "DELETED") {
      await updateGarminExportAfterPlanDelete(
        buildGarminPlanDeleteUpdateInput({
          candidate,
          syncStatus: "deleted",
          action: "plan_delete_garmin_cleanup_deleted",
          nowIso: input.nowIso,
          lastError: null,
          warnings:
            result.deleteResult?.warnings ??
            ["Garmin delete request completed during plan deletion."],
          bridgeStatus: result.status,
        }),
        input.dependencies,
      );
      deletedCount += 1;
      continue;
    }

    if (result.status === "UNSCHEDULED_ONLY") {
      await updateGarminExportAfterPlanDelete(
        buildGarminPlanDeleteUpdateInput({
          candidate,
          syncStatus: "partial",
          action: "plan_delete_garmin_cleanup_unscheduled_only",
          nowIso: input.nowIso,
          lastError:
            result.message ||
            "Garmin workout was unscheduled, but may still exist in Garmin.",
          warnings:
            result.deleteResult?.warnings ??
            ["Garmin workout may still exist in the Garmin workout library."],
          bridgeStatus: result.status,
        }),
        input.dependencies,
      );
      partialCount += 1;
      continue;
    }

    const lastError = result.message || "Garmin cleanup failed during plan deletion.";
    const warnings = [
      "Garmin cleanup failed during plan deletion. The workout may remain in Garmin.",
      ...(result.deleteResult?.warnings ?? []),
    ];

    await updateGarminExportAfterPlanDelete(
      buildGarminPlanDeleteUpdateInput({
        candidate,
        syncStatus: "failed",
        action: "plan_delete_garmin_cleanup_failed",
        nowIso: input.nowIso,
        lastError,
        warnings: Array.from(new Set(warnings)),
        bridgeStatus: result.status,
      }),
      input.dependencies,
    );
    failedCount += 1;
  }

  return {
    deletedCount,
    partialCount,
    failedCount,
  };
}

export async function deleteTrainingPlanWithIntervalsCleanup(
  input: DeleteTrainingPlanWithIntervalsCleanupInput,
  dependencies: DeleteTrainingPlanWithIntervalsCleanupDependencies,
): Promise<DeleteTrainingPlanWithIntervalsCleanupResult> {
  const plannedWorkouts = await dependencies.fetchPlannedWorkouts(
    input.trainingPlanId,
  );
  const syncs = await dependencies.fetchIntervalsWorkoutSyncsForTrainingPlan(
    input.trainingPlanId,
  );
  const todayDateText = input.todayDateText ?? getTodayDateText();
  const garminCleanupMode = input.garminCleanupMode ?? "app_only";
  const deleteCandidates = getFutureIntervalsSyncDeleteCandidates({
    syncs,
    plannedWorkouts,
    todayDateText,
  });
  let intervalsDeletedEventCount = 0;

  if (deleteCandidates.length > 0) {
    const deleteInputs = deleteCandidates.map((candidate) => ({
      external_id: candidate.externalId,
    }));

    try {
      intervalsDeletedEventCount = await (
        dependencies.bulkDeleteCalendarEvents ?? bulkDeleteCalendarEvents
      )(deleteInputs);
    } catch (error) {
      const deleteErrorMessage = `Could not delete future Intervals.icu events before deleting the plan: ${getErrorMessage(error)}`;

      try {
        await dependencies.markIntervalsWorkoutSyncsFailedByIds(
          deleteCandidates.map((candidate) => candidate.syncId),
          deleteErrorMessage,
        );
      } catch (markError) {
        throw new Error(
          `${deleteErrorMessage} Local plan was not deleted. Also could not mark local sync rows failed: ${getErrorMessage(markError)}`,
        );
      }

      throw new Error(
        `${deleteErrorMessage} Local plan was not deleted. The affected sync rows were marked failed so cleanup can be retried.`,
      );
    }
  }

  const workoutExports = dependencies.fetchWorkoutExportsForTrainingPlan
    ? await dependencies.fetchWorkoutExportsForTrainingPlan(input.trainingPlanId)
    : [];
  const garminDeleteCandidates = buildFutureGarminPlanDeleteCandidates({
    workouts: plannedWorkouts,
    workoutExports,
    todayDateText,
  });
  const nowIso = new Date().toISOString();
  let garminDeletedCount = 0;
  let garminPartialCount = 0;
  let garminFailedCount = 0;
  let garminMarkedDeletedCount = 0;

  if (garminDeleteCandidates.length > 0) {
    if (garminCleanupMode === "attempt_future_delete") {
      const garminResult = await attemptFutureGarminDeletes({
        candidates: garminDeleteCandidates,
        plannedWorkouts,
        workoutExports,
        dependencies,
        nowIso,
      });

      garminDeletedCount = garminResult.deletedCount;
      garminPartialCount = garminResult.partialCount;
      garminFailedCount = garminResult.failedCount;
      garminMarkedDeletedCount = garminResult.deletedCount;
    } else {
      garminMarkedDeletedCount = await markGarminExportsAppOnlyDeleted({
        candidates: garminDeleteCandidates,
        dependencies,
        nowIso,
      });
    }
  }

  const deleteResult = await dependencies.deleteTrainingPlanAndRelatedData(
    input.trainingPlanId,
  );

  return {
    ...deleteResult,
    intervals_delete_attempt_count: deleteCandidates.length,
    intervals_deleted_event_count: intervalsDeletedEventCount,
    garmin_cleanup_mode: garminCleanupMode,
    garmin_future_export_count: garminDeleteCandidates.length,
    garmin_delete_attempt_count:
      garminCleanupMode === "attempt_future_delete"
        ? garminDeleteCandidates.length
        : 0,
    garmin_deleted_count: garminDeletedCount,
    garmin_partial_count: garminPartialCount,
    garmin_failed_count: garminFailedCount,
    garmin_direct_exports_marked_deleted_count: garminMarkedDeletedCount,
  };
}
