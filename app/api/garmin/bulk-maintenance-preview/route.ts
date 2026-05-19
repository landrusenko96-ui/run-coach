import { NextResponse } from "next/server";
import { fetchWorkoutExportsForTrainingPlan } from "@/lib/db/workoutExports";
import { fetchPlannedWorkouts, fetchTrainingPlanById } from "@/lib/db/trainingPlans";
import {
  buildGarminBulkMaintenanceCandidates,
  emptyGarminBulkMaintenanceSummary,
} from "@/lib/garminBridge/maintenanceSelection";
import {
  getTodayDateText,
  type GarminBulkPublishWindowDays,
} from "@/lib/garminBridge/publishSelection";
import type {
  GarminBulkMaintenanceMode,
  GarminBulkMaintenancePreviewResponse,
  GarminBulkMaintenanceWorkout,
} from "@/types/training";

type BulkMaintenancePreviewRequest = {
  trainingPlanId?: unknown;
  mode?: unknown;
  windowDays?: unknown;
};

function jsonResponse(
  response: GarminBulkMaintenancePreviewResponse,
  status: number,
): NextResponse<GarminBulkMaintenancePreviewResponse> {
  return NextResponse.json(response, { status });
}

function errorResponse(
  message: string,
  status: number,
): NextResponse<GarminBulkMaintenancePreviewResponse> {
  return jsonResponse(
    {
      ok: false,
      message,
      trainingPlanId: "",
      mode: "update_stale",
      windowDays: 7,
      summary: emptyGarminBulkMaintenanceSummary(),
      workouts: [],
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

function buildPreviewMessage(input: {
  mode: GarminBulkMaintenanceMode;
  readyCount: number;
  windowDays: GarminBulkPublishWindowDays;
}): string {
  if (input.readyCount === 0) {
    return input.mode === "update_stale"
      ? `No stale Garmin exports found in the next ${input.windowDays} days.`
      : `No deletable Garmin exports found in the next ${input.windowDays} days.`;
  }

  return input.mode === "update_stale"
    ? `Found ${input.readyCount} stale Garmin export${input.readyCount === 1 ? "" : "s"} to update in the next ${input.windowDays} days.`
    : `Found ${input.readyCount} Garmin export${input.readyCount === 1 ? "" : "s"} available for selected deletion in the next ${input.windowDays} days.`;
}

export async function POST(request: Request) {
  let requestBody: BulkMaintenancePreviewRequest;

  try {
    requestBody = (await request.json()) as BulkMaintenancePreviewRequest;
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
    const candidates = buildGarminBulkMaintenanceCandidates({
      mode,
      workouts: plannedWorkouts,
      workoutExports,
      todayDateText: getTodayDateText(),
      windowDays,
    });
    const workouts: GarminBulkMaintenanceWorkout[] = candidates.map(
      (candidate) => ({
        plannedWorkoutId: candidate.workout.id,
        workoutDate: candidate.workout.workout_date,
        title: candidate.workout.title,
        workoutType: candidate.workout.workout_type,
        currentStatus: candidate.currentStatus,
        garminWorkoutId: candidate.garminWorkoutId,
        plannedAction: candidate.plannedAction,
        warnings: candidate.warnings,
      }),
    );
    const summary = {
      ...emptyGarminBulkMaintenanceSummary(),
      readyCount: workouts.length,
    };

    return jsonResponse(
      {
        ok: workouts.length > 0,
        message: buildPreviewMessage({
          mode,
          readyCount: workouts.length,
          windowDays,
        }),
        trainingPlanId: trainingPlan.id,
        mode,
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
        : "Could not preview Garmin bulk maintenance.",
      500,
    );
  }
}
