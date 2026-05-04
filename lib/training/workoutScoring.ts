import type {
  LoggedWorkout,
  PlannedWorkout,
  WorkoutEvaluation,
} from "@/types/training";

export function scoreWorkout(
  _loggedWorkout: LoggedWorkout,
  _plannedWorkout?: PlannedWorkout,
): WorkoutEvaluation {
  throw new Error("Workout scoring is not implemented yet.");
}
