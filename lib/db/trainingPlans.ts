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

export type TrainingPlanDeletePreview = {
  plannedWorkoutCount: number;
  workoutEvaluationCount: number;
  linkedLoggedWorkoutCount: number;
};

export type DeleteTrainingPlanResult = {
  deleted_training_plan_id: string;
  deleted_plan_name: string;
  was_active: boolean;
  deleted_planned_workout_count: number;
  deleted_workout_evaluation_count: number;
  unlinked_logged_workout_count: number;
};

type IdRow = {
  id: string;
};

export async function fetchTrainingPlans(
  profileId: string,
): Promise<TrainingPlan[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("training_plans")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TrainingPlan[];
}

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

export async function activateTrainingPlan(
  trainingPlanId: string,
): Promise<TrainingPlan> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .rpc("activate_training_plan", {
      selected_training_plan_id: trainingPlanId,
    })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the activated training plan.");
  }

  return data as TrainingPlan;
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

export async function fetchTrainingPlanDeletePreview(
  trainingPlanId: string,
): Promise<TrainingPlanDeletePreview> {
  const supabase = getSupabaseClient();

  const { data: plannedWorkoutRows, error: plannedWorkoutError } =
    await supabase
      .from("planned_workouts")
      .select("id")
      .eq("training_plan_id", trainingPlanId);

  if (plannedWorkoutError) {
    throw new Error(plannedWorkoutError.message);
  }

  const plannedWorkoutIds = ((plannedWorkoutRows ?? []) as IdRow[]).map(
    (plannedWorkout) => plannedWorkout.id,
  );
  const evaluationIds = new Set<string>();
  const loggedWorkoutIds = new Set<string>();

  const { data: planEvaluationRows, error: planEvaluationError } =
    await supabase
      .from("workout_evaluations")
      .select("id")
      .eq("training_plan_id", trainingPlanId);

  if (planEvaluationError) {
    throw new Error(planEvaluationError.message);
  }

  for (const evaluation of (planEvaluationRows ?? []) as IdRow[]) {
    evaluationIds.add(evaluation.id);
  }

  if (plannedWorkoutIds.length > 0) {
    const { data: workoutEvaluationRows, error: workoutEvaluationError } =
      await supabase
        .from("workout_evaluations")
        .select("id")
        .in("planned_workout_id", plannedWorkoutIds);

    if (workoutEvaluationError) {
      throw new Error(workoutEvaluationError.message);
    }

    for (const evaluation of (workoutEvaluationRows ?? []) as IdRow[]) {
      evaluationIds.add(evaluation.id);
    }
  }

  const { data: planLoggedWorkoutRows, error: planLoggedWorkoutError } =
    await supabase
      .from("logged_workouts")
      .select("id")
      .eq("training_plan_id", trainingPlanId);

  if (planLoggedWorkoutError) {
    throw new Error(planLoggedWorkoutError.message);
  }

  for (const loggedWorkout of (planLoggedWorkoutRows ?? []) as IdRow[]) {
    loggedWorkoutIds.add(loggedWorkout.id);
  }

  if (plannedWorkoutIds.length > 0) {
    const { data: plannedLoggedWorkoutRows, error: plannedLoggedWorkoutError } =
      await supabase
        .from("logged_workouts")
        .select("id")
        .in("planned_workout_id", plannedWorkoutIds);

    if (plannedLoggedWorkoutError) {
      throw new Error(plannedLoggedWorkoutError.message);
    }

    for (const loggedWorkout of (plannedLoggedWorkoutRows ?? []) as IdRow[]) {
      loggedWorkoutIds.add(loggedWorkout.id);
    }
  }

  const linkedLoggedWorkoutIds = Array.from(loggedWorkoutIds);

  if (linkedLoggedWorkoutIds.length > 0) {
    const {
      data: loggedWorkoutEvaluationRows,
      error: loggedWorkoutEvaluationError,
    } = await supabase
      .from("workout_evaluations")
      .select("id")
      .in("logged_workout_id", linkedLoggedWorkoutIds);

    if (loggedWorkoutEvaluationError) {
      throw new Error(loggedWorkoutEvaluationError.message);
    }

    for (const evaluation of (loggedWorkoutEvaluationRows ?? []) as IdRow[]) {
      evaluationIds.add(evaluation.id);
    }
  }

  return {
    plannedWorkoutCount: plannedWorkoutIds.length,
    workoutEvaluationCount: evaluationIds.size,
    linkedLoggedWorkoutCount: loggedWorkoutIds.size,
  };
}

export async function deleteTrainingPlanAndRelatedData(
  trainingPlanId: string,
): Promise<DeleteTrainingPlanResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .rpc("delete_training_plan_and_related_data", {
      target_training_plan_id: trainingPlanId,
    })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the deleted training plan summary.");
  }

  return data as DeleteTrainingPlanResult;
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
