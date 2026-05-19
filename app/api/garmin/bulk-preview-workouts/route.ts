import { NextResponse } from "next/server";
import { fetchWorkoutExportsForTrainingPlan } from "@/lib/db/workoutExports";
import { fetchPlannedWorkouts, fetchTrainingPlanById } from "@/lib/db/trainingPlans";
import { previewGarminWorkout } from "@/lib/garminBridge/client";
import {
  buildGarminBulkPublishCandidates,
  getTodayDateText,
  type GarminBulkPublishWindowDays,
} from "@/lib/garminBridge/publishSelection";
import type {
  GarminBulkPreviewWorkout,
  GarminBulkPreviewWorkoutsResponse,
  GarminBulkPublishSummary,
  PlannedWorkout,
} from "@/types/training";

type BulkPreviewRequest = {
  trainingPlanId?: unknown;
  windowDays?: unknown;
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
  response: GarminBulkPreviewWorkoutsResponse,
  status: number,
): NextResponse<GarminBulkPreviewWorkoutsResponse> {
  return NextResponse.json(response, { status });
}

function errorResponse(
  message: string,
  status: number,
): NextResponse<GarminBulkPreviewWorkoutsResponse> {
  return jsonResponse(
    {
      ok: false,
      message,
      trainingPlanId: "",
      windowDays: 7,
      summary: emptySummary(),
      workouts: [],
    },
    status,
  );
}

function parseWindowDays(value: unknown): GarminBulkPublishWindowDays | null {
  return value === 7 || value === 14 ? value : null;
}

function mergeWarnings(...warningGroups: string[][]): string[] {
  return Array.from(new Set(warningGroups.flat()));
}

function summarizeWorkouts(
  workouts: GarminBulkPreviewWorkout[],
): GarminBulkPublishSummary {
  return {
    ...emptySummary(),
    skippedCount: workouts.filter((workout) => workout.action === "skip_synced")
      .length,
    readyCount: workouts.filter((workout) => workout.action === "publish")
      .length,
    retryNeedsConfirmationCount: workouts.filter(
      (workout) => workout.action === "needs_confirmation",
    ).length,
    invalidCount: workouts.filter((workout) => workout.action === "invalid")
      .length,
  };
}

function buildPreviewMessage(summary: GarminBulkPublishSummary): string {
  if (
    summary.readyCount === 0 &&
    summary.retryNeedsConfirmationCount === 0 &&
    summary.skippedCount === 0 &&
    summary.invalidCount === 0
  ) {
    return "No eligible upcoming Garmin workouts found in this window.";
  }

  return `Garmin bulk preview ready: ${summary.readyCount} ready, ${summary.skippedCount} skipped, ${summary.retryNeedsConfirmationCount} need confirmation, ${summary.invalidCount} invalid.`;
}

export async function POST(request: Request) {
  let requestBody: BulkPreviewRequest;

  try {
    requestBody = (await request.json()) as BulkPreviewRequest;
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
    const candidates = buildGarminBulkPublishCandidates({
      workouts: plannedWorkouts,
      workoutExports,
      todayDateText: getTodayDateText(),
      windowDays,
    });
    const workouts: GarminBulkPreviewWorkout[] = [];

    for (const candidate of candidates) {
      const preview = await previewGarminWorkout(candidate.workout.id, {
        fetchPlannedWorkoutById: async (plannedWorkoutId) => {
          const plannedWorkout = workoutById.get(plannedWorkoutId);

          if (!plannedWorkout) {
            throw new Error("Could not find the selected planned workout.");
          }

          return plannedWorkout as PlannedWorkout;
        },
      });
      const previewWarnings = preview.preview?.warnings ?? [];
      const action =
        candidate.action === "publish" && !preview.ok
          ? "invalid"
          : candidate.action;
      const warnings = mergeWarnings(
        candidate.warnings,
        previewWarnings,
        preview.ok ? [] : [preview.message],
      );

      workouts.push({
        plannedWorkoutId: candidate.workout.id,
        workoutDate: candidate.workout.workout_date,
        title: candidate.workout.title,
        workoutType: candidate.workout.workout_type,
        exportStatus: candidate.exportStatus,
        action,
        paceTargetCount:
          preview.preview?.pace_target_count ?? candidate.paceTargetCount,
        warnings,
        previewOk: preview.ok,
        previewMessage: preview.message,
      });
    }

    const summary = summarizeWorkouts(workouts);

    return jsonResponse(
      {
        ok: workouts.length > 0,
        message: buildPreviewMessage(summary),
        trainingPlanId: trainingPlan.id,
        windowDays,
        summary,
        workouts,
      },
      200,
    );
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Could not preview Garmin bulk publish.",
      500,
    );
  }
}
