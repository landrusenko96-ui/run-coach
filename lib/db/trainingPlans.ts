import { getSupabaseClient } from "@/lib/db/supabaseClient";
import type { PlannedWorkout, TrainingPlan } from "@/types/training";

export type SaveTrainingPlanInput = Omit<
  TrainingPlan,
  "id" | "created_at" | "updated_at"
>;

export type SavePlannedWorkoutInput = Omit<
  PlannedWorkout,
  "id" | "created_at" | "updated_at"
>;

export type TrainingPlanWithWorkouts = {
  plan: TrainingPlan;
  workouts: PlannedWorkout[];
};

export async function fetchActiveTrainingPlan(
  profileId: string,
): Promise<TrainingPlan | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("training_plans")
    .select("*")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as TrainingPlan | null;
}

export async function fetchPlannedWorkouts(
  trainingPlanId: string,
): Promise<PlannedWorkout[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("planned_workouts")
    .select("*")
    .eq("training_plan_id", trainingPlanId)
    .order("workout_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PlannedWorkout[];
}

export async function fetchActiveTrainingPlanWithWorkouts(
  profileId: string,
): Promise<TrainingPlanWithWorkouts | null> {
  const plan = await fetchActiveTrainingPlan(profileId);

  if (!plan) {
    return null;
  }

  const workouts = await fetchPlannedWorkouts(plan.id);

  return {
    plan,
    workouts,
  };
}

export async function saveTrainingPlan(
  trainingPlan: SaveTrainingPlanInput,
): Promise<TrainingPlan> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("training_plans")
    .insert(trainingPlan)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved training plan.");
  }

  return data as TrainingPlan;
}

export async function archiveTrainingPlan(
  trainingPlanId: string,
): Promise<TrainingPlan> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("training_plans")
    .update({ status: "archived" })
    .eq("id", trainingPlanId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the archived training plan.");
  }

  return data as TrainingPlan;
}

export async function savePlannedWorkouts(
  plannedWorkouts: SavePlannedWorkoutInput[],
): Promise<PlannedWorkout[]> {
  if (plannedWorkouts.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("planned_workouts")
    .insert(plannedWorkouts)
    .select("*")
    .order("workout_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PlannedWorkout[];
}
