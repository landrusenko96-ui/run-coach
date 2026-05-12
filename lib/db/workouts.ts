import { getSupabaseClient } from "@/lib/db/supabaseClient";
import type {
  LoggedWorkout,
  PlannedWorkout,
  WorkoutEvaluation,
} from "@/types/training";

export type SaveLoggedWorkoutInput = Omit<
  LoggedWorkout,
  "id" | "created_at" | "updated_at"
>;

export type SaveWorkoutEvaluationInput = Omit<
  WorkoutEvaluation,
  "id" | "created_at" | "updated_at"
>;

export async function fetchLoggedWorkoutsForTrainingPlan(
  trainingPlanId: string,
): Promise<LoggedWorkout[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("logged_workouts")
    .select("*")
    .eq("training_plan_id", trainingPlanId)
    .order("workout_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LoggedWorkout[];
}

export async function fetchWorkoutEvaluationsForTrainingPlan(
  trainingPlanId: string,
): Promise<WorkoutEvaluation[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("workout_evaluations")
    .select("*")
    .eq("training_plan_id", trainingPlanId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WorkoutEvaluation[];
}

export async function fetchLoggedWorkoutsForPlannedWorkout(
  plannedWorkoutId: string,
): Promise<LoggedWorkout[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("logged_workouts")
    .select("*")
    .eq("planned_workout_id", plannedWorkoutId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LoggedWorkout[];
}

export async function fetchPlannedWorkoutById(
  plannedWorkoutId: string,
): Promise<PlannedWorkout> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("planned_workouts")
    .select("*")
    .eq("id", plannedWorkoutId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Could not find the linked planned workout.");
  }

  return data as PlannedWorkout;
}

export async function fetchPlannedWorkoutsByIds(
  plannedWorkoutIds: string[],
): Promise<PlannedWorkout[]> {
  if (plannedWorkoutIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("planned_workouts")
    .select("*")
    .in("id", plannedWorkoutIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PlannedWorkout[];
}

export async function saveLoggedWorkout(
  loggedWorkout: SaveLoggedWorkoutInput,
): Promise<LoggedWorkout> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("logged_workouts")
    .insert(loggedWorkout)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved workout log.");
  }

  return data as LoggedWorkout;
}

export async function saveWorkoutEvaluation(
  evaluation: SaveWorkoutEvaluationInput,
): Promise<WorkoutEvaluation> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("workout_evaluations")
    .insert(evaluation)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved workout evaluation.");
  }

  return data as WorkoutEvaluation;
}

export async function deleteLoggedWorkout(loggedWorkoutId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("logged_workouts")
    .delete()
    .eq("id", loggedWorkoutId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not delete a matching workout log.");
  }
}

export async function deleteWorkoutEvaluationsForLoggedWorkout(
  loggedWorkoutId: string,
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("workout_evaluations")
    .delete()
    .eq("logged_workout_id", loggedWorkoutId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markPlannedWorkoutCompleted(
  plannedWorkoutId: string,
): Promise<PlannedWorkout> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("planned_workouts")
    .update({ status: "completed" })
    .eq("id", plannedWorkoutId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the completed planned workout.");
  }

  return data as PlannedWorkout;
}


export async function markPlannedWorkoutPlanned(
  plannedWorkoutId: string,
): Promise<PlannedWorkout> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("planned_workouts")
    .update({ status: "planned" })
    .eq("id", plannedWorkoutId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the reset planned workout.");
  }

  return data as PlannedWorkout;
}
