import { NextResponse } from "next/server";
import {
  fetchIntervalsWorkoutSyncsForTrainingPlan,
  markIntervalsWorkoutSyncsFailedByIds,
} from "@/lib/db/intervalsWorkoutSyncs";
import {
  deleteTrainingPlanAndRelatedData,
  fetchPlannedWorkouts,
} from "@/lib/db/trainingPlans";
import { deleteTrainingPlanWithIntervalsCleanup } from "@/lib/intervals/deleteCleanup";

type DeleteTrainingPlanRequest = {
  trainingPlanId?: unknown;
};

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

  try {
    const result = await deleteTrainingPlanWithIntervalsCleanup(
      {
        trainingPlanId: requestBody.trainingPlanId,
      },
      {
        fetchPlannedWorkouts,
        fetchIntervalsWorkoutSyncsForTrainingPlan,
        markIntervalsWorkoutSyncsFailedByIds,
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
