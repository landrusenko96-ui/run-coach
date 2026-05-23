import { NextResponse } from "next/server";
import { fetchPlannedWorkoutById } from "@/lib/db/workouts";
import { previewGarminWorkout } from "@/lib/garminBridge/client";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const result = await previewGarminWorkout(requestBody.plannedWorkoutId, {
    fetchPlannedWorkoutById: (plannedWorkoutId) =>
      fetchPlannedWorkoutById(plannedWorkoutId, dbOptions),
  });

  return NextResponse.json(result, { status: 200 });
}
