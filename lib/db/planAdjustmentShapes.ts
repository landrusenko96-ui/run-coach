import { buildStructuredWorkout } from "../training/structuredWorkout.ts";
import type {
  PlanAdjustment,
  PlanAdjustmentDecision,
  PlannedWorkout,
} from "@/types/training";

export type SavePlanAdjustmentInput = Omit<
  PlanAdjustment,
  "id" | "user_id" | "created_at"
>;

export type BuildSavePlanAdjustmentInputOptions = {
  profileId: string;
  raceGoalId: string;
  trainingPlanId: string;
  loggedWorkoutId: string;
  workoutEvaluationId: string;
  decision: PlanAdjustmentDecision;
};

export type PlannedWorkoutAdjustmentUpdate = Pick<
  PlannedWorkout,
  | "id"
  | "workout_type"
  | "title"
  | "description"
  | "distance_km"
  | "duration_min"
  | "target_pace_min_sec_per_km"
  | "target_pace_max_sec_per_km"
  | "target_hr_zone"
  | "purpose"
  | "instructions"
  | "structured_workout"
>;

export function buildSavePlanAdjustmentInput(
  options: BuildSavePlanAdjustmentInputOptions,
): SavePlanAdjustmentInput {
  return {
    profile_id: options.profileId,
    race_goal_id: options.raceGoalId,
    training_plan_id: options.trainingPlanId,
    logged_workout_id: options.loggedWorkoutId,
    workout_evaluation_id: options.workoutEvaluationId,
    adjustment_type: options.decision.adjustment_type,
    reason: options.decision.reason,
    explanation: options.decision.explanation,
    affected_workout_ids: options.decision.affected_workout_ids,
    before_snapshot: options.decision.before_snapshot,
    after_snapshot: options.decision.after_snapshot,
  };
}

export function buildPlannedWorkoutAdjustmentUpdate(
  workout: PlannedWorkout,
): PlannedWorkoutAdjustmentUpdate {
  return {
    id: workout.id,
    workout_type: workout.workout_type,
    title: workout.title,
    description: workout.description,
    distance_km: workout.distance_km,
    duration_min: workout.duration_min,
    target_pace_min_sec_per_km: workout.target_pace_min_sec_per_km,
    target_pace_max_sec_per_km: workout.target_pace_max_sec_per_km,
    target_hr_zone: workout.target_hr_zone,
    purpose: workout.purpose,
    instructions: workout.instructions,
    structured_workout: buildStructuredWorkout(workout),
  };
}
