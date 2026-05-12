import type { DeleteTrainingPlanResult } from "../db/trainingPlans.ts";
import {
  bulkDeleteCalendarEvents,
  type IntervalsCalendarEventDeleteInput,
} from "./client.ts";
import { getFutureIntervalsSyncDeleteCandidates } from "./syncLifecycle.ts";
import type {
  IntervalsWorkoutSync,
  PlannedWorkout,
} from "../../types/training.ts";

export type DeleteTrainingPlanWithIntervalsCleanupInput = {
  trainingPlanId: string;
  todayDateText?: string;
};

export type DeleteTrainingPlanWithIntervalsCleanupResult =
  DeleteTrainingPlanResult & {
    intervals_delete_attempt_count: number;
    intervals_deleted_event_count: number;
  };

export type DeleteTrainingPlanWithIntervalsCleanupDependencies = {
  fetchPlannedWorkouts: (trainingPlanId: string) => Promise<PlannedWorkout[]>;
  fetchIntervalsWorkoutSyncsForTrainingPlan: (
    trainingPlanId: string,
  ) => Promise<IntervalsWorkoutSync[]>;
  markIntervalsWorkoutSyncsFailedByIds: (
    syncIds: string[],
    lastError: string,
  ) => Promise<IntervalsWorkoutSync[]>;
  deleteTrainingPlanAndRelatedData: (
    trainingPlanId: string,
  ) => Promise<DeleteTrainingPlanResult>;
  bulkDeleteCalendarEvents?: (
    events: IntervalsCalendarEventDeleteInput[],
  ) => Promise<number>;
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

export async function deleteTrainingPlanWithIntervalsCleanup(
  input: DeleteTrainingPlanWithIntervalsCleanupInput,
  dependencies: DeleteTrainingPlanWithIntervalsCleanupDependencies,
): Promise<DeleteTrainingPlanWithIntervalsCleanupResult> {
  const plannedWorkouts = await dependencies.fetchPlannedWorkouts(
    input.trainingPlanId,
  );
  const syncs = await dependencies.fetchIntervalsWorkoutSyncsForTrainingPlan(
    input.trainingPlanId,
  );
  const todayDateText = input.todayDateText ?? getTodayDateText();
  const deleteCandidates = getFutureIntervalsSyncDeleteCandidates({
    syncs,
    plannedWorkouts,
    todayDateText,
  });
  let intervalsDeletedEventCount = 0;

  if (deleteCandidates.length > 0) {
    const deleteInputs = deleteCandidates.map((candidate) => ({
      external_id: candidate.externalId,
    }));

    try {
      intervalsDeletedEventCount = await (
        dependencies.bulkDeleteCalendarEvents ?? bulkDeleteCalendarEvents
      )(deleteInputs);
    } catch (error) {
      const deleteErrorMessage = `Could not delete future Intervals.icu events before deleting the plan: ${getErrorMessage(error)}`;

      try {
        await dependencies.markIntervalsWorkoutSyncsFailedByIds(
          deleteCandidates.map((candidate) => candidate.syncId),
          deleteErrorMessage,
        );
      } catch (markError) {
        throw new Error(
          `${deleteErrorMessage} Local plan was not deleted. Also could not mark local sync rows failed: ${getErrorMessage(markError)}`,
        );
      }

      throw new Error(
        `${deleteErrorMessage} Local plan was not deleted. The affected sync rows were marked failed so cleanup can be retried.`,
      );
    }
  }

  const deleteResult = await dependencies.deleteTrainingPlanAndRelatedData(
    input.trainingPlanId,
  );

  return {
    ...deleteResult,
    intervals_delete_attempt_count: deleteCandidates.length,
    intervals_deleted_event_count: intervalsDeletedEventCount,
  };
}
