import { NextResponse } from "next/server";
import { fetchWorkoutExportsForTrainingPlan } from "@/lib/db/workoutExports";
import { fetchPlannedWorkouts, fetchTrainingPlanById } from "@/lib/db/trainingPlans";
import { bulkPublishGarminWorkouts } from "@/lib/garminBridge/client";
import {
  buildGarminBulkPublishCandidates,
  getTodayDateText,
  type GarminBulkPublishWindowDays,
} from "@/lib/garminBridge/publishSelection";
import type {
  GarminBulkPublishWorkoutResult,
  GarminBulkPublishWorkoutsResponse,
  GarminBulkPublishSummary,
  PlannedWorkout,
  WorkoutExport,
} from "@/types/training";

type BulkPublishRequest = {
  trainingPlanId?: unknown;
  windowDays?: unknown;
  includeRetryStatuses?: unknown;
  stopOnError?: unknown;
};

function emptySummary(): GarminBulkPublishSummary {
  return {
    publishedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    partialCount: 0,
    readyCount: 0,
    retryNeedsConfirmationCount: 0,
    invalidCount: 0,
  };
}

function jsonResponse(
  response: GarminBulkPublishWorkoutsResponse,
  status: number,
): NextResponse<GarminBulkPublishWorkoutsResponse> {
  return NextResponse.json(response, { status });
}

function errorResponse(
  message: string,
  status: number,
): NextResponse<GarminBulkPublishWorkoutsResponse> {
  return jsonResponse(
    {
      ok: false,
      message,
      trainingPlanId: "",
      windowDays: 7,
      summary: emptySummary(),
      results: [],
    },
    status,
  );
}

function parseWindowDays(value: unknown): GarminBulkPublishWindowDays | null {
  return value === 7 || value === 14 ? value : null;
}

function getSkippedStatus(action: string): string {
  if (action === "skip_synced") {
    return "SKIPPED_SYNCED";
  }

  if (action === "needs_confirmation") {
    return "SKIPPED_RETRY_NEEDS_CONFIRMATION";
  }

  return "SKIPPED";
}

function buildSkippedResult(input: {
  plannedWorkout: PlannedWorkout;
  exportStatus: GarminBulkPublishWorkoutResult["exportStatus"];
  action: GarminBulkPublishWorkoutResult["action"];
  paceTargetCount: number;
  warnings: string[];
  message: string;
  status: string;
}): GarminBulkPublishWorkoutResult {
  return {
    plannedWorkoutId: input.plannedWorkout.id,
    workoutDate: input.plannedWorkout.workout_date,
    title: input.plannedWorkout.title,
    workoutType: input.plannedWorkout.workout_type,
    exportStatus: input.exportStatus,
    action: input.action,
    paceTargetCount: input.paceTargetCount,
    warnings: input.warnings,
    previewOk: true,
    previewMessage: input.message,
    ok: true,
    status: input.status,
    message: input.message,
    garminWorkoutId: null,
    exportRecord: null,
  };
}

function summarizeResults(
  results: GarminBulkPublishWorkoutResult[],
): GarminBulkPublishSummary {
  return {
    publishedCount: results.filter((result) => result.status === "PUBLISHED")
      .length,
    skippedCount: results.filter((result) => result.status.startsWith("SKIPPED"))
      .length,
    failedCount: results.filter(
      (result) =>
        !result.ok &&
        result.status !== "UPLOADED_NOT_SCHEDULED" &&
        !result.status.startsWith("SKIPPED"),
    ).length,
    partialCount: results.filter(
      (result) => result.status === "UPLOADED_NOT_SCHEDULED",
    ).length,
    readyCount: results.filter((result) => result.action === "publish").length,
    retryNeedsConfirmationCount: results.filter(
      (result) => result.status === "SKIPPED_RETRY_NEEDS_CONFIRMATION",
    ).length,
    invalidCount: results.filter((result) => result.action === "invalid").length,
  };
}

function buildPublishMessage(summary: GarminBulkPublishSummary): string {
  return `Garmin bulk publish finished: ${summary.publishedCount} published, ${summary.skippedCount} skipped, ${summary.failedCount} failed, ${summary.partialCount} partial.`;
}

export async function POST(request: Request) {
  let requestBody: BulkPublishRequest;

  try {
    requestBody = (await request.json()) as BulkPublishRequest;
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (typeof requestBody.trainingPlanId !== "string") {
    return errorResponse("trainingPlanId is required.", 400);
  }

  const windowDays = parseWindowDays(requestBody.windowDays);

  if (!windowDays) {
    return errorResponse("windowDays must be 7 or 14.", 400);
  }

  if (
    "includeRetryStatuses" in requestBody &&
    requestBody.includeRetryStatuses !== undefined &&
    typeof requestBody.includeRetryStatuses !== "boolean"
  ) {
    return errorResponse("includeRetryStatuses must be true or false.", 400);
  }

  if (
    "stopOnError" in requestBody &&
    requestBody.stopOnError !== undefined &&
    typeof requestBody.stopOnError !== "boolean"
  ) {
    return errorResponse("stopOnError must be true or false.", 400);
  }

  try {
    const trainingPlan = await fetchTrainingPlanById(requestBody.trainingPlanId);

    if (trainingPlan.status !== "active") {
      return errorResponse(
        "Only workouts from the active training plan can be published.",
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

    const candidates = buildGarminBulkPublishCandidates({
      workouts: plannedWorkouts,
      workoutExports,
      todayDateText: getTodayDateText(),
      windowDays,
      includeRetryStatuses: requestBody.includeRetryStatuses === true,
    });
    const publishCandidates = candidates.filter(
      (candidate) => candidate.action === "publish",
    );
    const publishIds = publishCandidates.map((candidate) => candidate.workout.id);
    const bulkResult =
      publishIds.length > 0
        ? await bulkPublishGarminWorkouts(publishIds, {
            fetchPlannedWorkoutById: async (plannedWorkoutId) => {
              const plannedWorkout = workoutById.get(plannedWorkoutId);

              if (!plannedWorkout) {
                throw new Error("Could not find the selected planned workout.");
              }

              return plannedWorkout;
            },
            fetchWorkoutExportsForPlannedWorkout: async (plannedWorkoutId) =>
              exportsByPlannedWorkoutId.get(plannedWorkoutId) ?? [],
            stopOnError: requestBody.stopOnError === true,
            bulkDelayMs: 1500,
          })
        : null;
    const resultByPlannedWorkoutId = new Map(
      (bulkResult?.results ?? []).map((result) => [result.plannedWorkoutId, result]),
    );
    const results: GarminBulkPublishWorkoutResult[] = candidates.map(
      (candidate) => {
        if (candidate.action !== "publish") {
          const message =
            candidate.action === "skip_synced"
              ? "Skipped because this workout is already published to Garmin."
              : "Skipped because retry-risk statuses were not confirmed.";

          return buildSkippedResult({
            plannedWorkout: candidate.workout,
            exportStatus: candidate.exportStatus,
            action: candidate.action,
            paceTargetCount: candidate.paceTargetCount,
            warnings: candidate.warnings,
            message,
            status: getSkippedStatus(candidate.action),
          });
        }

        const publishResult = resultByPlannedWorkoutId.get(candidate.workout.id);

        if (!publishResult) {
          return buildSkippedResult({
            plannedWorkout: candidate.workout,
            exportStatus: candidate.exportStatus,
            action: "publish",
            paceTargetCount: candidate.paceTargetCount,
            warnings: [
              ...candidate.warnings,
              "Skipped because bulk publish stopped after an earlier error.",
            ],
            message: "Skipped because bulk publish stopped after an earlier error.",
            status: "SKIPPED_STOP_ON_ERROR",
          });
        }

        return {
          plannedWorkoutId: candidate.workout.id,
          workoutDate: candidate.workout.workout_date,
          title: candidate.workout.title,
          workoutType: candidate.workout.workout_type,
          exportStatus: candidate.exportStatus,
          action: candidate.action,
          paceTargetCount: candidate.paceTargetCount,
          warnings: publishResult.publish?.warnings ?? candidate.warnings,
          previewOk: true,
          previewMessage: "Validated during Garmin publish.",
          ok: publishResult.ok,
          status: publishResult.status,
          message: publishResult.message,
          garminWorkoutId: publishResult.publish?.garmin_workout_id ?? null,
          exportRecord: publishResult.exportRecord,
        };
      },
    );
    const summary = summarizeResults(results);

    return jsonResponse(
      {
        ok: summary.failedCount === 0 && summary.partialCount === 0,
        message: buildPublishMessage(summary),
        trainingPlanId: trainingPlan.id,
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
        : "Could not publish Garmin workouts.",
      500,
    );
  }
}
