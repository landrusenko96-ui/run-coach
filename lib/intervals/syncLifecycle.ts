import type {
  IntervalsWorkoutSync,
  PlannedWorkout,
} from "../../types/training.ts";

export type IntervalsSyncDeleteCandidate = {
  syncId: string;
  externalId: string;
  plannedWorkoutId: string;
};

export function getSyncsToMarkNeedsResync(
  syncs: IntervalsWorkoutSync[],
  plannedWorkoutIds: string[],
): IntervalsWorkoutSync[] {
  const plannedWorkoutIdSet = new Set(plannedWorkoutIds);

  return syncs.filter(
    (sync) =>
      plannedWorkoutIdSet.has(sync.planned_workout_id) &&
      sync.sync_status === "synced",
  );
}

export function getFutureIntervalsSyncDeleteCandidates(input: {
  syncs: IntervalsWorkoutSync[];
  plannedWorkouts: Pick<PlannedWorkout, "id" | "workout_date">[];
  todayDateText: string;
}): IntervalsSyncDeleteCandidate[] {
  const workoutDateById = new Map(
    input.plannedWorkouts.map((workout) => [workout.id, workout.workout_date]),
  );

  return input.syncs
    .filter(
      (sync) =>
        sync.sync_status === "synced" || sync.sync_status === "needs_resync",
    )
    .filter((sync) => {
      const workoutDate = workoutDateById.get(sync.planned_workout_id);

      return Boolean(workoutDate && workoutDate >= input.todayDateText);
    })
    .map((sync) => ({
      syncId: sync.id,
      externalId: sync.intervals_external_id,
      plannedWorkoutId: sync.planned_workout_id,
    }));
}
