import type {
  LoggedWorkout,
  PlanAdjustment,
  PlannedWorkout,
  WorkoutEvaluation,
} from "@/types/training";

export function suggestPlanAdjustment(
  _plannedWorkouts: PlannedWorkout[],
  _loggedWorkouts: LoggedWorkout[],
  _latestEvaluation: WorkoutEvaluation,
): PlanAdjustment {
  throw new Error("Plan adjustment is not implemented yet.");
}
