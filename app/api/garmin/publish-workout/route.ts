import { NextResponse } from "next/server";
import {
  fetchWorkoutExportsForPlannedWorkout,
  saveWorkoutExport,
} from "@/lib/db/workoutExports";
import { fetchPlannedWorkoutById } from "@/lib/db/workouts";
import { publishGarminWorkout } from "@/lib/garminBridge/client";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const supabase = await createSupabaseServerClient();
  let user: Awaited<ReturnType<typeof requireServerUser>>;

  try {
    user = await requireServerUser(supabase);
  } catch (error) {
    return errorResponse(
      error instanceof AuthRequiredError
        ? error.message
        : "Could not check your sign-in session.",
      error instanceof AuthRequiredError ? 401 : 500,
    );
  }

  const dbOptions = {
    supabase,
    userId: user.id,
  };
  const result = await publishGarminWorkout(requestBody.plannedWorkoutId, {
    fetchPlannedWorkoutById: (plannedWorkoutId) =>
      fetchPlannedWorkoutById(plannedWorkoutId, dbOptions),
    fetchWorkoutExportsForPlannedWorkout: (plannedWorkoutId) =>
      fetchWorkoutExportsForPlannedWorkout(plannedWorkoutId, dbOptions),
    saveWorkoutExport: (workoutExport) =>
      saveWorkoutExport(workoutExport, dbOptions),
  });

  return NextResponse.json(result, { status: 200 });
}
