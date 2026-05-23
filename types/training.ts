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

export type RunningDaysPerWeek = 2 | 3 | 4 | 5 | 6;

export type RaceDistance = "half_marathon" | "marathon";

export type TargetPriority = "finish" | "personal_best" | "aggressive";

export type WorkoutType =
  | "easy"
  | "long_run"
  | "tempo"
  | "interval"
  | "marathon_pace"
  | "recovery"
  | "rest"
  | "strength_optional"
  | "calibration"
  | "cross_training";

export type StructuredWorkout = {
  version: 1;
  sport: "Run";
  name: string;
  description?: string;
  exportSafe: boolean;
  exportWarnings: string[];
  steps: WorkoutStep[];
};

export type WorkoutStep = {
  id: string;
  type: "warmup" | "work" | "recovery" | "cooldown" | "rest";
  name: string;
  durationType: "time" | "distance" | "open";
  durationValue?: number;
  durationUnit?: "seconds" | "meters";
  targetType?: "pace" | "heart_rate" | "rpe" | "none";
  targetMin?: number;
  targetMax?: number;
  targetUnit?: "sec_per_km" | "bpm" | "zone" | "rpe";
  notes?: string;
  repeat?: {
    count: number;
    steps: WorkoutStep[];
  };
};

export type TrainingPlanStatus = "active" | "paused";

export type PlannedWorkoutStatus =
  | "planned"
  | "completed"
  | "missed"
  | "skipped";

export type LoggedWorkoutSource = "manual" | "strava";

export type LoggedWorkoutType = "run" | "treadmill_run";

export type WorkoutRiskLevel = "low" | "medium" | "high";

export type WorkoutIntensity = "rest" | "easy" | "moderate" | "hard";

export type AdjustmentType =
  | "none"
  | "reduce_next_intensity"
  | "add_recovery"
  | "shift_workout"
  | "update_training_paces"
  | "reduce_weekly_volume"
  | "protect_long_run_progression";

export type IntervalsApiKeyPlaceholder = "stored_in_environment_variable";

export type IntervalsWorkoutSyncStatus =
  | "not_synced"
  | "needs_resync"
  | "synced"
  | "failed"
  | "deleted";

export type WorkoutExportProvider = "intervals_icu" | "garmin_direct";

export type WorkoutExportMode =
  | "single_publish"
  | "bulk_publish"
  | "manual_update";

export type WorkoutExportSyncStatus =
  | "not_synced"
  | "synced"
  | "failed"
  | "stale"
  | "deleted"
  | "partial";

export type IntervalsPublishWorkoutResult = {
  plannedWorkoutId: string;
  title: string | null;
  workoutDate: string | null;
  ok: boolean;
  syncStatus: Extract<IntervalsWorkoutSyncStatus, "synced" | "failed">;
  message: string;
  intervalsEventId: number | null;
};

export type IntervalsBulkPublishWorkoutsResponse = {
  ok: boolean;
  message: string;
  results: IntervalsPublishWorkoutResult[];
};

export type GarminBulkPublishWindowDays = 7 | 14;

export type GarminBulkExportStatus =
  | WorkoutExportSyncStatus
  | "not_synced";

export type GarminBulkWorkoutAction =
  | "publish"
  | "skip_synced"
  | "needs_confirmation"
  | "invalid";

export type GarminBulkPreviewWorkout = {
  plannedWorkoutId: string;
  workoutDate: string;
  title: string;
  workoutType: WorkoutType;
  exportStatus: GarminBulkExportStatus;
  action: GarminBulkWorkoutAction;
  paceTargetCount: number;
  warnings: string[];
  previewOk: boolean;
  previewMessage: string;
};

export type GarminBulkPublishSummary = {
  publishedCount: number;
  skippedCount: number;
  failedCount: number;
  partialCount: number;
  readyCount: number;
  retryNeedsConfirmationCount: number;
  invalidCount: number;
};

export type GarminBulkPreviewWorkoutsResponse = {
  ok: boolean;
  message: string;
  trainingPlanId: string;
  windowDays: GarminBulkPublishWindowDays;
  summary: GarminBulkPublishSummary;
  workouts: GarminBulkPreviewWorkout[];
};

export type GarminBulkPublishWorkoutResult = GarminBulkPreviewWorkout & {
  ok: boolean;
  status: string;
  message: string;
  garminWorkoutId: string | null;
  exportRecord: WorkoutExport | null;
};

export type GarminBulkPublishWorkoutsResponse = {
  ok: boolean;
  message: string;
  trainingPlanId: string;
  windowDays: GarminBulkPublishWindowDays;
  summary: GarminBulkPublishSummary;
  results: GarminBulkPublishWorkoutResult[];
};

export type GarminBulkMaintenanceMode = "update_stale" | "delete_selected";

export type GarminBulkMaintenanceAction = "update" | "delete" | "skip";

export type GarminBulkMaintenanceWorkout = {
  plannedWorkoutId: string;
  workoutDate: string;
  title: string;
  workoutType: WorkoutType;
  currentStatus: GarminBulkExportStatus;
  garminWorkoutId: string;
  plannedAction: GarminBulkMaintenanceAction;
  warnings: string[];
};

export type GarminBulkMaintenanceSummary = {
  updatedCount: number;
  deletedCount: number;
  failedCount: number;
  partialCount: number;
  skippedCount: number;
  readyCount: number;
};

export type GarminBulkMaintenancePreviewResponse = {
  ok: boolean;
  message: string;
  trainingPlanId: string;
  mode: GarminBulkMaintenanceMode;
  windowDays: GarminBulkPublishWindowDays;
  summary: GarminBulkMaintenanceSummary;
  workouts: GarminBulkMaintenanceWorkout[];
};

export type GarminBulkMaintenanceResult = GarminBulkMaintenanceWorkout & {
  ok: boolean;
  status: string;
  message: string;
  resultGarminWorkoutId: string | null;
  exportRecord: WorkoutExport | null;
};

export type GarminBulkMaintenanceExecuteResponse = {
  ok: boolean;
  message: string;
  trainingPlanId: string;
  mode: GarminBulkMaintenanceMode;
  windowDays: GarminBulkPublishWindowDays;
  summary: GarminBulkMaintenanceSummary;
  results: GarminBulkMaintenanceResult[];
};

export type GarminPlanDeleteCleanupMode =
  | "app_only"
  | "attempt_future_delete";

export type GarminPlanDeletePreviewWorkout = {
  plannedWorkoutId: string;
  workoutDate: string;
  title: string;
  workoutType: WorkoutType;
  currentStatus: GarminBulkExportStatus;
  garminWorkoutId: string;
  warnings: string[];
};

export type Profile = {
  id: string;
  user_id: string;
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
  running_days_per_week: RunningDaysPerWeek | null;
  preferred_long_run_day: TrainingDay | null;
  terrain_available: TerrainAvailable[];
  training_aggressiveness: TrainingAggressiveness;
  injury_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RaceGoal = {
  id: string;
  user_id: string;
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

export type IntervalsConnection = {
  id: string;
  user_id: string;
  profile_id: string;
  athlete_id: string;
  api_key_encrypted_or_placeholder: IntervalsApiKeyPlaceholder;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type IntervalsWorkoutSync = {
  id: string;
  user_id: string;
  planned_workout_id: string;
  training_plan_id: string;
  profile_id: string;
  intervals_external_id: string;
  intervals_event_id: number | null;
  sync_status: IntervalsWorkoutSyncStatus;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkoutExport = {
  id: string;
  user_id: string;
  planned_workout_id: string | null;
  training_plan_id: string | null;
  profile_id: string;
  export_provider: WorkoutExportProvider;
  export_mode: WorkoutExportMode;
  provider_workout_id: string | null;
  provider_schedule_id: string | null;
  sync_status: WorkoutExportSyncStatus;
  scheduled_date: string | null;
  last_synced_at: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  warnings: string[];
  payload_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type RunnerProfile = Profile;

export type TrainingPlan = {
  id: string;
  user_id: string;
  profile_id: string;
  race_goal_id: string;
  name: string;
  status: TrainingPlanStatus;
  start_date: string;
  end_date: string;
  total_weeks: number;
  created_at: string;
  updated_at: string;
};

export type GeneratedTrainingPlanMetadata = Omit<
  TrainingPlan,
  "id" | "user_id" | "created_at" | "updated_at"
> & {
  assumptions: string[];
  warnings: string[];
  generated_by: "rule_based_v1";
};

export type PlannedWorkout = {
  id: string;
  user_id: string;
  training_plan_id: string;
  profile_id: string;
  race_goal_id: string;
  workout_date: string;
  week_number: number;
  day_label: TrainingDay;
  workout_type: WorkoutType;
  title: string;
  description: string | null;
  distance_km: number | null;
  duration_min: number | null;
  target_pace_min_sec_per_km: number | null;
  target_pace_max_sec_per_km: number | null;
  target_hr_zone: string | null;
  terrain: TerrainAvailable | null;
  purpose: string | null;
  instructions: string | null;
  structured_workout: StructuredWorkout | null;
  status: PlannedWorkoutStatus;
  created_at: string;
  updated_at: string;
};

export type GeneratedPlannedWorkout = Omit<
  PlannedWorkout,
  "id" | "user_id" | "training_plan_id" | "created_at" | "updated_at"
>;

export type GeneratedTrainingPlan = {
  trainingPlan: GeneratedTrainingPlanMetadata;
  plannedWorkouts: GeneratedPlannedWorkout[];
};

export type LoggedWorkout = {
  id: string;
  user_id: string;
  profile_id: string;
  race_goal_id: string | null;
  training_plan_id: string | null;
  planned_workout_id: string | null;
  workout_date: string;
  workout_type: LoggedWorkoutType;
  source: LoggedWorkoutSource;
  source_activity_id: string | null;
  distance_km: number | null;
  duration_sec: number | null;
  avg_pace_sec_per_km: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  cadence: number | null;
  elevation_gain_m: number | null;
  rpe: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkoutEvaluation = {
  id: string;
  user_id: string;
  logged_workout_id: string;
  planned_workout_id: string | null;
  profile_id: string;
  training_plan_id: string | null;
  overall_score: number;
  completion_score: number;
  pace_accuracy_score: number;
  distance_completion_score: number;
  effort_control_score: number;
  training_value_score: number;
  risk_level: WorkoutRiskLevel;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanAdjustment = {
  id: string;
  user_id: string;
  profile_id: string;
  race_goal_id: string;
  training_plan_id: string;
  logged_workout_id: string;
  workout_evaluation_id: string;
  adjustment_type: AdjustmentType;
  reason: string;
  explanation: string | null;
  affected_workout_ids: string[];
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  created_at: string;
};

export type PlanAdjustmentInput = {
  profile: Profile;
  raceGoal: RaceGoal;
  trainingPlan: TrainingPlan;
  loggedWorkout: LoggedWorkout;
  workoutEvaluation: WorkoutEvaluation;
  plannedWorkout: PlannedWorkout;
  futurePlannedWorkouts: PlannedWorkout[];
  recentLoggedWorkouts?: LoggedWorkout[];
  recentWorkoutEvaluations?: WorkoutEvaluation[];
};

export type PlanAdjustmentDecision = {
  adjustment_type: AdjustmentType;
  reason: string;
  explanation: string;
  affected_workout_ids: string[];
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  updatedFuturePlannedWorkouts: PlannedWorkout[];
};
