import {
  fetchExistingStravaImportIds,
  saveStravaActivity,
  updateStravaActivityRawSummary,
} from "../db/stravaActivities.ts";
import { saveLoggedWorkout, type SaveLoggedWorkoutInput } from "../db/workouts.ts";
import { getLocalDateText } from "./planStart.ts";
import {
  buildStravaActivityAuditInput,
  getStravaActivityDate,
  isSupportedStravaRun,
  isValidStravaRunActivity,
} from "../strava/importRuns.ts";
import {
  isEnrichedStravaRawSummary,
  type StravaActivityEvidence,
} from "../strava/activityEvidence.ts";
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
  canonicalWorkouts?: LoggedWorkout[];
  mergedStravaWorkouts?: PlanGenerationHistoryWorkout[];
  skippedStravaActivities?: PlanGenerationHistorySkippedActivity[];
  windowEndDate?: string;
  forceManual?: boolean;
  fillManualGaps?: boolean;
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

export type HistoryEvidenceMode = "auto" | "manual";

type StravaHistoryCandidate = {
  stravaActivityId: string;
  activityDate: string;
  distanceKm: number | null;
  durationSec: number | null;
  startDateLocal: string | null;
};

type AppWorkoutDuplicateMatch = {
  workout: LoggedWorkout;
  reason: string;
};

export type CanonicalPlanGenerationHistoryInput = {
  historyMode: HistoryEvidenceMode;
  appLoggedWorkouts: LoggedWorkout[];
  importedStravaWorkouts?: LoggedWorkout[];
  stravaActivityEvidence?: StravaActivityEvidence[];
};

export type CanonicalPlanGenerationHistoryResult = {
  workouts: LoggedWorkout[];
  mergedStravaWorkouts: PlanGenerationHistoryWorkout[];
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
  const allLoggedWorkouts = filterRunLogsInWindow(
    input.canonicalWorkouts ?? [...appWorkouts, ...importedWorkouts],
    window.startDate,
    window.endDate,
  );
  const manualWeeks = getManualHistoryWeeks(input.profile);
  const loggedWeeks = buildWeeksFromLoggedWorkouts(allLoggedWorkouts, window);
  const weeks = input.forceManual
    ? manualWeeks
    : input.fillManualGaps
      ? fillMissingHistoryWeeksWithManual(loggedWeeks, manualWeeks)
      : loggedWeeks;
  const manualWeeksUsed = input.forceManual
    ? manualWeeks
    : input.fillManualGaps
      ? weeks.filter((week) => week.source === "manual")
      : [];
  const isComplete = hasCompleteSixWeekCoverage(weeks);
  const coverage = isComplete
    ? input.forceManual
      ? "manual"
      : "complete"
    : "partial";
  const needsManualHistory = Boolean(
    (input.forceManual || input.fillManualGaps) && !isComplete,
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
    strava_workouts_merged: input.mergedStravaWorkouts ?? [],
    strava_workouts_skipped: input.skippedStravaActivities ?? [],
    manual_weeks_used: manualWeeksUsed,
    needs_strava_connection: false,
    needs_manual_history: needsManualHistory,
    message: buildHistorySummaryMessage({
      coverage,
      appCount: appWorkouts.length,
      importedCount: importedWorkouts.length,
      mergedCount: input.mergedStravaWorkouts?.length ?? 0,
      manualCount: manualWeeksUsed.length,
      needsManualHistory,
      forceManual: input.forceManual === true,
    }),
  };
}

export function hasCompleteSixWeekCoverage(
  weeks: RecentTrainingWeekInput[],
): boolean {
  return weeks.length === 6 && weeks.every((week) => week.run_count > 0);
}

export function shouldFetchStravaHistoryForPlanGeneration(input: {
  historyMode: HistoryEvidenceMode;
  hasCompleteAppCoverage: boolean;
}): boolean {
  return input.historyMode === "auto";
}

export function getPlanGenerationEvidenceWorkouts(input: {
  historyMode: HistoryEvidenceMode;
  appLoggedWorkouts: LoggedWorkout[];
  importedStravaWorkouts?: LoggedWorkout[];
  canonicalWorkouts?: LoggedWorkout[];
}): LoggedWorkout[] {
  if (input.historyMode === "manual") {
    return [];
  }

  return input.canonicalWorkouts
    ? input.canonicalWorkouts
    : [
        ...input.appLoggedWorkouts,
        ...(input.importedStravaWorkouts ?? []),
      ];
}

export function buildCanonicalPlanGenerationHistory(
  input: CanonicalPlanGenerationHistoryInput,
): CanonicalPlanGenerationHistoryResult {
  if (input.historyMode === "manual") {
    return {
      workouts: [],
      mergedStravaWorkouts: [],
    };
  }

  const evidenceItems = input.stravaActivityEvidence ?? [];
  const unusedEvidenceIds = new Set(
    evidenceItems.map((evidence) => evidence.stravaActivityId),
  );
  const canonicalWorkouts: LoggedWorkout[] = [];
  const mergedStravaWorkouts: PlanGenerationHistoryWorkout[] = [];

  for (const appWorkout of input.appLoggedWorkouts) {
    const match = findMatchingStravaEvidenceForAppWorkout({
      workout: appWorkout,
      evidenceItems,
      unusedEvidenceIds,
    });

    if (!match) {
      canonicalWorkouts.push(appWorkout);
      continue;
    }

    const mergedWorkout = mergeLoggedWorkoutWithStravaEvidence({
      workout: appWorkout,
      evidence: match.evidence,
    });

    canonicalWorkouts.push(mergedWorkout);
    unusedEvidenceIds.delete(match.evidence.stravaActivityId);
    mergedStravaWorkouts.push(
      mapLoggedWorkoutToHistoryWorkout(mergedWorkout, "app", {
        evidenceSource: "merged",
        mergedStravaActivityId: match.evidence.stravaActivityId,
        mergeReason: match.reason,
      }),
    );
  }

  const usedActivityIds = new Set(
    canonicalWorkouts
      .map((workout) => workout.source_activity_id)
      .filter((activityId): activityId is string => Boolean(activityId)),
  );

  for (const importedWorkout of input.importedStravaWorkouts ?? []) {
    if (
      importedWorkout.source_activity_id &&
      usedActivityIds.has(importedWorkout.source_activity_id)
    ) {
      continue;
    }

    canonicalWorkouts.push(importedWorkout);

    if (importedWorkout.source_activity_id) {
      usedActivityIds.add(importedWorkout.source_activity_id);
    }
  }

  return {
    workouts: canonicalWorkouts,
    mergedStravaWorkouts,
  };
}

export async function importMissingStravaHistoryRuns(
  input: ImportMissingStravaHistoryInput,
): Promise<ImportMissingStravaHistoryResult> {
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
      existingStravaIds,
    });

    if (skipReason) {
      if (
        skipReason === "already imported" &&
        isEnrichedStravaRawSummary(activity.rawSummary)
      ) {
        await updateExistingStravaEvidenceAudit({
          activity,
          userId: input.userId,
          supabase: input.supabase,
        });
      }

      skippedActivities.push({
        strava_activity_id: activity.id,
        name: activity.name,
        date: activityDate,
        reason: skipReason,
      });
      continue;
    }

    const matchingAppWorkout = findMatchingAppWorkoutForStravaActivity({
      activity,
      appLoggedWorkouts: input.appLoggedWorkouts,
    });

    if (matchingAppWorkout) {
      await saveMergedStravaEvidenceAudit({
        activity,
        userId: input.userId,
        loggedWorkout: matchingAppWorkout.workout,
        mergeReason: matchingAppWorkout.reason,
        supabase: input.supabase,
      });

      skippedActivities.push({
        strava_activity_id: activity.id,
        name: activity.name,
        date: activityDate,
        reason: "merged with app history log",
      });
      existingStravaIds.add(activity.id);
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
  }

  return {
    importedWorkouts,
    skippedActivities,
  };
}

async function saveMergedStravaEvidenceAudit(input: {
  activity: StravaSummaryActivity;
  userId: string;
  loggedWorkout: LoggedWorkout;
  mergeReason: string;
  supabase: SupabaseServerClient;
}): Promise<void> {
  try {
    const auditInput = buildStravaActivityAuditInput({
      userId: input.userId,
      activity: input.activity,
      loggedWorkout: input.loggedWorkout,
      plannedWorkout: null,
    });

    await saveStravaActivity(input.supabase, {
      ...auditInput,
      planned_workout_id: input.loggedWorkout.planned_workout_id,
      raw_summary_json: addHistoryMergeAuditMetadata(input.activity.rawSummary, {
        loggedWorkoutId: input.loggedWorkout.id,
        plannedWorkoutId: input.loggedWorkout.planned_workout_id,
        reason: input.mergeReason,
      }),
    });
  } catch {
    // Audit enrichment is useful but should never block plan generation.
  }
}

async function updateExistingStravaEvidenceAudit(input: {
  activity: StravaSummaryActivity;
  userId: string;
  supabase: SupabaseServerClient;
}): Promise<void> {
  try {
    await updateStravaActivityRawSummary(input.supabase, {
      userId: input.userId,
      stravaActivityId: input.activity.id,
      rawSummaryJson: input.activity.rawSummary,
    });
  } catch {
    // Evidence refresh is useful but should never block plan generation.
  }
}

export function findMatchingAppWorkoutForStravaActivity(input: {
  activity: StravaSummaryActivity;
  appLoggedWorkouts: LoggedWorkout[];
}): AppWorkoutDuplicateMatch | null {
  return findMatchingAppWorkoutForStravaCandidate({
    candidate: buildStravaCandidateFromActivity(input.activity),
    appLoggedWorkouts: input.appLoggedWorkouts,
  });
}

function findMatchingStravaEvidenceForAppWorkout(input: {
  workout: LoggedWorkout;
  evidenceItems: StravaActivityEvidence[];
  unusedEvidenceIds: Set<string>;
}): { evidence: StravaActivityEvidence; reason: string } | null {
  let bestMatch: {
    evidence: StravaActivityEvidence;
    reason: string;
    score: number;
  } | null = null;

  for (const evidence of input.evidenceItems) {
    if (!input.unusedEvidenceIds.has(evidence.stravaActivityId)) {
      continue;
    }

    const match = getWorkoutStravaDuplicateMatch({
      workout: input.workout,
      candidate: buildStravaCandidateFromEvidence(evidence),
    });

    if (!match) {
      continue;
    }

    if (!bestMatch || match.score > bestMatch.score) {
      bestMatch = {
        evidence,
        reason: match.reason,
        score: match.score,
      };
    }
  }

  return bestMatch
    ? {
        evidence: bestMatch.evidence,
        reason: bestMatch.reason,
      }
    : null;
}

function findMatchingAppWorkoutForStravaCandidate(input: {
  candidate: StravaHistoryCandidate;
  appLoggedWorkouts: LoggedWorkout[];
}): AppWorkoutDuplicateMatch | null {
  let bestMatch: {
    workout: LoggedWorkout;
    reason: string;
    score: number;
  } | null = null;

  for (const workout of input.appLoggedWorkouts) {
    const match = getWorkoutStravaDuplicateMatch({
      workout,
      candidate: input.candidate,
    });

    if (!match) {
      continue;
    }

    if (!bestMatch || match.score > bestMatch.score) {
      bestMatch = {
        workout,
        reason: match.reason,
        score: match.score,
      };
    }
  }

  return bestMatch
    ? {
        workout: bestMatch.workout,
        reason: bestMatch.reason,
      }
    : null;
}

function getWorkoutStravaDuplicateMatch(input: {
  workout: LoggedWorkout;
  candidate: StravaHistoryCandidate;
}): { score: number; reason: string } | null {
  if (
    input.workout.source_activity_id &&
    input.workout.source_activity_id === input.candidate.stravaActivityId
  ) {
    return {
      score: 100,
      reason: "same Strava activity ID",
    };
  }

  if (input.workout.workout_date !== input.candidate.activityDate) {
    return null;
  }

  const distanceIsSimilar = hasSimilarDistance(
    input.workout.distance_km,
    input.candidate.distanceKm,
  );
  const durationIsSimilar = hasSimilarDuration(
    input.workout.duration_sec,
    input.candidate.durationSec,
  );

  if (input.workout.planned_workout_id && (distanceIsSimilar || durationIsSimilar)) {
    return {
      score: 80,
      reason: "same date, planned workout link, and similar distance or duration",
    };
  }

  if (distanceIsSimilar && durationIsSimilar) {
    return {
      score: 70,
      reason: "same date and similar distance and duration",
    };
  }

  if (distanceIsSimilar) {
    return {
      score: 50,
      reason: "same date and similar distance",
    };
  }

  if (durationIsSimilar) {
    return {
      score: 40,
      reason: "same date and similar duration",
    };
  }

  return null;
}

function buildStravaCandidateFromActivity(
  activity: StravaSummaryActivity,
): StravaHistoryCandidate {
  return {
    stravaActivityId: activity.id,
    activityDate: getStravaActivityDate(activity),
    distanceKm:
      activity.distanceM !== null ? roundNullableNumber(activity.distanceM / 1000) : null,
    durationSec:
      activity.movingTimeSec !== null ? Math.round(activity.movingTimeSec) : null,
    startDateLocal: activity.startDateLocal ?? null,
  };
}

function buildStravaCandidateFromEvidence(
  evidence: StravaActivityEvidence,
): StravaHistoryCandidate {
  return {
    stravaActivityId: evidence.stravaActivityId,
    activityDate: evidence.activityDate,
    distanceKm: evidence.distanceKm,
    durationSec: evidence.durationSec,
    startDateLocal: null,
  };
}

function mergeLoggedWorkoutWithStravaEvidence(input: {
  workout: LoggedWorkout;
  evidence: StravaActivityEvidence;
}): LoggedWorkout {
  const distanceKm =
    hasPositiveNumber(input.workout.distance_km)
      ? input.workout.distance_km
      : input.evidence.distanceKm;
  const durationSec =
    hasPositiveNumber(input.workout.duration_sec)
      ? input.workout.duration_sec
      : input.evidence.durationSec;
  const avgPaceSecPerKm =
    input.workout.avg_pace_sec_per_km ??
    input.evidence.avgPaceSecPerKm ??
    calculateAveragePaceSecPerKm(distanceKm, durationSec);

  return {
    ...input.workout,
    source_activity_id:
      input.workout.source_activity_id ?? input.evidence.stravaActivityId,
    distance_km: distanceKm,
    duration_sec: durationSec,
    avg_pace_sec_per_km: avgPaceSecPerKm,
    avg_heart_rate:
      input.workout.avg_heart_rate ??
      getReasonableHeartRate(input.evidence.averageHeartRate),
    max_heart_rate:
      input.workout.max_heart_rate ??
      getReasonableHeartRate(input.evidence.maxHeartRate),
    elevation_gain_m:
      input.workout.elevation_gain_m ??
      roundNullableNumber(input.evidence.elevationGainM, 2),
  };
}

function getStravaHistorySkipReason(input: {
  activity: StravaSummaryActivity;
  activityDate: string;
  windowStartDate: string;
  windowEndDate: string;
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
  const hasStrava = weekWorkouts.some(
    (workout) => workout.source === "strava" || Boolean(workout.source_activity_id),
  );

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
  metadata?: {
    evidenceSource?: NonNullable<PlanGenerationHistoryWorkout["evidence_source"]>;
    mergedStravaActivityId?: string | null;
    mergeReason?: string | null;
  },
): PlanGenerationHistoryWorkout {
  return {
    id: workout.id,
    source,
    workout_date: workout.workout_date,
    name: workout.notes?.replace(/^Imported from Strava( for plan history)?: /, "") ?? "Logged run",
    distance_km: workout.distance_km,
    duration_sec: workout.duration_sec,
    source_activity_id: workout.source_activity_id,
    evidence_source: metadata?.evidenceSource,
    merged_strava_activity_id: metadata?.mergedStravaActivityId,
    merge_reason: metadata?.mergeReason,
  };
}

function buildHistorySummaryMessage(input: {
  coverage: PlanGenerationHistorySummary["coverage"];
  appCount: number;
  importedCount: number;
  mergedCount: number;
  manualCount: number;
  needsManualHistory: boolean;
  forceManual: boolean;
}): string {
  if (input.needsManualHistory) {
    return input.forceManual
      ? "Manual six-week history is incomplete. Fill all six weeks before generating from manual history."
      : "Six-week history is still incomplete after app, Strava, and manual fallback coverage.";
  }

  if (input.coverage === "manual") {
    return `Using ${input.manualCount} manually entered training-history weeks.`;
  }

  const sourceParts: string[] = [];

  if (input.appCount > 0) {
    sourceParts.push(
      `${input.appCount} app logged run${input.appCount === 1 ? "" : "s"}`,
    );
  }

  if (input.importedCount > 0) {
    sourceParts.push(
      `${input.importedCount} imported Strava run${
        input.importedCount === 1 ? "" : "s"
      }`,
    );
  }

  if (input.mergedCount > 0) {
    sourceParts.push(
      `${input.mergedCount} Strava-enriched app run${
        input.mergedCount === 1 ? "" : "s"
      }`,
    );
  }

  if (input.manualCount > 0) {
    sourceParts.push(
      `${input.manualCount} manual fallback week${
        input.manualCount === 1 ? "" : "s"
      }`,
    );
  }

  if (sourceParts.length > 0 && input.coverage === "complete") {
    return `Using ${joinList(sourceParts)} for six-week history.`;
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

function hasPositiveNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function hasSimilarDistance(
  appDistanceKm: number | null,
  stravaDistanceKm: number | null,
): boolean {
  if (!hasPositiveNumber(appDistanceKm) || !hasPositiveNumber(stravaDistanceKm)) {
    return false;
  }

  const toleranceKm = Math.max(0.2, Math.max(appDistanceKm, stravaDistanceKm) * 0.03);

  return Math.abs(appDistanceKm - stravaDistanceKm) <= toleranceKm;
}

function hasSimilarDuration(
  appDurationSec: number | null,
  stravaDurationSec: number | null,
): boolean {
  if (!hasPositiveNumber(appDurationSec) || !hasPositiveNumber(stravaDurationSec)) {
    return false;
  }

  const toleranceSec = Math.max(
    180,
    Math.max(appDurationSec, stravaDurationSec) * 0.05,
  );

  return Math.abs(appDurationSec - stravaDurationSec) <= toleranceSec;
}

function calculateAveragePaceSecPerKm(
  distanceKm: number | null,
  durationSec: number | null,
): number | null {
  if (!hasPositiveNumber(distanceKm) || !hasPositiveNumber(durationSec)) {
    return null;
  }

  return Math.round(durationSec / distanceKm);
}

function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 10) / 10;
}

function fillMissingHistoryWeeksWithManual(
  loggedWeeks: RecentTrainingWeekInput[],
  manualWeeks: RecentTrainingWeekInput[],
): RecentTrainingWeekInput[] {
  return loggedWeeks.map((loggedWeek, index) => {
    if (loggedWeek.run_count > 0) {
      return loggedWeek;
    }

    const manualWeek = manualWeeks[index];

    if (!manualWeek || manualWeek.run_count <= 0) {
      return loggedWeek;
    }

    return {
      ...manualWeek,
      week_start_date: loggedWeek.week_start_date,
      week_end_date: loggedWeek.week_end_date,
      source: "manual",
    };
  });
}

function addHistoryMergeAuditMetadata(
  rawSummary: Record<string, unknown>,
  input: {
    loggedWorkoutId: string;
    plannedWorkoutId: string | null;
    reason: string;
  },
): Record<string, unknown> {
  return {
    ...rawSummary,
    history_merge: {
      source: "app_log",
      logged_workout_id: input.loggedWorkoutId,
      planned_workout_id: input.plannedWorkoutId,
      reason: input.reason,
      merged_at: new Date().toISOString(),
    },
  };
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
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
