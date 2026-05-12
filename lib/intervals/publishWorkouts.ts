import {
  buildIntervalsWorkoutSyncInput,
  type SaveIntervalsWorkoutSyncInput,
} from "../db/intervalsWorkoutSyncShapes.ts";
import {
  bulkUpsertCalendarEvents,
  type IntervalsCalendarEvent,
  type IntervalsCalendarEventPayload,
} from "./client.ts";
import { buildIntervalsCalendarEventPayload } from "./workoutDocuments.ts";
import type {
  IntervalsBulkPublishWorkoutsResponse,
  IntervalsPublishWorkoutResult,
  IntervalsWorkoutSync,
  PlannedWorkout,
} from "../../types/training.ts";

export type PublishIntervalsWorkoutsForPlanInput = {
  trainingPlanId: string;
  plannedWorkoutIds: string[];
  plannedWorkouts: PlannedWorkout[];
  todayDateText?: string;
};

type PreparedWorkoutPayload = {
  plannedWorkout: PlannedWorkout;
  payload: IntervalsCalendarEventPayload;
};

type SaveIntervalsWorkoutSync = (
  sync: SaveIntervalsWorkoutSyncInput,
) => Promise<IntervalsWorkoutSync>;

export type PublishIntervalsWorkoutsDependencies = {
  bulkUpsertCalendarEvents?: (
    events: IntervalsCalendarEventPayload[],
  ) => Promise<IntervalsCalendarEvent[]>;
  saveIntervalsWorkoutSync: SaveIntervalsWorkoutSync;
  now?: () => Date;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

function getPublishBlocker(
  plannedWorkout: PlannedWorkout,
  trainingPlanId: string,
  todayDateText: string,
): string | null {
  if (plannedWorkout.training_plan_id !== trainingPlanId) {
    return "This workout does not belong to the selected active training plan.";
  }

  if (plannedWorkout.status !== "planned") {
    return "Only planned workouts can be published to Intervals.icu.";
  }

  if (plannedWorkout.workout_date < todayDateText) {
    return "Only today or future planned workouts can be published to Intervals.icu.";
  }

  if (!plannedWorkout.structured_workout) {
    return "This planned workout does not have a structured workout document yet.";
  }

  return null;
}

function buildResult(input: {
  plannedWorkoutId: string;
  title: string | null;
  workoutDate: string | null;
  ok: boolean;
  syncStatus: "synced" | "failed";
  message: string;
  intervalsEventId: number | null;
}): IntervalsPublishWorkoutResult {
  return {
    plannedWorkoutId: input.plannedWorkoutId,
    title: input.title,
    workoutDate: input.workoutDate,
    ok: input.ok,
    syncStatus: input.syncStatus,
    message: input.message,
    intervalsEventId: input.intervalsEventId,
  };
}

function getIntervalsEventIdForWorkout(
  events: IntervalsCalendarEvent[],
  plannedWorkoutId: string,
  fallbackIndex: number,
): number | null {
  const matchingEvent = events.find(
    (event) =>
      event.external_id === plannedWorkoutId && typeof event.id === "number",
  );

  if (matchingEvent?.id !== undefined) {
    return matchingEvent.id;
  }

  const fallbackEvent = events[fallbackIndex];

  return typeof fallbackEvent?.id === "number" ? fallbackEvent.id : null;
}

async function saveFailedResult(
  plannedWorkout: PlannedWorkout,
  message: string,
  dependencies: { saveIntervalsWorkoutSync: SaveIntervalsWorkoutSync },
): Promise<IntervalsPublishWorkoutResult> {
  try {
    await dependencies.saveIntervalsWorkoutSync(
      buildIntervalsWorkoutSyncInput({
        plannedWorkout,
        intervalsEventId: null,
        syncStatus: "failed",
        lastSyncedAt: null,
        lastError: message,
      }),
    );

    return buildResult({
      plannedWorkoutId: plannedWorkout.id,
      title: plannedWorkout.title,
      workoutDate: plannedWorkout.workout_date,
      ok: false,
      syncStatus: "failed",
      message,
      intervalsEventId: null,
    });
  } catch (error) {
    return buildResult({
      plannedWorkoutId: plannedWorkout.id,
      title: plannedWorkout.title,
      workoutDate: plannedWorkout.workout_date,
      ok: false,
      syncStatus: "failed",
      message: `${message} Local sync status could not be saved: ${getErrorMessage(error)}`,
      intervalsEventId: null,
    });
  }
}

async function saveSyncedResult(input: {
  plannedWorkout: PlannedWorkout;
  intervalsEventId: number | null;
  lastSyncedAt: string;
  saveIntervalsWorkoutSync: SaveIntervalsWorkoutSync;
}): Promise<IntervalsPublishWorkoutResult> {
  try {
    await input.saveIntervalsWorkoutSync(
      buildIntervalsWorkoutSyncInput({
        plannedWorkout: input.plannedWorkout,
        intervalsEventId: input.intervalsEventId,
        syncStatus: "synced",
        lastSyncedAt: input.lastSyncedAt,
        lastError: null,
      }),
    );

    return buildResult({
      plannedWorkoutId: input.plannedWorkout.id,
      title: input.plannedWorkout.title,
      workoutDate: input.plannedWorkout.workout_date,
      ok: true,
      syncStatus: "synced",
      message: "Published to Intervals.icu.",
      intervalsEventId: input.intervalsEventId,
    });
  } catch (error) {
    return buildResult({
      plannedWorkoutId: input.plannedWorkout.id,
      title: input.plannedWorkout.title,
      workoutDate: input.plannedWorkout.workout_date,
      ok: false,
      syncStatus: "failed",
      message: `Published to Intervals.icu, but local sync status could not be saved: ${getErrorMessage(error)}`,
      intervalsEventId: input.intervalsEventId,
    });
  }
}

function buildSummaryMessage(results: IntervalsPublishWorkoutResult[]): string {
  const successCount = results.filter((result) => result.ok).length;
  const failedCount = results.length - successCount;
  const successText = `${successCount} workout${successCount === 1 ? "" : "s"}`;
  const failedText = `${failedCount} workout${failedCount === 1 ? "" : "s"}`;

  if (successCount > 0 && failedCount > 0) {
    return `Published ${successText} to Intervals.icu. ${failedText} failed.`;
  }

  if (successCount > 0) {
    return `Published ${successText} to Intervals.icu.`;
  }

  return `No workouts were published to Intervals.icu. ${failedText} failed.`;
}

export async function publishIntervalsWorkoutsForPlan(
  input: PublishIntervalsWorkoutsForPlanInput,
  dependencies: PublishIntervalsWorkoutsDependencies,
): Promise<IntervalsBulkPublishWorkoutsResponse> {
  const upsertCalendarEvents =
    dependencies.bulkUpsertCalendarEvents ?? bulkUpsertCalendarEvents;
  const saveWorkoutSync = dependencies.saveIntervalsWorkoutSync;
  const now = dependencies.now ?? (() => new Date());
  const todayDateText = input.todayDateText ?? getTodayDateText();
  const workoutById = new Map(
    input.plannedWorkouts.map((workout) => [workout.id, workout]),
  );
  const resultsByWorkoutId = new Map<string, IntervalsPublishWorkoutResult>();
  const preparedPayloads: PreparedWorkoutPayload[] = [];

  for (const plannedWorkoutId of input.plannedWorkoutIds) {
    const plannedWorkout = workoutById.get(plannedWorkoutId);

    if (!plannedWorkout) {
      resultsByWorkoutId.set(
        plannedWorkoutId,
        buildResult({
          plannedWorkoutId,
          title: null,
          workoutDate: null,
          ok: false,
          syncStatus: "failed",
          message: "Could not find this planned workout.",
          intervalsEventId: null,
        }),
      );
      continue;
    }

    const publishBlocker = getPublishBlocker(
      plannedWorkout,
      input.trainingPlanId,
      todayDateText,
    );

    if (publishBlocker) {
      resultsByWorkoutId.set(
        plannedWorkoutId,
        await saveFailedResult(plannedWorkout, publishBlocker, {
          saveIntervalsWorkoutSync: saveWorkoutSync,
        }),
      );
      continue;
    }

    try {
      preparedPayloads.push({
        plannedWorkout,
        payload: buildIntervalsCalendarEventPayload(plannedWorkout),
      });
    } catch (error) {
      resultsByWorkoutId.set(
        plannedWorkoutId,
        await saveFailedResult(plannedWorkout, getErrorMessage(error), {
          saveIntervalsWorkoutSync: saveWorkoutSync,
        }),
      );
    }
  }

  if (preparedPayloads.length > 0) {
    try {
      const events = await upsertCalendarEvents(
        preparedPayloads.map((item) => item.payload),
      );
      const lastSyncedAt = now().toISOString();

      for (let index = 0; index < preparedPayloads.length; index += 1) {
        const preparedPayload = preparedPayloads[index];
        const intervalsEventId = getIntervalsEventIdForWorkout(
          events,
          preparedPayload.plannedWorkout.id,
          index,
        );

        resultsByWorkoutId.set(
          preparedPayload.plannedWorkout.id,
          await saveSyncedResult({
            plannedWorkout: preparedPayload.plannedWorkout,
            intervalsEventId,
            lastSyncedAt,
            saveIntervalsWorkoutSync: saveWorkoutSync,
          }),
        );
      }
    } catch (error) {
      const errorMessage = `Could not publish to Intervals.icu: ${getErrorMessage(error)}`;

      for (const preparedPayload of preparedPayloads) {
        resultsByWorkoutId.set(
          preparedPayload.plannedWorkout.id,
          await saveFailedResult(preparedPayload.plannedWorkout, errorMessage, {
            saveIntervalsWorkoutSync: saveWorkoutSync,
          }),
        );
      }
    }
  }

  const results = input.plannedWorkoutIds.map(
    (plannedWorkoutId) =>
      resultsByWorkoutId.get(plannedWorkoutId) ??
      buildResult({
        plannedWorkoutId,
        title: null,
        workoutDate: null,
        ok: false,
        syncStatus: "failed",
        message: "Could not determine the Intervals.icu publish result.",
        intervalsEventId: null,
      }),
  );

  return {
    ok: results.length > 0 && results.every((result) => result.ok),
    message: buildSummaryMessage(results),
    results,
  };
}
