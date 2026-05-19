import { NextResponse } from "next/server";
import { previewGarminWorkout } from "@/lib/garminBridge/client";

type PreviewGarminWorkoutRequest = {
  plannedWorkoutId?: unknown;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      status: "LOCAL_WORKOUT_ERROR",
      plannedWorkoutId: "",
      message,
      preview: null,
    },
    { status },
  );
}

export async function POST(request: Request) {
  let requestBody: PreviewGarminWorkoutRequest;

  try {
    requestBody = (await request.json()) as PreviewGarminWorkoutRequest;
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (typeof requestBody.plannedWorkoutId !== "string") {
    return errorResponse("plannedWorkoutId is required.", 400);
  }

  const result = await previewGarminWorkout(requestBody.plannedWorkoutId);

  return NextResponse.json(result, { status: 200 });
}
