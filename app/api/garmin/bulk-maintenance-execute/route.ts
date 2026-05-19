import { NextResponse } from "next/server";
import { fetchWorkoutExportsForTrainingPlan } from "@/lib/db/workoutExports";
import { fetchPlannedWorkouts, fetchTrainingPlanById } from "@/lib/db/trainingPlans";
import {
  bulkDeleteGarminWorkouts,
  bulkUpdateGarminWorkouts,
} from "@/lib/garminBridge/client";
import {
  buildGarminBulkMaintenanceCandidates,
  emptyGarminBulkMaintenanceSummary,
  summarizeGarminBulkMaintenanceResults,
  type GarminBulkMaintenanceCandidate,
} from "@/lib/garminBridge/maintenanceSelection";
import {
  getTodayDateText,
  type GarminBulkPublishWindowDays,
} from "@/lib/garminBridge/publishSelection";
import type {
  GarminBulkMaintenanceExecuteResponse,
  GarminBulkMaintenanceMode,
  GarminBulkMaintenanceResult,
  PlannedWorkout,
  WorkoutExport,
} from "@/types/training";

type BulkMaintenanceExecuteRequest = {
  trainingPlanId?: unknown;
  mode?: unknown;
  windowDays?: unknown;
  selectedPlannedWorkoutIds?: unknown;
  stopOnError?: unknown;
};

function jsonResponse(
  response: GarminBulkMaintenanceExecuteResponse,
  status: number,
): NextResponse<GarminBulkMaintenanceExecuteResponse> {
  return NextResponse.json(response, { status });
}

function errorResponse(
  message: string,
  status: number,
): NextResponse<GarminBulkMaintenanceExecuteResponse> {
  return jsonResponse(
    {
      ok: false,
      message,
      trainingPlanId: "",
      mode: "update_stale",
      windowDays: 7,
      summary: emptyGarminBulkMaintenanceSummary(),
      results: [],
    },
    status,
  );
}

function parseMode(value: unknown): GarminBulkMaintenanceMode | null {
  return value === "update_stale" || value === "delete_selected"
    ? value
    : null;
}

function parseWindowDays(value: unknown): GarminBulkPublishWindowDays | null {
  return value === 7 || value === 14 ? value : null;
}

function parseSelectedIds(value: unknown): string[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const ids = value.filter((item): item is string => typeof item === "string");

  return ids.length === value.length ? Array.from(new Set(ids)) : null;
}

function getSkippedResult(input: {
  candidate: GarminBulkMaintenanceCandidate;
  status: string;
  message: string;
}): GarminBulkMaintenanceResult {
  return {
    plannedWorkoutId: input.candidate.workout.id,
    workoutDate: input.candidate.workout.workout_date,
    title: input.candidate.workout.title,
    workoutType: input.candidate.workout.workout_type,
    currentStatus: input.candidate.currentStatus,
    garminWorkoutId: input.candidate.garminWorkoutId,
    plannedAction: "skip",
    warnings: input.candidate.warnings,
    ok: true,
    status: input.status,
    message: input.message,
    resultGarminWorkoutId: null,
    exportRecord: null,
  };
}

function getBaseResult(input: {
  candidate: GarminBulkMaintenanceCandidate;
  ok: boolean;
  status: string;
  message: string;
  resultGarminWorkoutId: string | null;
  exportRecord: WorkoutExport | null;
  warnings: string[];
}): GarminBulkMaintenanceResult {
  return {
    plannedWorkoutId: input.candidate.workout.id,
    workoutDate: input.candidate.workout.workout_date,
    title: input.candidate.workout.title,
    workoutType: input.candidate.workout.workout_type,
    currentStatus: input.candidate.currentStatus,
    garminWorkoutId: input.candidate.garminWorkoutId,
    plannedAction: input.candidate.plannedAction,
    warnings: input.warnings,
    ok: input.ok,
    status: input.status,
    message: input.message,
    resultGarminWorkoutId: input.resultGarminWorkoutId,
    exportRecord: input.exportRecord,
  };
}

function buildFinishMessage(summary: GarminBulkMaintenanceExecuteResponse["summary"]) {
  return `Garmin bulk maintenance finished: ${summary.updatedCount} updated, ${summary.deletedCount} deleted, ${summary.failedCount} failed, ${summary.partialCount} partial, ${summary.skippedCount} skipped.`;
}

function groupExportsByPlannedWorkoutId(
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

export async function POST(request: Request) {
  let requestBody: BulkMaintenanceExecuteRequest;

  try {
    requestBody = (await request.json()) as BulkMaintenanceExecuteRequest;
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (typeof requestBody.trainingPlanId !== "string") {
    return errorResponse("trainingPlanId is required.", 400);
  }

  const mode = parseMode(requestBody.mode);

  if (!mode) {
    return errorResponse("mode must be update_stale or delete_selected.", 400);
  }

  const windowDays = parseWindowDays(requestBody.windowDays);

  if (!windowDays) {
    return errorResponse("windowDays must be 7 or 14.", 400);
  }

  const selectedIds = parseSelectedIds(requestBody.selectedPlannedWorkoutIds);

  if (!selectedIds) {
    return errorResponse("selectedPlannedWorkoutIds must be an array of strings.", 400);
  }

  if (
    "stopOnError" in requestBody &&
    requestBody.stopOnError !== undefined &&
    typeof requestBody.stopOnError !== "boolean"
  ) {
    return errorResponse("stopOnError must be true or false.", 400);
  }

  if (mode === "delete_selected" && selectedIds.length === 0) {
    return errorResponse("Select at least one Garmin export to delete.", 400);
  }

  try {
    const trainingPlan = await fetchTrainingPlanById(requestBody.trainingPlanId);

    if (trainingPlan.status !== "active") {
      return errorResponse(
        "Only workouts from the active training plan can be maintained.",
        400,
      );
    }

    const [plannedWorkouts, workoutExports] = await Promise.all([
      fetchPlannedWorkouts(trainingPlan.id),
      fetchWorkoutExportsForTrainingPlan(trainingPlan.id),
    ]);
    const workoutById = new Map(
      plannedWorkouts.map((workout) => [workout.id, workout]),
    );
    const exportsByPlannedWorkoutId =
      groupExportsByPlannedWorkoutId(workoutExports);
    const candidates = buildGarminBulkMaintenanceCandidates({
      mode,
      workouts: plannedWorkouts,
      workoutExports,
      todayDateText: getTodayDateText(),
      windowDays,
    });
    const selectedIdSet = new Set(selectedIds);
    const processCandidates =
      mode === "delete_selected"
        ? candidates.filter((candidate) => selectedIdSet.has(candidate.workout.id))
        : candidates;
    const processIds = processCandidates.map((candidate) => candidate.workout.id);

    if (processIds.length === 0) {
      return jsonResponse(
        {
          ok: false,
          message:
            mode === "delete_selected"
              ? "No selected Garmin exports are eligible for deletion."
              : "No stale Garmin exports are eligible for update.",
          trainingPlanId: trainingPlan.id,
          mode,
          windowDays,
          summary: {
            ...emptyGarminBulkMaintenanceSummary(),
            skippedCount:
              mode === "delete_selected" ? candidates.length : 0,
          },
          results:
            mode === "delete_selected"
              ? candidates.map((candidate) =>
                  getSkippedResult({
                    candidate,
                    status: "SKIPPED_UNSELECTED",
                    message: "Skipped because it was not selected.",
                  }),
                )
              : [],
        },
        200,
      );
    }

    const commonOptions = {
      fetchPlannedWorkoutById: async (plannedWorkoutId: string) => {
        const plannedWorkout = workoutById.get(plannedWorkoutId);

        if (!plannedWorkout) {
          throw new Error("Could not find the selected planned workout.");
        }

        return plannedWorkout as PlannedWorkout;
      },
      fetchWorkoutExportsForPlannedWorkout: async (plannedWorkoutId: string) =>
        exportsByPlannedWorkoutId.get(plannedWorkoutId) ?? [],
      stopOnError: requestBody.stopOnError === true,
      bulkDelayMs: 1500,
    };
    const bulkResult =
      mode === "update_stale"
        ? await bulkUpdateGarminWorkouts(processIds, commonOptions)
        : await bulkDeleteGarminWorkouts(processIds, commonOptions);
    const resultByPlannedWorkoutId = new Map(
      bulkResult.results.map((result) => [result.plannedWorkoutId, result]),
    );
    const results: GarminBulkMaintenanceResult[] = candidates.map((candidate) => {
      if (
        mode === "delete_selected" &&
        !selectedIdSet.has(candidate.workout.id)
      ) {
        return getSkippedResult({
          candidate,
          status: "SKIPPED_UNSELECTED",
          message: "Skipped because it was not selected.",
        });
      }

      const result = resultByPlannedWorkoutId.get(candidate.workout.id);

      if (!result) {
        return getSkippedResult({
          candidate,
          status: "SKIPPED_STOP_ON_ERROR",
          message: "Skipped because bulk maintenance stopped after an earlier error.",
        });
      }

      if (mode === "update_stale") {
        if (!("publish" in result)) {
          return getSkippedResult({
            candidate,
            status: "SKIPPED_INTERNAL_MISMATCH",
            message: "Skipped because the Garmin update result was unreadable.",
          });
        }

        return getBaseResult({
          candidate,
          ok: result.ok,
          status: result.status,
          message: result.message,
          resultGarminWorkoutId: result.publish?.garmin_workout_id ?? null,
          exportRecord: result.exportRecord,
          warnings: result.exportRecord?.warnings ?? candidate.warnings,
        });
      }

      if (!("deleteResult" in result)) {
        return getSkippedResult({
          candidate,
          status: "SKIPPED_INTERNAL_MISMATCH",
          message: "Skipped because the Garmin delete result was unreadable.",
        });
      }

      return getBaseResult({
        candidate,
        ok: result.ok,
        status: result.status,
        message: result.message,
        resultGarminWorkoutId:
          result.deleteResult?.garmin_workout_id ?? candidate.garminWorkoutId,
        exportRecord: result.exportRecord,
        warnings: result.deleteResult?.warnings ?? candidate.warnings,
      });
    });
    const summary = {
      ...summarizeGarminBulkMaintenanceResults(results),
      readyCount: processIds.length,
    };

    return jsonResponse(
      {
        ok: summary.failedCount === 0 && summary.partialCount === 0,
        message: buildFinishMessage(summary),
        trainingPlanId: trainingPlan.id,
        mode,
        windowDays,
        summary,
        results,
      },
      200,
    );
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Could not execute Garmin bulk maintenance.",
      500,
    );
  }
}
