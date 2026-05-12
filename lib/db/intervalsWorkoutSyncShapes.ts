import type {
  IntervalsWorkoutSync,
  IntervalsWorkoutSyncStatus,
  PlannedWorkout,
} from "../../types/training.ts";

export type SaveIntervalsWorkoutSyncInput = Omit<
  IntervalsWorkoutSync,
  "id" | "created_at" | "updated_at"
>;

export type BuildIntervalsWorkoutSyncInputOptions = {
  plannedWorkout: Pick<PlannedWorkout, "id" | "training_plan_id" | "profile_id">;
  intervalsEventId: number | null;
  syncStatus: IntervalsWorkoutSyncStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export function buildIntervalsWorkoutSyncInput(
  options: BuildIntervalsWorkoutSyncInputOptions,
): SaveIntervalsWorkoutSyncInput {
  return {
    planned_workout_id: options.plannedWorkout.id,
    training_plan_id: options.plannedWorkout.training_plan_id,
    profile_id: options.plannedWorkout.profile_id,
    intervals_external_id: options.plannedWorkout.id,
    intervals_event_id: options.intervalsEventId,
    sync_status: options.syncStatus,
    last_synced_at: options.lastSyncedAt,
    last_error: options.lastError,
  };
}
