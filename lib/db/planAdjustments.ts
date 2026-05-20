import {
  buildPlannedWorkoutAdjustmentUpdate,
  type SavePlanAdjustmentInput,
} from "./planAdjustmentShapes.ts";
import { getSupabaseClient } from "./supabaseClient.ts";
import {
  buildPlannedWorkoutRollbackUpdate,
  type PlannedWorkoutRollbackUpdate,
} from "../training/planAdjustmentRollback.ts";
import type { PlanAdjustment, PlannedWorkout } from "@/types/training";

export type PlanAdjustmentDashboardSummary = {
  latestPlanAdjustment: PlanAdjustment | null;
  adjustmentCount: number;
};

export {
  buildPlannedWorkoutAdjustmentUpdate,
  buildSavePlanAdjustmentInput,
} from "./planAdjustmentShapes.ts";

export async function savePlanAdjustment(
  planAdjustment: SavePlanAdjustmentInput,
): Promise<PlanAdjustment> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("plan_adjustments")
    .insert(planAdjustment)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved plan adjustment.");
  }

  return data as PlanAdjustment;
}

export async function fetchRecentPlanAdjustmentsForTrainingPlan(
  trainingPlanId: string,
  limit = 10,
): Promise<PlanAdjustment[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("plan_adjustments")
    .select("*")
    .eq("training_plan_id", trainingPlanId)
    .neq("adjustment_type", "none")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PlanAdjustment[];
}

export async function fetchPlanAdjustmentDashboardSummary(
  trainingPlanId: string,
): Promise<PlanAdjustmentDashboardSummary> {
  const supabase = getSupabaseClient();

  const { data: latestAdjustmentData, error: latestAdjustmentError } =
    await supabase
      .from("plan_adjustments")
      .select("*")
      .eq("training_plan_id", trainingPlanId)
      .neq("adjustment_type", "none")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (latestAdjustmentError) {
    throw new Error(latestAdjustmentError.message);
  }

  const { count, error: countError } = await supabase
    .from("plan_adjustments")
    .select("id", { count: "exact", head: true })
    .eq("training_plan_id", trainingPlanId)
    .neq("adjustment_type", "none");

  if (countError) {
    throw new Error(countError.message);
  }

  return {
    latestPlanAdjustment: latestAdjustmentData as PlanAdjustment | null,
    adjustmentCount: count ?? 0,
  };
}

export async function fetchPlanAdjustmentsForLoggedWorkouts(
  loggedWorkoutIds: string[],
): Promise<PlanAdjustment[]> {
  const uniqueLoggedWorkoutIds = Array.from(new Set(loggedWorkoutIds)).filter(
    (loggedWorkoutId) => loggedWorkoutId.trim() !== "",
  );

  if (uniqueLoggedWorkoutIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("plan_adjustments")
    .select("*")
    .in("logged_workout_id", uniqueLoggedWorkoutIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PlanAdjustment[];
}

export async function fetchPlanAdjustmentsForLoggedWorkout(
  loggedWorkoutId: string,
): Promise<PlanAdjustment[]> {
  return fetchPlanAdjustmentsForLoggedWorkouts([loggedWorkoutId]);
}

export async function fetchPlanAdjustmentsAffectingWorkouts(input: {
  trainingPlanId: string;
  affectedWorkoutIds: string[];
}): Promise<PlanAdjustment[]> {
  const affectedWorkoutIds = Array.from(new Set(input.affectedWorkoutIds)).filter(
    (workoutId) => workoutId.trim() !== "",
  );

  if (affectedWorkoutIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("plan_adjustments")
    .select("*")
    .eq("training_plan_id", input.trainingPlanId)
    .overlaps("affected_workout_ids", affectedWorkoutIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PlanAdjustment[];
}

export async function deletePlanAdjustmentsForLoggedWorkout(
  loggedWorkoutId: string,
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("plan_adjustments")
    .delete()
    .eq("logged_workout_id", loggedWorkoutId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchFuturePlannedWorkouts(
  trainingPlanId: string,
  afterWorkoutDate: string,
): Promise<PlannedWorkout[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("planned_workouts")
    .select("*")
    .eq("training_plan_id", trainingPlanId)
    .gt("workout_date", afterWorkoutDate)
    .order("workout_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PlannedWorkout[];
}

export async function updateFuturePlannedWorkoutsForAdjustment(input: {
  updatedFuturePlannedWorkouts: PlannedWorkout[];
  affectedWorkoutIds: string[];
  loggedWorkoutDate: string;
}): Promise<PlannedWorkout[]> {
  if (input.affectedWorkoutIds.length === 0) {
    return [];
  }

  const affectedWorkoutIds = new Set(input.affectedWorkoutIds);
  const updateCandidates = input.updatedFuturePlannedWorkouts.filter(
    (workout) =>
      affectedWorkoutIds.has(workout.id) &&
      workout.status === "planned" &&
      workout.workout_date > input.loggedWorkoutDate,
  );

  if (updateCandidates.length !== affectedWorkoutIds.size) {
    throw new Error(
      "Plan adjustment tried to update a workout that is not an editable future planned workout.",
    );
  }

  const supabase = getSupabaseClient();
  const updatedWorkouts: PlannedWorkout[] = [];

  for (const workout of updateCandidates) {
    const { id: _id, ...workoutUpdate } =
      buildPlannedWorkoutAdjustmentUpdate(workout);
    const { data, error } = await supabase
      .from("planned_workouts")
      .update(workoutUpdate)
      .eq("id", workout.id)
      .eq("status", "planned")
      .gt("workout_date", input.loggedWorkoutDate)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error(
        "Supabase did not update an editable future planned workout.",
      );
    }

    updatedWorkouts.push(data as PlannedWorkout);
  }

  return updatedWorkouts;
}

export async function restoreFuturePlannedWorkoutsFromRollbackUpdates(input: {
  rollbackUpdates: PlannedWorkoutRollbackUpdate[];
  loggedWorkoutDate: string;
}): Promise<PlannedWorkout[]> {
  if (input.rollbackUpdates.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();
  const restoredWorkouts: PlannedWorkout[] = [];

  for (const rollbackUpdate of input.rollbackUpdates) {
    const plannedWorkoutUpdate =
      buildPlannedWorkoutRollbackUpdate(rollbackUpdate);
    const { data, error } = await supabase
      .from("planned_workouts")
      .update(plannedWorkoutUpdate)
      .eq("id", rollbackUpdate.id)
      .eq("status", "planned")
      .gt("workout_date", input.loggedWorkoutDate)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error(
        "Supabase did not restore an editable future planned workout.",
      );
    }

    restoredWorkouts.push(data as PlannedWorkout);
  }

  return restoredWorkouts;
}
