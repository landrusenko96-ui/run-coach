import type {
  LoggedWorkout,
  RaceGoal,
  RunnerProfile,
} from "@/types/training";

export function predictRaceFinishTimeMinutes(
  _runnerProfile: RunnerProfile,
  _raceGoal: RaceGoal,
  _loggedWorkouts: LoggedWorkout[],
): number | null {
  throw new Error("Race prediction is not implemented yet.");
}
