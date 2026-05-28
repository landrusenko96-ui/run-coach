import { fetchExistingStravaImportIds, saveStravaActivity } from "../db/stravaActivities.ts";
import { saveLoggedWorkout, type SaveLoggedWorkoutInput } from "../db/workouts.ts";
import { getLocalDateText } from "./planStart.ts";
import {
  buildStravaActivityAuditInput,
  getStravaActivityDate,
  isSupportedStravaRun,
  isValidStravaRunActivity,
} from "../strava/importRuns.ts";
import type { StravaSummaryActivity } from "../strava/client.ts";
import type { createSupabaseServerClient } from "../supabase/server.ts";
import type {
  LoggedWorkout,
  PlanGenerationHistorySkippedActivity,
  PlanGenerationHistorySummary,
  PlanGenerationHistoryWorkout,
  Profile,
  RaceGoal,
  RecentTrainingWeekInput,
} from "../../types/training.ts";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type BuildHistorySummaryInput = {
  profile: Profile;
  appLoggedWorkouts: LoggedWorkout[];
  importedStravaWorkouts?: LoggedWorkout[];
  skippedStravaActivities?: PlanGenerationHistorySkippedActivity[];
  windowEndDate?: string;
  forceManual?: boolean;
};

export type ImportMissingStravaHistoryInput = {
  userId: string;
  profile: Profile;
  raceGoal: RaceGoal;
  appLoggedWorkouts: LoggedWorkout[];
  stravaActivities: StravaSummaryActivity[];
  windowStartDate: string;
  windowEndDate: string;
  supabase: SupabaseServerClient;
};

export type ImportMissingStravaHistoryResult = {
  importedWorkouts: LoggedWorkout[];
  skippedActivities: PlanGenerationHistorySkippedActivity[];
};

const historyWindowDays = 42;

export function getSixWeekHistoryWindow(
  endDate = getLocalDateText(),
): { startDate: string; endDate: string } {
  return {
    startDate: addDaysToDateText(endDate, -(historyWindowDays - 1)),
    endDate,
  };
}

export function buildPlanGenerationHistorySummary(
  input: BuildHistorySummaryInput,
): PlanGenerationHistorySummary {
  const window = getSixWeekHistoryWindow(input.windowEndDate);
  const appWorkouts = filterRunLogsInWindow(
    input.appLoggedWorkouts,
    window.startDate,
    window.endDate,
  );
  const importedWorkouts = filterRunLogsInWindow(
    input.importedStravaWorkouts ?? [],
    window.startDate,
    window.endDate,
  );
  const allLoggedWorkouts = [...appWorkouts, ...importedWorkouts];
  const manualWeeks = getManualHistoryWeeks(input.profile);
  const weeks = input.forceManual
    ? manualWeeks
    : buildWeeksFromLoggedWorkouts(allLoggedWorkouts, window);
  const coverage = hasCompleteSixWeekCoverage(weeks)
    ? input.forceManual
      ? "manual"
      : "complete"
    : "partial";
  const needsManualHistory = Boolean(
    input.forceManual && !hasCompleteSixWeekCoverage(weeks),
  );

  return {
    window_start_date: window.startDate,
    window_end_date: window.endDate,
    coverage,
    weeks,
    app_workouts_used: appWorkouts.map((workout) =>
      mapLoggedWorkoutToHistoryWorkout(workout, "app"),
    ),
    strava_workouts_imported: importedWorkouts.map((workout) =>
      mapLoggedWorkoutToHistoryWorkout(workout, "strava"),
    ),
    strava_workouts_skipped: input.skippedStravaActivities ?? [],
    manual_weeks_used: input.forceManual ? manualWeeks : [],
    needs_strava_connection: false,
    needs_manual_history: needsManualHistory,
    message: buildHistorySummaryMessage({
      coverage,
      appCount: appWorkouts.length,
      importedCount: importedWorkouts.length,
      manualCount: input.forceManual ? manualWeeks.length : 0,
      needsManualHistory,
    }),
  };
}

export function hasCompleteSixWeekCoverage(
  weeks: RecentTrainingWeekInput[],
): boolean {
  return weeks.length === 6 && weeks.every((week) => week.run_count > 0);
}

export async function importMissingStravaHistoryRuns(
  input: ImportMissingStravaHistoryInput,
): Promise<ImportMissingStravaHistoryResult> {
  const appLoggedDateSet = new Set(
    input.appLoggedWorkouts.map((workout) => workout.workout_date),
  );
  const existingStravaIds = await fetchExistingStravaImportIds(input.supabase, {
    userId: input.userId,
    stravaActivityIds: input.stravaActivities.map((activity) => activity.id),
  });
  const importedWorkouts: LoggedWorkout[] = [];
  const skippedActivities: PlanGenerationHistorySkippedActivity[] = [];

  for (const activity of input.stravaActivities) {
    const activityDate = getStravaActivityDate(activity);
    const skipReason = getStravaHistorySkipReason({
      activity,
      activityDate,
      windowStartDate: input.windowStartDate,
      windowEndDate: input.windowEndDate,
      appLoggedDateSet,
      existingStravaIds,
    });

    if (skipReason) {
      skippedActivities.push({
        strava_activity_id: activity.id,
        name: activity.name,
        date: activityDate,
        reason: skipReason,
      });
      continue;
    }

    const loggedWorkout = await saveLoggedWorkout(
      buildStravaHistoryLoggedWorkoutInput({
        activity,
        activityDate,
        profile: input.profile,
        raceGoal: input.raceGoal,
      }),
      {
        supabase: input.supabase,
        userId: input.userId,
      },
    );

    await saveStravaActivity(
      input.supabase,
      buildStravaActivityAuditInput({
        userId: input.userId,
        activity,
        loggedWorkout,
        plannedWorkout: null,
      }),
    );

    importedWorkouts.push(loggedWorkout);
    existingStravaIds.add(activity.id);
    appLoggedDateSet.add(activityDate);
  }

  return {
    importedWorkouts,
    skippedActivities,
  };
}

function getStravaHistorySkipReason(input: {
  activity: StravaSummaryActivity;
  activityDate: string;
  windowStartDate: string;
  windowEndDate: string;
  appLoggedDateSet: Set<string>;
  existingStravaIds: Set<string>;
}): string | null {
  if (!isSupportedStravaRun(input.activity)) {
    return "not a supported run activity";
  }

  if (!isValidStravaRunActivity(input.activity)) {
    return "missing distance or moving time";
  }

  if (
    input.activityDate < input.windowStartDate ||
    input.activityDate > input.windowEndDate
  ) {
    return "outside the six-week history window";
  }

  if (input.existingStravaIds.has(input.activity.id)) {
    return "already imported";
  }

  if (input.appLoggedDateSet.has(input.activityDate)) {
    return "app history already has a logged run on this date";
  }

  return null;
}

function buildStravaHistoryLoggedWorkoutInput(input: {
  activity: StravaSummaryActivity;
  activityDate: string;
  profile: Profile;
  raceGoal: RaceGoal;
}): SaveLoggedWorkoutInput {
  const distanceKm = roundNullableNumber((input.activity.distanceM ?? 0) / 1000, 2) ?? 0;
  const durationSec = Math.round(input.activity.movingTimeSec ?? 0);

  return {
    profile_id: input.profile.id,
    race_goal_id: input.raceGoal.id,
    training_plan_id: null,
    planned_workout_id: null,
    workout_date: input.activityDate,
    workout_type: input.activity.sportType === "VirtualRun" ? "treadmill_run" : "run",
    source: "strava",
    source_activity_id: input.activity.id,
    distance_km: distanceKm > 0 ? distanceKm : 0.01,
    duration_sec: durationSec,
    avg_pace_sec_per_km: distanceKm > 0 ? Math.round(durationSec / distanceKm) : null,
    avg_heart_rate: getReasonableHeartRate(input.activity.averageHeartRate),
    max_heart_rate: getReasonableHeartRate(input.activity.maxHeartRate),
    cadence: null,
    elevation_gain_m: roundNullableNumber(input.activity.totalElevationGainM, 2),
    rpe: null,
    notes: `Imported from Strava for plan history: ${input.activity.name}`,
  };
}

function filterRunLogsInWindow(
  loggedWorkouts: LoggedWorkout[],
  startDate: string,
  endDate: string,
): LoggedWorkout[] {
  return loggedWorkouts.filter(
    (workout) =>
      workout.workout_date >= startDate &&
      workout.workout_date <= endDate &&
      workout.distance_km !== null &&
      workout.distance_km > 0 &&
      workout.duration_sec !== null &&
      workout.duration_sec > 0,
  );
}

function buildWeeksFromLoggedWorkouts(
  loggedWorkouts: LoggedWorkout[],
  window: { startDate: string; endDate: string },
): RecentTrainingWeekInput[] {
  return buildEmptyWeeks(window).map((week) => {
    const weekWorkouts = loggedWorkouts.filter(
      (workout) =>
        workout.workout_date >= week.week_start_date &&
        workout.workout_date <= week.week_end_date,
    );
    const distanceKm = roundDistance(
      weekWorkouts.reduce((total, workout) => total + (workout.distance_km ?? 0), 0),
    );
    const durationSec = weekWorkouts.reduce(
      (total, workout) => total + (workout.duration_sec ?? 0),
      0,
    );
    const longestRun = weekWorkouts.reduce<LoggedWorkout | null>(
      (longest, workout) =>
        (workout.distance_km ?? 0) > (longest?.distance_km ?? 0)
          ? workout
          : longest,
      null,
    );
    const source = getWeekSource(weekWorkouts);

    return {
      ...week,
      distance_km: distanceKm,
      duration_sec: durationSec > 0 ? durationSec : null,
      run_count: weekWorkouts.length,
      longest_run_km: longestRun?.distance_km ?? null,
      longest_run_duration_sec: longestRun?.duration_sec ?? null,
      source,
    };
  });
}

function buildEmptyWeeks(window: {
  startDate: string;
  endDate: string;
}): RecentTrainingWeekInput[] {
  const weeks: RecentTrainingWeekInput[] = [];

  for (let index = 0; index < 6; index += 1) {
    const weekStartDate = addDaysToDateText(window.startDate, index * 7);

    weeks.push({
      week_start_date: weekStartDate,
      week_end_date: index === 5 ? window.endDate : addDaysToDateText(weekStartDate, 6),
      distance_km: 0,
      duration_sec: null,
      run_count: 0,
      longest_run_km: null,
      longest_run_duration_sec: null,
      source: "app",
    });
  }

  return weeks;
}

function getManualHistoryWeeks(profile: Profile): RecentTrainingWeekInput[] {
  const manualHistory = profile.manual_six_week_history;

  if (!Array.isArray(manualHistory)) {
    return [];
  }

  return manualHistory
    .map((week) => ({
      week_start_date: week.week_start_date,
      week_end_date: week.week_end_date,
      distance_km: Number.isFinite(week.distance_km) ? week.distance_km : 0,
      duration_sec:
        week.duration_sec !== null && Number.isFinite(week.duration_sec)
          ? week.duration_sec
          : null,
      run_count: Number.isFinite(week.run_count) ? week.run_count : 0,
      longest_run_km:
        week.longest_run_km !== null && Number.isFinite(week.longest_run_km)
          ? week.longest_run_km
          : null,
      longest_run_duration_sec:
        week.longest_run_duration_sec !== null &&
        Number.isFinite(week.longest_run_duration_sec)
          ? week.longest_run_duration_sec
          : null,
      source: "manual" as const,
    }))
    .slice(0, 6);
}

function getWeekSource(
  weekWorkouts: LoggedWorkout[],
): RecentTrainingWeekInput["source"] {
  const hasApp = weekWorkouts.some((workout) => workout.source !== "strava");
  const hasStrava = weekWorkouts.some((workout) => workout.source === "strava");

  if (hasApp && hasStrava) {
    return "mixed";
  }

  if (hasStrava) {
    return "strava";
  }

  return "app";
}

function mapLoggedWorkoutToHistoryWorkout(
  workout: LoggedWorkout,
  source: PlanGenerationHistoryWorkout["source"],
): PlanGenerationHistoryWorkout {
  return {
    id: workout.id,
    source,
    workout_date: workout.workout_date,
    name: workout.notes?.replace(/^Imported from Strava( for plan history)?: /, "") ?? "Logged run",
    distance_km: workout.distance_km,
    duration_sec: workout.duration_sec,
    source_activity_id: workout.source_activity_id,
  };
}

function buildHistorySummaryMessage(input: {
  coverage: PlanGenerationHistorySummary["coverage"];
  appCount: number;
  importedCount: number;
  manualCount: number;
  needsManualHistory: boolean;
}): string {
  if (input.needsManualHistory) {
    return "Manual six-week history is incomplete. Fill all six weeks before generating from manual history.";
  }

  if (input.coverage === "manual") {
    return `Using ${input.manualCount} manually entered training-history weeks.`;
  }

  if (input.importedCount > 0) {
    return `Using ${input.appCount} app logged run${input.appCount === 1 ? "" : "s"} and imported ${input.importedCount} missing Strava run${input.importedCount === 1 ? "" : "s"} for six-week history.`;
  }

  if (input.coverage === "complete") {
    return `Using ${input.appCount} app logged run${input.appCount === 1 ? "" : "s"} for six-week history.`;
  }

  return `Only ${input.appCount} app logged run${input.appCount === 1 ? "" : "s"} found in the six-week history window.`;
}

function getReasonableHeartRate(value: number | null): number | null {
  if (value === null || value < 40 || value > 250) {
    return null;
  }

  return Math.round(value);
}

function roundNullableNumber(value: number | null, decimals = 2): number | null {
  if (value === null) {
    return null;
  }

  const multiplier = 10 ** decimals;

  return Math.round(value * multiplier) / multiplier;
}

function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 10) / 10;
}

function addDaysToDateText(dateText: string, daysToAdd: number): string {
  const date = parseDateOnly(dateText);

  date.setDate(date.getDate() + daysToAdd);

  return formatDateOnly(date);
}

function parseDateOnly(dateText: string): Date {
  const [year, month, day] = dateText.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
