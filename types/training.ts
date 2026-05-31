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
  | "relaxed"
  | "moderate"
  | "aggressive"
  | "very_aggressive";

export type RunningDaysPerWeek = 2 | 3 | 4 | 5 | 6;

export type RaceDistance = "half_marathon" | "marathon";

export type TargetPriority = "finish" | "personal_best" | "aggressive";

export type RacePriority = "A" | "B" | "casual";

export type GoalFlexibility = "fixed" | "flexible" | "finish_only";

export type TypicalSurface = "road" | "trail" | "track" | "treadmill" | "mixed";

export type TypicalElevationProfile =
  | "flat"
  | "rolling"
  | "hilly"
  | "mountainous"
  | "mixed";

export type RaceCourseProfile =
  | "flat"
  | "rolling"
  | "hilly"
  | "mountainous"
  | "unknown";

export type PhysiologyZoneSource = "manual" | "garmin" | "lab" | "other";

export type UserHeartRateZone = {
  zone: number | null;
  name: string;
  lower_bpm: number;
  upper_bpm: number;
  source: PhysiologyZoneSource;
  updated_at: string | null;
};

export type UserPowerZone = {
  zone: number | null;
  name: string;
  lower_watts: number;
  upper_watts: number;
  source: PhysiologyZoneSource;
  updated_at: string | null;
};

export type RecentTrainingWeekInput = {
  week_start_date: string;
  week_end_date: string;
  distance_km: number;
  duration_sec: number | null;
  run_count: number;
  longest_run_km: number | null;
  longest_run_duration_sec: number | null;
  source: "app" | "strava" | "manual" | "mixed";
};

export type PlanGenerationHistoryWorkout = {
  id: string;
  source: "app" | "strava" | "manual";
  workout_date: string;
  name: string;
  distance_km: number | null;
  duration_sec: number | null;
  source_activity_id: string | null;
  evidence_source?: "app" | "strava" | "merged" | "manual";
  merged_strava_activity_id?: string | null;
  merge_reason?: string | null;
};

export type PlanGenerationHistorySkippedActivity = {
  strava_activity_id: string;
  name: string;
  date: string;
  reason: string;
};

export type PlanGenerationHistorySummary = {
  window_start_date: string;
  window_end_date: string;
  coverage: "complete" | "partial" | "manual";
  weeks: RecentTrainingWeekInput[];
  app_workouts_used: PlanGenerationHistoryWorkout[];
  strava_workouts_imported: PlanGenerationHistoryWorkout[];
  strava_workouts_merged: PlanGenerationHistoryWorkout[];
  strava_workouts_skipped: PlanGenerationHistorySkippedActivity[];
  manual_weeks_used: RecentTrainingWeekInput[];
  needs_strava_connection: boolean;
  needs_manual_history: boolean;
  message: string;
};

export type GenerateTrainingPlanApiResponse = {
  success: boolean;
  message: string;
  needsConfirmation: boolean;
  needsGoalAdjustmentConfirmation: boolean;
  needsStravaConnection: boolean;
  needsManualHistory: boolean;
  goalAdjustmentSuggestion: PlanGoalAdjustmentSuggestion | null;
  plan: TrainingPlan | null;
  workouts: PlannedWorkout[];
  assumptions: string[];
  warnings: string[];
  historySummary: PlanGenerationHistorySummary | null;
};

export type PlanGoalAdjustmentSuggestion = {
  originalTargetFinishTimeSec: number;
  suggestedTargetFinishTimeSec: number;
  currentEstimatedFinishTimeSec: number;
  feasibilityRating: PlanGenerationFeasibilityRating;
  fitnessConfidence: PlanGenerationFitnessConfidence;
  reason: string;
};

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
  lactate_threshold_heart_rate: number | null;
  aerobic_threshold_heart_rate: number | null;
  user_hr_zones: UserHeartRateZone[] | null;
  aerobic_threshold_pace_sec_per_km: number | null;
  threshold_power_watts: number | null;
  critical_power_watts: number | null;
  easy_power_min_watts: number | null;
  easy_power_max_watts: number | null;
  user_power_zones: UserPowerZone[] | null;
  vo2max: number | null;
  vo2max_source: PhysiologyZoneSource | "estimate" | null;
  zones_source_priority: PhysiologyZoneSource[] | null;
  physiology_updated_at: string | null;
  available_training_days: TrainingDay[];
  running_days_per_week: RunningDaysPerWeek | null;
  preferred_long_run_day: TrainingDay | null;
  terrain_available: TerrainAvailable[];
  training_aggressiveness: TrainingAggressiveness;
  injury_notes: string | null;
  maximum_weekday_session_duration_min: number | null;
  maximum_weekend_session_duration_min: number | null;
  running_experience_level: ExperienceLevel | null;
  previous_half_marathon_history: string | null;
  previous_marathon_history: string | null;
  current_pain_or_injury: boolean;
  serious_recent_injury: boolean;
  injury_risk_notes: string | null;
  preferred_rest_day: TrainingDay | null;
  preferred_workout_days: TrainingDay[];
  cross_training_available: boolean;
  double_run_willingness: boolean;
  typical_surface: TypicalSurface | null;
  typical_elevation_profile: TypicalElevationProfile | null;
  manual_six_week_history: RecentTrainingWeekInput[] | null;
  manual_six_week_history_updated_at: string | null;
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
  race_priority: RacePriority;
  goal_flexibility: GoalFlexibility;
  race_course_profile: RaceCourseProfile | null;
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
  generator_version: PlanGeneratorVersion;
  feasibility_rating: PlanGenerationFeasibilityRating | null;
  fitness_confidence: PlanGenerationFitnessConfidence | null;
  generation_assumptions: string[];
  generation_warnings: string[];
  phase_summaries: PlanGenerationPhaseSummary[];
  weekly_summaries: PlanGenerationWeeklySummary[];
  peak_summary: PlanGenerationPeakSummary | null;
  taper_summary: PlanGenerationTaperSummary | null;
  created_at: string;
  updated_at: string;
};

export type GeneratedTrainingPlanMetadata = Omit<
  TrainingPlan,
  "id" | "user_id" | "created_at" | "updated_at"
> & {
  assumptions: string[];
  warnings: string[];
  generated_by: PlanGeneratorVersion;
};

export type PlanGeneratorVersion = "rule_based_v1";

export type PlanGenerationFeasibilityRating =
  | "finish_only"
  | "realistic"
  | "ambitious"
  | "very_ambitious"
  | "low_confidence"
  | "not_credible";

export type PlanGenerationFitnessConfidence = "low" | "medium" | "high";

export type PlanGenerationPhaseLabel =
  | "base"
  | "build"
  | "specific"
  | "peak"
  | "taper"
  | "race_prep";

export type PlanGenerationWeeklySummary = {
  week_number: number;
  phase: PlanGenerationPhaseLabel;
  volume_km: number;
  long_run_km: number;
  is_cutback: boolean;
  is_taper: boolean;
  is_race_week: boolean;
  intensity_total_run_km?: number;
  intensity_easy_km?: number;
  intensity_moderate_km?: number;
  intensity_threshold_km?: number;
  intensity_vo2_km?: number;
  intensity_repetition_km?: number;
  intensity_hard_km?: number;
  hill_load_km?: number;
  intensity_easy_share?: number;
  intensity_moderate_share?: number;
  intensity_hard_share?: number;
  threshold_cap_km?: number;
  vo2_cap_km?: number;
  repetition_cap_km?: number;
  load_risk_flags?: string[];
};

export type PlanGenerationPhaseSummary = {
  phase: PlanGenerationPhaseLabel;
  start_week: number;
  end_week: number;
  week_count: number;
  start_volume_km: number;
  end_volume_km: number;
  peak_volume_km: number;
  peak_long_run_km: number;
  cutback_week_numbers: number[];
};

export type PlanGenerationPeakSummary = {
  week_number: number;
  phase: PlanGenerationPhaseLabel;
  volume_km: number;
  long_run_km: number;
};

export type PlanGenerationTaperSummary = {
  taper_weeks: number;
  start_week: number | null;
  end_week: number | null;
  race_week_volume_km: number;
  peak_to_race_week_reduction_percent: number;
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
