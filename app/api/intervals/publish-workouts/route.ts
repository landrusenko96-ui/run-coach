import { NextResponse } from "next/server";
import { saveIntervalsWorkoutSync } from "@/lib/db/intervalsWorkoutSyncs";
import { fetchTrainingPlanById } from "@/lib/db/trainingPlans";
import { fetchPlannedWorkoutsByIds } from "@/lib/db/workouts";
import { publishIntervalsWorkoutsForPlan } from "@/lib/intervals/publishWorkouts";
import type { IntervalsBulkPublishWorkoutsResponse } from "@/types/training";

type PublishWorkoutsRequest = {
  trainingPlanId?: unknown;
  plannedWorkoutIds?: unknown;
};

function jsonResponse(
  response: IntervalsBulkPublishWorkoutsResponse,
  status: number,
): NextResponse<IntervalsBulkPublishWorkoutsResponse> {
  return NextResponse.json(response, { status });
}

function errorResponse(
  message: string,
  status: number,
): NextResponse<IntervalsBulkPublishWorkoutsResponse> {
  return jsonResponse(
    {
      ok: false,
      message,
      results: [],
    },
    status,
  );
}

function parsePlannedWorkoutIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids = value.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );

  return Array.from(new Set(ids));
}

export async function POST(request: Request) {
  let requestBody: PublishWorkoutsRequest;

  try {
    requestBody = (await request.json()) as PublishWorkoutsRequest;
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (typeof requestBody.trainingPlanId !== "string") {
    return errorResponse("trainingPlanId is required.", 400);
  }

  const plannedWorkoutIds = parsePlannedWorkoutIds(
    requestBody.plannedWorkoutIds,
  );

  if (!plannedWorkoutIds || plannedWorkoutIds.length === 0) {
    return errorResponse("Select at least one planned workout to publish.", 400);
  }

  try {
    const trainingPlan = await fetchTrainingPlanById(requestBody.trainingPlanId);

    if (trainingPlan.status !== "active") {
      return errorResponse(
        "Only workouts from the active training plan can be published.",
        400,
      );
    }

    const plannedWorkouts = await fetchPlannedWorkoutsByIds(plannedWorkoutIds);
    const result = await publishIntervalsWorkoutsForPlan(
      {
        trainingPlanId: trainingPlan.id,
        plannedWorkoutIds,
        plannedWorkouts,
      },
      {
        saveIntervalsWorkoutSync,
      },
    );

    return jsonResponse(result, 200);
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Could not publish workouts to Intervals.icu.",
      500,
    );
  }
}
