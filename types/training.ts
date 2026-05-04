export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type WorkoutType =
  | "easy"
  | "long_run"
  | "tempo"
  | "interval"
  | "rest"
  | "cross_training";

export type WorkoutIntensity = "rest" | "easy" | "moderate" | "hard";

export type WorkoutResult = "completed" | "partial" | "missed";

export type EvaluationStatus = "on_track" | "too_easy" | "too_hard" | "missed";

export type AdjustmentType =
  | "keep_plan"
  | "reduce_volume"
  | "reduce_intensity"
  | "add_recovery"
  | "move_workout";

export type RunnerProfile = {
  id: string;
  displayName: string;
  experienceLevel: ExperienceLevel;
  currentWeeklyMileageKm: number;
  longestRecentRunKm: number;
  preferredTrainingDays: string[];
  injuryNotes?: string;
  createdAt: string;
  updatedAt: string;
};

export type RaceGoal = {
  id: string;
  runnerProfileId: string;
  raceName: string;
  raceDate: string;
  distanceKm: number;
  targetFinishTimeMinutes?: number;
  priority: "finish" | "personal_best" | "specific_time";
  createdAt: string;
  updatedAt: string;
};

export type PlannedWorkout = {
  id: string;
  raceGoalId: string;
  date: string;
  type: WorkoutType;
  title: string;
  intensity: WorkoutIntensity;
  plannedDistanceKm?: number;
  plannedDurationMinutes?: number;
  notes?: string;
};

export type LoggedWorkout = {
  id: string;
  runnerProfileId: string;
  plannedWorkoutId?: string;
  date: string;
  result: WorkoutResult;
  distanceKm?: number;
  durationMinutes?: number;
  perceivedEffort: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  notes?: string;
};

export type WorkoutEvaluation = {
  id: string;
  loggedWorkoutId: string;
  status: EvaluationStatus;
  score: number;
  reason: string;
  createdAt: string;
};

export type PlanAdjustment = {
  id: string;
  raceGoalId: string;
  adjustmentType: AdjustmentType;
  affectedWorkoutIds: string[];
  reason: string;
  createdAt: string;
};
