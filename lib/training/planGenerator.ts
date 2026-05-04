import type {
  PlannedWorkout,
  RaceGoal,
  RunnerProfile,
} from "@/types/training";

export function generateTrainingPlan(
  _runnerProfile: RunnerProfile,
  _raceGoal: RaceGoal,
): PlannedWorkout[] {
  throw new Error("Training plan generation is not implemented yet.");
}
