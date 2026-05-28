import {
  getAuthenticatedUserId,
  getDbClient,
  type UserScopedDbOptions,
} from "./supabaseClient.ts";
import type {
  LoggedWorkout,
  PlannedWorkout,
  WorkoutEvaluation,
} from "@/types/training";

export type SaveLoggedWorkoutInput = Omit<
  LoggedWorkout,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type SaveWorkoutEvaluationInput = Omit<
  WorkoutEvaluation,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export async function fetchLoggedWorkoutsForTrainingPlan(
  trainingPlanId: string,
  options?: UserScopedDbOptions,
): Promise<LoggedWorkout[]> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("logged_workouts")
    .select("*")
    .eq("user_id", userId)
    .eq("training_plan_id", trainingPlanId)
    .order("workout_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LoggedWorkout[];
}

export async function fetchLoggedWorkoutsForProfileDateRange(
  input: {
    profileId: string;
    startDate: string;
    endDate: string;
  },
  options?: UserScopedDbOptions,
): Promise<LoggedWorkout[]> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("logged_workouts")
    .select("*")
    .eq("user_id", userId)
    .eq("profile_id", input.profileId)
    .gte("workout_date", input.startDate)
    .lte("workout_date", input.endDate)
    .order("workout_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LoggedWorkout[];
}

export async function fetchWorkoutEvaluationsForTrainingPlan(
  trainingPlanId: string,
  options?: UserScopedDbOptions,
): Promise<WorkoutEvaluation[]> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("workout_evaluations")
    .select("*")
    .eq("user_id", userId)
    .eq("training_plan_id", trainingPlanId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WorkoutEvaluation[];
}

export async function fetchLoggedWorkoutsForPlannedWorkout(
  plannedWorkoutId: string,
  options?: UserScopedDbOptions,
): Promise<LoggedWorkout[]> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("logged_workouts")
    .select("*")
    .eq("user_id", userId)
    .eq("planned_workout_id", plannedWorkoutId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LoggedWorkout[];
}

export async function fetchPlannedWorkoutById(
  plannedWorkoutId: string,
  options?: UserScopedDbOptions,
): Promise<PlannedWorkout> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("planned_workouts")
    .select("*")
    .eq("user_id", userId)
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
  options?: UserScopedDbOptions,
): Promise<PlannedWorkout[]> {
  if (plannedWorkoutIds.length === 0) {
    return [];
  }

  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("planned_workouts")
    .select("*")
    .eq("user_id", userId)
    .in("id", plannedWorkoutIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PlannedWorkout[];
}

export async function saveLoggedWorkout(
  loggedWorkout: SaveLoggedWorkoutInput,
  options?: UserScopedDbOptions,
): Promise<LoggedWorkout> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("logged_workouts")
    .insert({
      ...loggedWorkout,
      user_id: userId,
    })
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
  options?: UserScopedDbOptions,
): Promise<WorkoutEvaluation> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("workout_evaluations")
    .insert({
      ...evaluation,
      user_id: userId,
    })
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

export async function deleteLoggedWorkout(
  loggedWorkoutId: string,
  options?: UserScopedDbOptions,
): Promise<void> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("logged_workouts")
    .delete()
    .eq("user_id", userId)
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
  options?: UserScopedDbOptions,
): Promise<void> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { error } = await supabase
    .from("workout_evaluations")
    .delete()
    .eq("user_id", userId)
    .eq("logged_workout_id", loggedWorkoutId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markPlannedWorkoutCompleted(
  plannedWorkoutId: string,
  options?: UserScopedDbOptions,
): Promise<PlannedWorkout> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("planned_workouts")
    .update({ status: "completed" })
    .eq("user_id", userId)
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
  options?: UserScopedDbOptions,
): Promise<PlannedWorkout> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("planned_workouts")
    .update({ status: "planned" })
    .eq("user_id", userId)
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
