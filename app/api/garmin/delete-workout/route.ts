import { NextResponse } from "next/server";
import { deleteGarminWorkout } from "@/lib/garminBridge/client";

type DeleteGarminWorkoutRequest = {
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
      exportRecord: null,
      trackingError: null,
    },
    { status },
  );
}

export async function POST(request: Request) {
  let requestBody: DeleteGarminWorkoutRequest;

  try {
    requestBody = (await request.json()) as DeleteGarminWorkoutRequest;
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (typeof requestBody.plannedWorkoutId !== "string") {
    return errorResponse("plannedWorkoutId is required.", 400);
  }

  const result = await deleteGarminWorkout(requestBody.plannedWorkoutId);

  return NextResponse.json(result, { status: 200 });
}
