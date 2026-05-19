import { NextResponse } from "next/server";
import { publishGarminWorkout } from "@/lib/garminBridge/client";

type PublishGarminWorkoutRequest = {
  plannedWorkoutId?: unknown;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      status: "LOCAL_WORKOUT_ERROR",
      plannedWorkoutId: "",
      message,
      publish: null,
      exportRecord: null,
      trackingError: null,
    },
    { status },
  );
}

export async function POST(request: Request) {
  let requestBody: PublishGarminWorkoutRequest;

  try {
    requestBody = (await request.json()) as PublishGarminWorkoutRequest;
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (typeof requestBody.plannedWorkoutId !== "string") {
    return errorResponse("plannedWorkoutId is required.", 400);
  }

  if ("republish" in requestBody) {
    return errorResponse(
      "Republish is no longer supported. Use Update Garmin Export for stale workouts, or Delete from Garmin before publishing again.",
      400,
    );
  }

  const result = await publishGarminWorkout(requestBody.plannedWorkoutId);

  return NextResponse.json(result, { status: 200 });
}
