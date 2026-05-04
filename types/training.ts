export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type Sex = "female" | "male" | "non_binary" | "prefer_not_to_say";

export type TrainingDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type TerrainAvailable =
  | "flat"
  | "hills"
  | "track"
  | "treadmill"
  | "trails"
  | "downhill";

export type TrainingAggressiveness =
  | "conservative"
  | "balanced"
  | "aggressive";

export type RaceDistance = "half_marathon" | "marathon";

export type TargetPriority = "finish" | "personal_best" | "aggressive";

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

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  birth_year: number | null;
  sex: Sex | null;
  height_cm: number | null;
  weight_kg: number | null;
  current_weekly_mileage_km: number | null;
  longest_recent_run_km: number | null;
  easy_pace_sec_per_km: number | null;
  threshold_pace_sec_per_km: number | null;
  max_heart_rate: number | null;
  resting_heart_rate: number | null;
  available_training_days: TrainingDay[];
  preferred_long_run_day: TrainingDay | null;
  terrain_available: TerrainAvailable[];
  training_aggressiveness: TrainingAggressiveness;
  injury_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RaceGoal = {
  id: string;
  profile_id: string;
  race_name: string;
  race_date: string;
  distance: RaceDistance;
  target_finish_time_sec: number | null;
  target_priority: TargetPriority;
  course_elevation_notes: string | null;
  expected_weather_notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RunnerProfile = Profile;

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
