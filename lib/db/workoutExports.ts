import { getSupabaseClient } from "./supabaseClient.ts";
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
): Promise<WorkoutExport> {
  assertSafeWorkoutExportInput(workoutExport);

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("workout_exports")
    .insert(workoutExport)
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
): Promise<WorkoutExport[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("workout_exports")
    .select("*")
    .eq("training_plan_id", trainingPlanId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WorkoutExport[];
}

export async function fetchWorkoutExportsForPlannedWorkout(
  plannedWorkoutId: string,
): Promise<WorkoutExport[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("workout_exports")
    .select("*")
    .eq("planned_workout_id", plannedWorkoutId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WorkoutExport[];
}

export async function markSyncedGarminWorkoutExportsStale(
  plannedWorkoutIds: string[],
): Promise<WorkoutExport[]> {
  if (plannedWorkoutIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("workout_exports")
    .update({
      sync_status: "stale" satisfies WorkoutExportSyncStatus,
      last_error: null,
    })
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
): Promise<WorkoutExport[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("workout_exports")
    .update({
      sync_status: "deleted" satisfies WorkoutExportSyncStatus,
      last_error: null,
    })
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
): Promise<WorkoutExport> {
  assertSafeWorkoutExportUpdateInput(workoutExport);

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("workout_exports")
    .update({
      sync_status: workoutExport.sync_status,
      last_synced_at: workoutExport.last_synced_at,
      last_error: workoutExport.last_error,
      warnings: workoutExport.warnings,
      payload_snapshot: workoutExport.payload_snapshot,
    })
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
