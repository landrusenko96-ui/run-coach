import { getSupabaseClient } from "./supabaseClient.ts";
import {
  buildIntervalsWorkoutSyncInput,
  type SaveIntervalsWorkoutSyncInput,
} from "./intervalsWorkoutSyncShapes.ts";
import type {
  IntervalsWorkoutSync,
  IntervalsWorkoutSyncStatus,
} from "../../types/training.ts";

export { buildIntervalsWorkoutSyncInput };

export async function saveIntervalsWorkoutSync(
  sync: SaveIntervalsWorkoutSyncInput,
): Promise<IntervalsWorkoutSync> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("intervals_workout_syncs")
    .upsert(sync, { onConflict: "planned_workout_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved Intervals.icu sync row.");
  }

  return data as IntervalsWorkoutSync;
}

export async function fetchIntervalsWorkoutSyncsForTrainingPlan(
  trainingPlanId: string,
): Promise<IntervalsWorkoutSync[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("intervals_workout_syncs")
    .select("*")
    .eq("training_plan_id", trainingPlanId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as IntervalsWorkoutSync[];
}

export async function markSyncedIntervalsWorkoutSyncsNeedsResync(
  plannedWorkoutIds: string[],
): Promise<IntervalsWorkoutSync[]> {
  if (plannedWorkoutIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("intervals_workout_syncs")
    .update({
      sync_status: "needs_resync" satisfies IntervalsWorkoutSyncStatus,
      last_error: null,
    })
    .in("planned_workout_id", plannedWorkoutIds)
    .eq("sync_status", "synced")
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as IntervalsWorkoutSync[];
}

export async function markIntervalsWorkoutSyncsFailedByIds(
  syncIds: string[],
  lastError: string,
): Promise<IntervalsWorkoutSync[]> {
  if (syncIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("intervals_workout_syncs")
    .update({
      sync_status: "failed" satisfies IntervalsWorkoutSyncStatus,
      last_error: lastError,
    })
    .in("id", syncIds)
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as IntervalsWorkoutSync[];
}
