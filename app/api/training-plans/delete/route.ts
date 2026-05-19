import { NextResponse } from "next/server";
import {
  fetchIntervalsWorkoutSyncsForTrainingPlan,
  markIntervalsWorkoutSyncsFailedByIds,
} from "@/lib/db/intervalsWorkoutSyncs";
import {
  fetchWorkoutExportsForTrainingPlan,
  updateGarminWorkoutExportAfterDelete,
} from "@/lib/db/workoutExports";
import {
  deleteTrainingPlanAndRelatedData,
  fetchPlannedWorkouts,
} from "@/lib/db/trainingPlans";
import { deleteTrainingPlanWithIntervalsCleanup } from "@/lib/intervals/deleteCleanup";
import type { GarminPlanDeleteCleanupMode } from "@/types/training";

type DeleteTrainingPlanRequest = {
  trainingPlanId?: unknown;
  garminCleanupMode?: unknown;
};

function parseGarminCleanupMode(
  value: unknown,
): GarminPlanDeleteCleanupMode | null {
  if (value === undefined) {
    return "app_only";
  }

  return value === "app_only" || value === "attempt_future_delete"
    ? value
    : null;
}

export async function POST(request: Request) {
  let requestBody: DeleteTrainingPlanRequest;

  try {
    requestBody = (await request.json()) as DeleteTrainingPlanRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Request body must be valid JSON.",
        result: null,
      },
      { status: 400 },
    );
  }

  if (typeof requestBody.trainingPlanId !== "string") {
    return NextResponse.json(
      {
        ok: false,
        message: "trainingPlanId is required.",
        result: null,
      },
      { status: 400 },
    );
  }

  const garminCleanupMode = parseGarminCleanupMode(
    requestBody.garminCleanupMode,
  );

  if (!garminCleanupMode) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "garminCleanupMode must be app_only or attempt_future_delete.",
        result: null,
      },
      { status: 400 },
    );
  }

  try {
    const result = await deleteTrainingPlanWithIntervalsCleanup(
      {
        trainingPlanId: requestBody.trainingPlanId,
        garminCleanupMode,
      },
      {
        fetchPlannedWorkouts,
        fetchIntervalsWorkoutSyncsForTrainingPlan,
        markIntervalsWorkoutSyncsFailedByIds,
        fetchWorkoutExportsForTrainingPlan,
        updateGarminWorkoutExportAfterDelete,
        deleteTrainingPlanAndRelatedData,
      },
    );

    return NextResponse.json({
      ok: true,
      message: "Training plan deleted.",
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not delete training plan.",
        result: null,
      },
      { status: 500 },
    );
  }
}
