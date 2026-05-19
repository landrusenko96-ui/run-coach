import { NextResponse } from "next/server";
import { updateGarminWorkout } from "@/lib/garminBridge/client";

type UpdateGarminWorkoutRequest = {
  plannedWorkoutId?: unknown;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      status: "LOCAL_WORKOUT_ERROR",
      plannedWorkoutId: "",
      message,
      deleteResult: null,
      publish: null,
      exportRecord: null,
      oldExportRecord: null,
      trackingError: null,
    },
    { status },
  );
}

export async function POST(request: Request) {
  let requestBody: UpdateGarminWorkoutRequest;

  try {
    requestBody = (await request.json()) as UpdateGarminWorkoutRequest;
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (typeof requestBody.plannedWorkoutId !== "string") {
    return errorResponse("plannedWorkoutId is required.", 400);
  }

  const result = await updateGarminWorkout(requestBody.plannedWorkoutId);

  return NextResponse.json(result, { status: 200 });
}
