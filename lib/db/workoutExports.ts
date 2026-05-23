import {
  getAuthenticatedUserId,
  getDbClient,
  type UserScopedDbOptions,
} from "./supabaseClient.ts";
import { garminExportStaleEligibleStatuses } from "../garminBridge/exportLifecycle.ts";
import {
  assertSafeWorkoutExportInput,
  assertSafeWorkoutExportUpdateInput,
  type SaveWorkoutExportInput,
  type UpdateWorkoutExportAfterGarminDeleteInput,
} from "./workoutExportShapes.ts";
import type { WorkoutExport, WorkoutExportSyncStatus } from "../../types/training.ts";

export { assertSafeWorkoutExportInput };
export type { SaveWorkoutExportInput };
export type { UpdateWorkoutExportAfterGarminDeleteInput };

export async function saveWorkoutExport(
  workoutExport: SaveWorkoutExportInput,
  options?: UserScopedDbOptions,
): Promise<WorkoutExport> {
  assertSafeWorkoutExportInput(workoutExport);

  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("workout_exports")
    .insert({
      ...workoutExport,
      user_id: userId,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved workout export record.");
  }

  return data as WorkoutExport;
}

export async function fetchWorkoutExportsForTrainingPlan(
  trainingPlanId: string,
  options?: UserScopedDbOptions,
): Promise<WorkoutExport[]> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("workout_exports")
    .select("*")
    .eq("user_id", userId)
    .eq("training_plan_id", trainingPlanId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WorkoutExport[];
}

export async function fetchWorkoutExportsForPlannedWorkout(
  plannedWorkoutId: string,
  options?: UserScopedDbOptions,
): Promise<WorkoutExport[]> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("workout_exports")
    .select("*")
    .eq("user_id", userId)
    .eq("planned_workout_id", plannedWorkoutId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WorkoutExport[];
}

export async function markSyncedGarminWorkoutExportsStale(
  plannedWorkoutIds: string[],
  options?: UserScopedDbOptions,
): Promise<WorkoutExport[]> {
  if (plannedWorkoutIds.length === 0) {
    return [];
  }

  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("workout_exports")
    .update({
      sync_status: "stale" satisfies WorkoutExportSyncStatus,
      last_error: null,
    })
    .eq("user_id", userId)
    .eq("export_provider", "garmin_direct")
    .in("planned_workout_id", plannedWorkoutIds)
    .in("sync_status", [...garminExportStaleEligibleStatuses])
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WorkoutExport[];
}

export async function markGarminWorkoutExportsDeletedForTrainingPlan(
  trainingPlanId: string,
  options?: UserScopedDbOptions,
): Promise<WorkoutExport[]> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("workout_exports")
    .update({
      sync_status: "deleted" satisfies WorkoutExportSyncStatus,
      last_error: null,
    })
    .eq("user_id", userId)
    .eq("training_plan_id", trainingPlanId)
    .eq("export_provider", "garmin_direct")
    .neq("sync_status", "deleted")
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WorkoutExport[];
}

export async function updateGarminWorkoutExportAfterDelete(
  workoutExport: UpdateWorkoutExportAfterGarminDeleteInput,
  options?: UserScopedDbOptions,
): Promise<WorkoutExport> {
  assertSafeWorkoutExportUpdateInput(workoutExport);

  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("workout_exports")
    .update({
      sync_status: workoutExport.sync_status,
      last_synced_at: workoutExport.last_synced_at,
      last_error: workoutExport.last_error,
      warnings: workoutExport.warnings,
      payload_snapshot: workoutExport.payload_snapshot,
    })
    .eq("user_id", userId)
    .eq("id", workoutExport.id)
    .eq("export_provider", "garmin_direct")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the updated Garmin export record.");
  }

  return data as WorkoutExport;
}
