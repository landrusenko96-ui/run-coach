import { NextResponse } from "next/server";
import {
  buildIntervalsWorkoutSyncInput,
  saveIntervalsWorkoutSync,
} from "@/lib/db/intervalsWorkoutSyncs";
import { fetchPlannedWorkoutById } from "@/lib/db/workouts";
import { bulkUpsertCalendarEvents } from "@/lib/intervals/client";
import { buildIntervalsCalendarEventPayload } from "@/lib/intervals/workoutDocuments";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserScopedDbOptions } from "@/lib/db/supabaseClient";
import type {
  IntervalsWorkoutSync,
  PlannedWorkout,
} from "@/types/training";

type PublishWorkoutRequest = {
  plannedWorkoutId?: unknown;
};

type PublishWorkoutResponse = {
  ok: boolean;
  message: string;
  sync: IntervalsWorkoutSync | null;
};

function getTodayDateText(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not determine today's date.");
  }

  return `${year}-${month}-${day}`;
}

function getIntervalsEventId(events: unknown): number | null {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  const firstEvent = events[0] as { id?: unknown };

  return typeof firstEvent.id === "number" ? firstEvent.id : null;
}

function validatePublishableWorkout(plannedWorkout: PlannedWorkout) {
  if (plannedWorkout.status !== "planned") {
    throw new Error("Only planned workouts can be published to Intervals.icu.");
  }

  if (plannedWorkout.workout_date < getTodayDateText()) {
    throw new Error(
      "Only today or future planned workouts can be published to Intervals.icu.",
    );
  }

  if (!plannedWorkout.structured_workout) {
    throw new Error(
      "This planned workout does not have a structured workout document yet.",
    );
  }
}

async function saveFailedSync(
  plannedWorkout: PlannedWorkout,
  error: unknown,
  dbOptions: UserScopedDbOptions,
): Promise<IntervalsWorkoutSync | null> {
  const errorMessage =
    error instanceof Error ? error.message : "Unknown Intervals.icu publish error.";

  try {
    return await saveIntervalsWorkoutSync(
      buildIntervalsWorkoutSyncInput({
        plannedWorkout,
        intervalsEventId: null,
        syncStatus: "failed",
        lastSyncedAt: null,
        lastError: errorMessage,
      }),
      dbOptions,
    );
  } catch {
    return null;
  }
}

function jsonResponse(
  response: PublishWorkoutResponse,
  status: number,
): NextResponse<PublishWorkoutResponse> {
  return NextResponse.json(response, { status });
}

export async function POST(request: Request) {
  let requestBody: PublishWorkoutRequest;

  try {
    requestBody = (await request.json()) as PublishWorkoutRequest;
  } catch {
    return jsonResponse(
      {
        ok: false,
        message: "Request body must be valid JSON.",
        sync: null,
      },
      400,
    );
  }

  if (typeof requestBody.plannedWorkoutId !== "string") {
    return jsonResponse(
      {
        ok: false,
        message: "plannedWorkoutId is required.",
        sync: null,
      },
      400,
    );
  }

  const supabase = await createSupabaseServerClient();
  let user: Awaited<ReturnType<typeof requireServerUser>>;

  try {
    user = await requireServerUser(supabase);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return jsonResponse(
        {
          ok: false,
          message: error.message,
          sync: null,
        },
        401,
      );
    }

    return jsonResponse(
      {
        ok: false,
        message: "Could not check your sign-in session.",
        sync: null,
      },
      500,
    );
  }

  const dbOptions = {
    supabase,
    userId: user.id,
  };
  let plannedWorkout: PlannedWorkout;

  try {
    plannedWorkout = await fetchPlannedWorkoutById(
      requestBody.plannedWorkoutId,
      dbOptions,
    );
    validatePublishableWorkout(plannedWorkout);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "This planned workout cannot be published.",
        sync: null,
      },
      400,
    );
  }

  try {
    const payload = buildIntervalsCalendarEventPayload(plannedWorkout);
    const events = await bulkUpsertCalendarEvents([payload]);
    const now = new Date().toISOString();
    let sync: IntervalsWorkoutSync;

    try {
      sync = await saveIntervalsWorkoutSync(
        buildIntervalsWorkoutSyncInput({
          plannedWorkout,
          intervalsEventId: getIntervalsEventId(events),
          syncStatus: "synced",
          lastSyncedAt: now,
          lastError: null,
        }),
        dbOptions,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown local sync status error.";

      return jsonResponse(
        {
          ok: false,
          message: `Workout was published to Intervals.icu, but the local sync status could not be saved: ${errorMessage}`,
          sync: null,
        },
        500,
      );
    }

    return jsonResponse(
      {
        ok: true,
        message: "Workout published to Intervals.icu.",
        sync,
      },
      200,
    );
  } catch (error) {
    const sync = await saveFailedSync(plannedWorkout, error, dbOptions);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Intervals.icu publish error.";

    return jsonResponse(
      {
        ok: false,
        message: `Could not publish workout to Intervals.icu: ${errorMessage}`,
        sync,
      },
      500,
    );
  }
}
