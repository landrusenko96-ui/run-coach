import type { SaveStravaActivityInput } from "@/lib/db/stravaActivities";
import type { SaveLoggedWorkoutInput } from "@/lib/db/workouts";
import type { LoggedWorkoutCompletionResult } from "@/lib/training/workoutLogging";
import type {
  LoggedWorkout,
  LoggedWorkoutType,
  PlannedWorkout,
  Profile,
  RaceGoal,
  TrainingPlan,
  WorkoutEvaluation,
  WorkoutType,
} from "@/types";
import type {
  StravaImportActivityResult,
  StravaImportedWorkoutSummary,
  StravaImportResponse,
  StravaSingleActivityImportResponse,
} from "@/types/strava";
import type { StravaSummaryActivity } from "./client.ts";

const supportedRunSportTypes = new Set(["Run", "TrailRun", "VirtualRun"]);

const runWorkoutTypes = new Set<WorkoutType>([
  "easy",
  "long_run",
  "tempo",
  "interval",
  "marathon_pace",
  "recovery",
  "calibration",
]);

type StravaActivityImportDependencies = {
  isDuplicate: (stravaActivityId: string) => Promise<boolean>;
  saveLoggedWorkoutWithCompletion: (input: {
    loggedWorkoutInput: SaveLoggedWorkoutInput;
    plannedWorkout: PlannedWorkout | null;
    recentLoggedWorkouts: LoggedWorkout[];
    recentWorkoutEvaluations: WorkoutEvaluation[];
  }) => Promise<LoggedWorkoutCompletionResult>;
  saveStravaActivity: (input: SaveStravaActivityInput) => Promise<void>;
};

export type ImportStravaActivitiesInput = {
  userId: string;
  profile: Profile;
  raceGoal: RaceGoal;
  plan: TrainingPlan;
  plannedWorkouts: PlannedWorkout[];
  loggedWorkouts: LoggedWorkout[];
  workoutEvaluations: WorkoutEvaluation[];
  activities: StravaSummaryActivity[];
  dependencies: StravaActivityImportDependencies;
};

export type ImportSingleStravaActivityInput = Omit<
  ImportStravaActivitiesInput,
  "activities"
> & {
  activity: StravaSummaryActivity;
};

export function buildEmptyStravaImportSummary(): StravaImportResponse {
  return {
    ok: true,
    message: "No Strava activities were imported.",
    imported: 0,
    skippedDuplicates: 0,
    skippedAlreadyLogged: 0,
    skippedBeforePlanStart: 0,
    skippedAfterPlanEnd: 0,
    skippedNonRuns: 0,
    skippedInvalid: 0,
    linkedToPlanned: 0,
    importedUnlinked: 0,
    scored: 0,
    adjusted: 0,
    importedWorkouts: [],
    activityResults: [],
    errors: [],
  };
}

export function isSupportedStravaRun(activity: StravaSummaryActivity): boolean {
  return supportedRunSportTypes.has(activity.sportType);
}

export function isValidStravaRunActivity(
  activity: StravaSummaryActivity,
): boolean {
  return Boolean(
    activity.distanceM &&
      activity.distanceM > 0 &&
      activity.movingTimeSec &&
      activity.movingTimeSec > 0,
  );
}

export function getStravaActivityDate(activity: StravaSummaryActivity): string {
  const localDateText = activity.startDateLocal?.slice(0, 10);

  if (localDateText && /^\d{4}-\d{2}-\d{2}$/.test(localDateText)) {
    return localDateText;
  }

  return activity.startDate.slice(0, 10);
}

function isRunRelatedWorkout(workout: PlannedWorkout): boolean {
  return runWorkoutTypes.has(workout.workout_type);
}

function buildLoggedWorkoutDateSet(loggedWorkouts: LoggedWorkout[]): Set<string> {
  return new Set(
    loggedWorkouts.map((loggedWorkout) => loggedWorkout.workout_date),
  );
}

function getSameDayRunPlannedWorkouts(input: {
  date: string;
  plannedWorkouts: PlannedWorkout[];
}): PlannedWorkout[] {
  return input.plannedWorkouts.filter(
    (workout) =>
      workout.workout_date === input.date &&
      workout.status === "planned" &&
      isRunRelatedWorkout(workout),
  );
}

function hasAlreadyMatchedPlannedWorkout(input: {
  plannedWorkouts: PlannedWorkout[];
  loggedPlannedWorkoutIds: Set<string>;
}): boolean {
  return input.plannedWorkouts.some((workout) =>
    input.loggedPlannedWorkoutIds.has(workout.id),
  );
}

export function findExactDatePlannedWorkoutMatch(input: {
  activity: StravaSummaryActivity;
  plannedWorkouts: PlannedWorkout[];
  loggedPlannedWorkoutIds: Set<string>;
}): PlannedWorkout | null {
  const activityDate = getStravaActivityDate(input.activity);

  return (
    input.plannedWorkouts.find(
      (workout) =>
        workout.workout_date === activityDate &&
        workout.status === "planned" &&
        isRunRelatedWorkout(workout) &&
        !input.loggedPlannedWorkoutIds.has(workout.id),
    ) ?? null
  );
}

function getLoggedWorkoutType(activity: StravaSummaryActivity): LoggedWorkoutType {
  return activity.sportType === "VirtualRun" ? "treadmill_run" : "run";
}

function roundNullableNumber(value: number | null, decimals = 2): number | null {
  if (value === null) {
    return null;
  }

  const multiplier = 10 ** decimals;

  return Math.round(value * multiplier) / multiplier;
}

function getDistanceKm(activity: StravaSummaryActivity): number {
  const distanceM = activity.distanceM ?? 0;
  const roundedKm = roundNullableNumber(distanceM / 1000, 2) ?? 0;

  return roundedKm > 0 ? roundedKm : 0.01;
}

function getDisplayDistanceKm(activity: StravaSummaryActivity): number | null {
  if (!activity.distanceM || activity.distanceM <= 0) {
    return null;
  }

  return roundNullableNumber(activity.distanceM / 1000, 2);
}

function getDisplayPaceSecPerKm(
  activity: StravaSummaryActivity,
): number | null {
  const distanceKm = getDisplayDistanceKm(activity);

  if (
    !distanceKm ||
    distanceKm <= 0 ||
    !activity.movingTimeSec ||
    activity.movingTimeSec <= 0
  ) {
    return null;
  }

  return Math.round(activity.movingTimeSec / distanceKm);
}

function getReasonableHeartRate(value: number | null): number | null {
  if (value === null || value < 40 || value > 250) {
    return null;
  }

  return Math.round(value);
}

function getLoggedWorkoutHeartRates(activity: StravaSummaryActivity): {
  avgHeartRate: number | null;
  maxHeartRate: number | null;
} {
  const avgHeartRate = getReasonableHeartRate(activity.averageHeartRate);
  let maxHeartRate = getReasonableHeartRate(activity.maxHeartRate);

  if (avgHeartRate !== null && maxHeartRate !== null && avgHeartRate > maxHeartRate) {
    maxHeartRate = null;
  }

  return { avgHeartRate, maxHeartRate };
}

function getAuditHeartRate(value: number | null): number | null {
  if (value === null || value < 40 || value > 250) {
    return null;
  }

  return roundNullableNumber(value, 2);
}

function getAuditHeartRates(activity: StravaSummaryActivity): {
  averageHeartRate: number | null;
  maxHeartRate: number | null;
} {
  const averageHeartRate = getAuditHeartRate(activity.averageHeartRate);
  let maxHeartRate = getAuditHeartRate(activity.maxHeartRate);

  if (
    averageHeartRate !== null &&
    maxHeartRate !== null &&
    averageHeartRate > maxHeartRate
  ) {
    maxHeartRate = null;
  }

  return { averageHeartRate, maxHeartRate };
}

export function buildStravaLoggedWorkoutInput(input: {
  activity: StravaSummaryActivity;
  profile: Profile;
  raceGoal: RaceGoal;
  plan: TrainingPlan;
  plannedWorkout: PlannedWorkout | null;
}): SaveLoggedWorkoutInput {
  const distanceKm = getDistanceKm(input.activity);
  const durationSec = Math.round(input.activity.movingTimeSec ?? 0);
  const heartRates = getLoggedWorkoutHeartRates(input.activity);

  return {
    profile_id: input.profile.id,
    race_goal_id: input.raceGoal.id,
    training_plan_id: input.plan.id,
    planned_workout_id: input.plannedWorkout?.id ?? null,
    workout_date: getStravaActivityDate(input.activity),
    workout_type: getLoggedWorkoutType(input.activity),
    source: "strava",
    source_activity_id: input.activity.id,
    distance_km: distanceKm,
    duration_sec: durationSec,
    avg_pace_sec_per_km: Math.round(durationSec / distanceKm),
    avg_heart_rate: heartRates.avgHeartRate,
    max_heart_rate: heartRates.maxHeartRate,
    cadence: null,
    elevation_gain_m: roundNullableNumber(input.activity.totalElevationGainM, 2),
    rpe: null,
    notes: `Imported from Strava: ${input.activity.name}`,
  };
}

export function buildStravaActivityAuditInput(input: {
  userId: string;
  activity: StravaSummaryActivity;
  loggedWorkout: LoggedWorkout;
  plannedWorkout: PlannedWorkout | null;
}): SaveStravaActivityInput {
  const heartRates = getAuditHeartRates(input.activity);

  return {
    user_id: input.userId,
    strava_activity_id: input.activity.id,
    logged_workout_id: input.loggedWorkout.id,
    planned_workout_id: input.plannedWorkout?.id ?? null,
    activity_name: input.activity.name,
    sport_type: input.activity.sportType,
    start_date: input.activity.startDate,
    distance_m: roundNullableNumber(input.activity.distanceM ?? 0, 2) ?? 0,
    moving_time_sec: Math.round(input.activity.movingTimeSec ?? 0),
    elapsed_time_sec: Math.round(
      input.activity.elapsedTimeSec ?? input.activity.movingTimeSec ?? 0,
    ),
    total_elevation_gain_m: roundNullableNumber(
      input.activity.totalElevationGainM,
      2,
    ),
    average_heart_rate: heartRates.averageHeartRate,
    max_heart_rate: heartRates.maxHeartRate,
    raw_summary_json: input.activity.rawSummary,
  };
}

function buildLoggedPlannedWorkoutIdSet(
  loggedWorkouts: LoggedWorkout[],
): Set<string> {
  return new Set(
    loggedWorkouts
      .map((loggedWorkout) => loggedWorkout.planned_workout_id)
      .filter((plannedWorkoutId): plannedWorkoutId is string =>
        Boolean(plannedWorkoutId),
      ),
  );
}

function buildImportedWorkoutSummary(input: {
  activity: StravaSummaryActivity;
  loggedWorkoutInput: SaveLoggedWorkoutInput;
  plannedWorkout: PlannedWorkout | null;
}): StravaImportedWorkoutSummary {
  return {
    name: input.activity.name,
    date: input.loggedWorkoutInput.workout_date,
    distanceKm: input.loggedWorkoutInput.distance_km ?? 0,
    avgPaceSecPerKm: input.loggedWorkoutInput.avg_pace_sec_per_km,
    matchStatus: input.plannedWorkout ? "matched" : "unlinked",
  };
}

function buildActivityResult(input: {
  activity: StravaSummaryActivity;
  status: StravaImportActivityResult["status"];
  statusMessage: string;
  loggedWorkoutId?: string | null;
  matchedPlannedWorkoutId?: string | null;
}): StravaImportActivityResult {
  const averagePace = getDisplayPaceSecPerKm(input.activity);
  const reason = input.status.startsWith("skipped_")
    ? input.statusMessage.replace(/^Skipped:\s*/, "")
    : null;

  return {
    stravaActivityId: input.activity.id,
    name: input.activity.name,
    date: getStravaActivityDate(input.activity),
    distanceKm: getDisplayDistanceKm(input.activity),
    avgPaceSecPerKm: averagePace,
    averagePace,
    status: input.status,
    statusMessage: input.statusMessage,
    reason,
    loggedWorkoutId: input.loggedWorkoutId ?? null,
    matchedPlannedWorkoutId: input.matchedPlannedWorkoutId ?? null,
  };
}

function addActivityResult(
  summary: StravaImportResponse,
  input: {
    activity: StravaSummaryActivity;
    status: StravaImportActivityResult["status"];
    statusMessage: string;
    loggedWorkoutId?: string | null;
    matchedPlannedWorkoutId?: string | null;
  },
): StravaImportActivityResult {
  const result = buildActivityResult(input);

  summary.activityResults.push(result);

  return result;
}

function addLoggedWorkoutForNextMatch(
  loggedWorkouts: LoggedWorkout[],
  loggedWorkout: LoggedWorkout,
): LoggedWorkout[] {
  if (loggedWorkouts.some((currentLog) => currentLog.id === loggedWorkout.id)) {
    return loggedWorkouts;
  }

  return [...loggedWorkouts, loggedWorkout];
}

function addWorkoutEvaluationForNextAdjustment(
  evaluations: WorkoutEvaluation[],
  evaluation: WorkoutEvaluation | null,
): WorkoutEvaluation[] {
  if (!evaluation) {
    return evaluations;
  }

  if (
    evaluations.some(
      (currentEvaluation) => currentEvaluation.id === evaluation.id,
    )
  ) {
    return evaluations;
  }

  return [evaluation, ...evaluations];
}

function finishImportSummary(summary: StravaImportResponse): StravaImportResponse {
  return {
    ...summary,
    ok: true,
    message:
      summary.imported === 0
        ? "No new Strava runs were imported."
        : `Imported ${summary.imported} Strava run${
            summary.imported === 1 ? "" : "s"
          }.`,
  };
}

export async function importStravaActivitiesForActivePlan(
  input: ImportStravaActivitiesInput,
): Promise<StravaImportResponse> {
  const summary = buildEmptyStravaImportSummary();
  let loggedWorkouts = input.loggedWorkouts;
  let workoutEvaluations = input.workoutEvaluations;
  let loggedPlannedWorkoutIds = buildLoggedPlannedWorkoutIdSet(loggedWorkouts);
  let loggedWorkoutDates = buildLoggedWorkoutDateSet(loggedWorkouts);

  for (const activity of input.activities) {
    let recordedActivityResult = false;

    try {
      if (!isSupportedStravaRun(activity)) {
        summary.skippedNonRuns += 1;
        addActivityResult(summary, {
          activity,
          status: "skipped_non_run",
          statusMessage: "Skipped: not a supported run type",
        });
        continue;
      }

      if (!isValidStravaRunActivity(activity)) {
        summary.skippedInvalid += 1;
        addActivityResult(summary, {
          activity,
          status: "skipped_invalid",
          statusMessage: "Skipped: missing or zero distance or moving time",
        });
        continue;
      }

      const activityDate = getStravaActivityDate(activity);

      if (activityDate < input.plan.start_date) {
        summary.skippedBeforePlanStart += 1;
        addActivityResult(summary, {
          activity,
          status: "skipped_before_plan_start",
          statusMessage: "Skipped: before the active plan starts",
        });
        continue;
      }

      if (activityDate > input.plan.end_date) {
        summary.skippedAfterPlanEnd += 1;
        addActivityResult(summary, {
          activity,
          status: "skipped_after_plan_end",
          statusMessage: "Skipped: after the active plan ends",
        });
        continue;
      }

      if (await input.dependencies.isDuplicate(activity.id)) {
        summary.skippedDuplicates += 1;
        addActivityResult(summary, {
          activity,
          status: "skipped_duplicate",
          statusMessage: "Skipped: this Strava activity was already imported",
        });
        continue;
      }

      if (loggedWorkoutDates.has(activityDate)) {
        summary.skippedAlreadyLogged += 1;
        addActivityResult(summary, {
          activity,
          status: "skipped_already_logged",
          statusMessage:
            "Skipped: this active-plan day already has a logged workout",
        });
        continue;
      }

      const sameDayRunPlannedWorkouts = getSameDayRunPlannedWorkouts({
        date: activityDate,
        plannedWorkouts: input.plannedWorkouts,
      });

      if (
        hasAlreadyMatchedPlannedWorkout({
          plannedWorkouts: sameDayRunPlannedWorkouts,
          loggedPlannedWorkoutIds,
        })
      ) {
        summary.skippedAlreadyLogged += 1;
        addActivityResult(summary, {
          activity,
          status: "skipped_already_logged",
          statusMessage:
            "Skipped: the planned workout is already matched to another log",
        });
        continue;
      }

      const plannedWorkout =
        sameDayRunPlannedWorkouts.find(
          (workout) => !loggedPlannedWorkoutIds.has(workout.id),
        ) ?? null;
      const loggedWorkoutInput = buildStravaLoggedWorkoutInput({
        activity,
        profile: input.profile,
        raceGoal: input.raceGoal,
        plan: input.plan,
        plannedWorkout,
      });
      const completionResult =
        await input.dependencies.saveLoggedWorkoutWithCompletion({
          loggedWorkoutInput,
          plannedWorkout,
          recentLoggedWorkouts: loggedWorkouts,
          recentWorkoutEvaluations: workoutEvaluations,
        });

      summary.imported += 1;
      loggedWorkouts = addLoggedWorkoutForNextMatch(
        loggedWorkouts,
        completionResult.loggedWorkout,
      );
      loggedWorkoutDates = buildLoggedWorkoutDateSet(loggedWorkouts);
      workoutEvaluations = addWorkoutEvaluationForNextAdjustment(
        workoutEvaluations,
        completionResult.workoutEvaluation,
      );

      if (plannedWorkout) {
        summary.linkedToPlanned += 1;
        loggedPlannedWorkoutIds = buildLoggedPlannedWorkoutIdSet(loggedWorkouts);
      } else {
        summary.importedUnlinked += 1;
      }

      summary.importedWorkouts.push(
        buildImportedWorkoutSummary({
          activity,
          loggedWorkoutInput,
          plannedWorkout,
        }),
      );
      addActivityResult(summary, {
        activity,
        status: plannedWorkout ? "imported_matched" : "imported_unlinked",
        statusMessage: plannedWorkout
          ? "Imported: matched to planned workout"
          : "Imported: no planned workout match",
        loggedWorkoutId: completionResult.loggedWorkout.id,
        matchedPlannedWorkoutId: plannedWorkout?.id ?? null,
      });
      recordedActivityResult = true;

      if (completionResult.scored) {
        summary.scored += 1;
      }

      if (completionResult.adjusted) {
        summary.adjusted += 1;
      }

      if (completionResult.followupError) {
        summary.errors.push(
          `${activity.id}: ${completionResult.followupError}`,
        );
      }

      await input.dependencies.saveStravaActivity(
        buildStravaActivityAuditInput({
          userId: input.userId,
          activity,
          loggedWorkout: completionResult.loggedWorkout,
          plannedWorkout,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown import error.";

      summary.errors.push(
        `${activity.id}: ${message}`,
      );

      if (!recordedActivityResult) {
        addActivityResult(summary, {
          activity,
          status: "skipped_error",
          statusMessage: `Skipped: ${message}`,
        });
      }
    }
  }

  return finishImportSummary(summary);
}

export async function importSingleStravaActivityForActivePlan(
  input: ImportSingleStravaActivityInput,
): Promise<StravaSingleActivityImportResponse> {
  const summary = await importStravaActivitiesForActivePlan({
    ...input,
    activities: [input.activity],
  });
  const activityResult = summary.activityResults[0];

  if (!activityResult) {
    throw new Error("Single Strava activity import did not return a result.");
  }

  return {
    summary,
    activityResult,
  };
}
