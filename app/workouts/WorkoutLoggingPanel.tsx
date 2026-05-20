"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { StravaImportSummary } from "@/components/StravaImportSummary";
import {
  deletePlanAdjustmentsForLoggedWorkout,
  fetchPlanAdjustmentsAffectingWorkouts,
  fetchPlanAdjustmentsForLoggedWorkout,
  fetchPlanAdjustmentsForLoggedWorkouts,
  restoreFuturePlannedWorkoutsFromRollbackUpdates,
} from "@/lib/db/planAdjustments";
import {
  fetchIntervalsWorkoutSyncsForTrainingPlan,
  markSyncedIntervalsWorkoutSyncsNeedsResync,
} from "@/lib/db/intervalsWorkoutSyncs";
import {
  fetchWorkoutExportsForTrainingPlan,
  markSyncedGarminWorkoutExportsStale,
} from "@/lib/db/workoutExports";
import { fetchFirstProfile } from "@/lib/db/profiles";
import { fetchRaceGoalById } from "@/lib/db/raceGoals";
import { fetchActiveTrainingPlanWithWorkouts } from "@/lib/db/trainingPlans";
import {
  deleteLoggedWorkout,
  deleteWorkoutEvaluationsForLoggedWorkout,
  fetchLoggedWorkoutsForPlannedWorkout,
  fetchLoggedWorkoutsForTrainingPlan,
  fetchWorkoutEvaluationsForTrainingPlan,
  markPlannedWorkoutPlanned,
  type SaveLoggedWorkoutInput,
} from "@/lib/db/workouts";
import {
  getDefaultIntervalsBulkPublishWorkoutIds,
  isWorkoutInIntervalsBulkPublishWindow,
  type IntervalsBulkPublishWindowDays,
} from "@/lib/intervals/publishSelection";
import {
  buildPlanAdjustmentByLoggedWorkoutId,
  formatAdjustmentTypeLabel,
  formatAffectedWorkoutLabels,
} from "@/lib/training/planAdjustmentDisplay";
import {
  buildRollbackUpdatesFromAdjustments,
  filterRollbackUpdatesBlockedByNewerAdjustments,
} from "@/lib/training/planAdjustmentRollback";
import { saveLoggedWorkoutWithCompletion } from "@/lib/training/workoutLogging";
import type {
  LoggedWorkout,
  LoggedWorkoutType,
  PlanAdjustment,
  PlannedWorkout,
  WorkoutEvaluation,
  Profile,
  RaceGoal,
  TrainingPlan,
  WorkoutType,
  IntervalsBulkPublishWorkoutsResponse,
  IntervalsPublishWorkoutResult,
  IntervalsWorkoutSync,
  IntervalsWorkoutSyncStatus,
  StravaImportDays,
  StravaImportResponse,
  StravaStatusResponse,
  WorkoutExport,
  WorkoutExportSyncStatus,
} from "@/types";

type DeleteWorkoutRollbackResult = {
  hadPlanChangingAdjustment: boolean;
  restoredWorkoutCount: number;
  needsRegenerationWarning: boolean;
  syncInvalidationWarning: string | null;
};

type LoadStatus =
  | "loading"
  | "ready"
  | "saving"
  | "deleting"
  | "publishing"
  | "error"
  | "saved";

type PublishWorkoutResponse = {
  ok: boolean;
  message: string;
};

type GarminBridgeStatusResponse = {
  ok: boolean;
  enabled: boolean;
  status: string;
  message: string;
};

type StravaLoadState = "loading" | "ready" | "error";

type GarminTargetSummary = {
  target_type: string;
  target_min: number | null;
  target_max: number | null;
  target_unit: string | null;
  display: string;
};

type GarminPreviewResponse = {
  ok: boolean;
  target_summary: GarminTargetSummary;
  step_count: number;
  repeat_count: number;
  pace_target_count: number;
  hr_target_count: number;
  warnings: string[];
  error: string | null;
  garmin_payload_preview: Record<string, unknown> | null;
};

type GarminPreviewApiResponse = {
  ok: boolean;
  status: string;
  plannedWorkoutId: string;
  message: string;
  preview: GarminPreviewResponse | null;
};

type GarminPublishResponse = {
  ok: boolean;
  status: string;
  plannedWorkoutId: string;
  message: string;
  publish: {
    ok: boolean;
    status: string;
    garmin_workout_id: string | null;
    garmin_schedule_id: string | null;
    scheduled_date: string | null;
    warnings: string[];
    error: string | null;
    target_summary: GarminTargetSummary;
  } | null;
  exportRecord: WorkoutExport | null;
  trackingError: string | null;
};

type GarminDeleteResponse = {
  ok: boolean;
  status: string;
  plannedWorkoutId: string;
  message: string;
  deleteResult: {
    ok: boolean;
    status: string;
    planned_workout_id: string;
    garmin_workout_id: string;
    warnings: string[];
    error: string | null;
  } | null;
  exportRecord: WorkoutExport | null;
  trackingError: string | null;
};

type GarminUpdateResponse = {
  ok: boolean;
  status: string;
  plannedWorkoutId: string;
  message: string;
  deleteResult: GarminDeleteResponse["deleteResult"];
  publish: GarminPublishResponse["publish"];
  exportRecord: WorkoutExport | null;
  oldExportRecord: WorkoutExport | null;
  trackingError: string | null;
};

type BulkPublishSelectionState = {
  defaultKey: string;
  selectedWorkoutIds: string[];
};

type WorkoutsState = {
  profile: Profile | null;
  raceGoal: RaceGoal | null;
  plan: TrainingPlan | null;
  plannedWorkouts: PlannedWorkout[];
  loggedWorkouts: LoggedWorkout[];
  workoutEvaluations: WorkoutEvaluation[];
  planAdjustments: PlanAdjustment[];
  intervalsWorkoutSyncs: IntervalsWorkoutSync[];
  workoutExports: WorkoutExport[];
};

type FormState = {
  planned_workout_id: string;
  workout_date: string;
  distance_km: string;
  duration_hours: string;
  duration_minutes: string;
  duration_seconds: string;
  avg_heart_rate: string;
  max_heart_rate: string;
  cadence: string;
  elevation_gain_m: string;
  rpe: string;
  notes: string;
};

const emptyState: WorkoutsState = {
  profile: null,
  raceGoal: null,
  plan: null,
  plannedWorkouts: [],
  loggedWorkouts: [],
  workoutEvaluations: [],
  planAdjustments: [],
  intervalsWorkoutSyncs: [],
  workoutExports: [],
};

const emptyForm: FormState = {
  planned_workout_id: "",
  workout_date: "",
  distance_km: "",
  duration_hours: "",
  duration_minutes: "",
  duration_seconds: "",
  avg_heart_rate: "",
  max_heart_rate: "",
  cadence: "",
  elevation_gain_m: "",
  rpe: "",
  notes: "",
};

const emptyBulkPublishSelection: BulkPublishSelectionState = {
  defaultKey: "",
  selectedWorkoutIds: [],
};

const stravaImportDayOptions: StravaImportDays[] = [7, 14];

const runWorkoutTypes: WorkoutType[] = [
  "easy",
  "long_run",
  "tempo",
  "interval",
  "marathon_pace",
  "recovery",
  "calibration",
];

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100";

const labelClass = "text-sm font-medium text-slate-800";

function isRunRelatedWorkout(workout: PlannedWorkout): boolean {
  return runWorkoutTypes.includes(workout.workout_type);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatPace(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = secondsPerKm % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function formatWorkoutLoad(workout: PlannedWorkout): string {
  if (workout.distance_km !== null && workout.duration_min !== null) {
    return `${workout.distance_km} km / ${workout.duration_min} min`;
  }

  if (workout.distance_km !== null) {
    return `${workout.distance_km} km`;
  }

  if (workout.duration_min !== null) {
    return `${workout.duration_min} min`;
  }

  return "No distance or duration target";
}

function formatTargetPace(workout: PlannedWorkout): string {
  if (
    workout.target_pace_min_sec_per_km === null ||
    workout.target_pace_max_sec_per_km === null
  ) {
    return "No pace target";
  }

  return `${formatPace(workout.target_pace_min_sec_per_km)} - ${formatPace(
    workout.target_pace_max_sec_per_km,
  )}`;
}

function formatDistanceKm(distanceKm: number | null, emptyLabel: string): string {
  return distanceKm !== null ? `${distanceKm} km` : emptyLabel;
}

function formatDurationSeconds(
  durationSec: number | null,
  emptyLabel: string,
): string {
  if (durationSec === null) {
    return emptyLabel;
  }

  const hours = Math.floor(durationSec / 3600);
  const minutes = Math.floor((durationSec % 3600) / 60);
  const seconds = durationSec % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPlannedDuration(workout: PlannedWorkout | null): string {
  return workout?.duration_min !== null && workout?.duration_min !== undefined
    ? `${workout.duration_min} min`
    : "No duration target";
}

function formatPaceFromSeconds(
  paceSecPerKm: number | null,
  emptyLabel: string,
): string {
  return paceSecPerKm !== null && paceSecPerKm > 0
    ? formatPace(paceSecPerKm)
    : emptyLabel;
}

function getRiskBadgeClass(riskLevel: WorkoutEvaluation["risk_level"]): string {
  if (riskLevel === "high") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (riskLevel === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function getPublishResultBadgeClass(ok: boolean): string {
  return ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-red-200 bg-red-50 text-red-800";
}

function getIntervalsSyncStatusLabel(
  sync: IntervalsWorkoutSync | null,
): string {
  if (!sync) {
    return "Not synced";
  }

  if (sync.sync_status === "needs_resync") {
    return "Needs republish";
  }

  return formatLabel(sync.sync_status);
}

function getIntervalsSyncStatusBadgeClass(
  syncStatus: IntervalsWorkoutSyncStatus | "not_synced",
): string {
  if (syncStatus === "synced") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (syncStatus === "needs_resync") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (syncStatus === "failed") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (syncStatus === "deleted") {
    return "border-slate-300 bg-slate-100 text-slate-600";
  }

  return "border-slate-200 bg-white text-slate-600";
}

function getEffectiveGarminExportStatus(
  exportRecord: WorkoutExport | null,
): WorkoutExportSyncStatus | "not_synced" {
  if (!exportRecord) {
    return "not_synced";
  }

  if (
    exportRecord.sync_status === "failed" &&
    exportRecord.provider_workout_id &&
    exportRecord.last_error === "Garmin workout published and scheduled."
  ) {
    return "synced";
  }

  return exportRecord.sync_status;
}

function getGarminExportError(exportRecord: WorkoutExport | null): string | null {
  if (
    exportRecord?.sync_status === "failed" &&
    exportRecord.provider_workout_id &&
    exportRecord.last_error === "Garmin workout published and scheduled."
  ) {
    return null;
  }

  return exportRecord?.last_error ?? null;
}

function getGarminExportStatusLabel(exportRecord: WorkoutExport | null): string {
  if (!exportRecord) {
    return "Not exported";
  }

  const syncStatus = getEffectiveGarminExportStatus(exportRecord);

  if (syncStatus === "partial") {
    return "Partial";
  }

  if (syncStatus === "stale") {
    return "Changed after Garmin export — update if needed";
  }

  if (syncStatus === "not_synced") {
    return "Not exported";
  }

  return formatLabel(syncStatus);
}

function getGarminExportStatusBadgeClass(
  syncStatus: WorkoutExportSyncStatus | "not_synced",
): string {
  if (syncStatus === "synced") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (syncStatus === "partial" || syncStatus === "stale") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (syncStatus === "failed") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (syncStatus === "deleted") {
    return "border-slate-300 bg-slate-100 text-slate-600";
  }

  return "border-slate-200 bg-white text-slate-600";
}

function getGarminExportGuardMessage(
  exportRecord: WorkoutExport | null,
): string | null {
  const syncStatus = getEffectiveGarminExportStatus(exportRecord);

  if (syncStatus === "synced") {
    return "Already published to Garmin.";
  }

  if (syncStatus === "stale") {
    return "Changed after Garmin export — use Update Garmin Export.";
  }

  if (syncStatus === "partial") {
    return "Workout may already exist in Garmin. Delete or update it instead of publishing a duplicate.";
  }

  return null;
}

function getGarminPublishButtonLabel(
  exportRecord: WorkoutExport | null,
  isPublishing: boolean,
): string {
  if (isPublishing) {
    return "Publishing...";
  }

  const syncStatus = getEffectiveGarminExportStatus(exportRecord);

  if (syncStatus === "synced") {
    return "Already exported to Garmin";
  }

  if (syncStatus === "stale") {
    return "Use Update Garmin Export";
  }

  if (syncStatus === "partial") {
    return "Delete or update Garmin export";
  }

  return "Publish Direct to Garmin (Experimental)";
}

function getPlanAdjustmentStatusLabel(
  adjustment: PlanAdjustment | null,
): string {
  if (!adjustment) {
    return "No adjustment record";
  }

  if (adjustment.adjustment_type === "none") {
    return "Plan unchanged";
  }

  return "Plan adjusted";
}

function getPlanAdjustmentStatusBadgeClass(
  adjustment: PlanAdjustment | null,
): string {
  if (!adjustment) {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  if (adjustment.adjustment_type === "none") {
    return "border-slate-200 bg-white text-slate-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-800";
}

function buildLoggedWorkoutIdSet(loggedWorkouts: LoggedWorkout[]): Set<string> {
  return new Set(
    loggedWorkouts
      .map((loggedWorkout) => loggedWorkout.planned_workout_id)
      .filter((plannedWorkoutId): plannedWorkoutId is string =>
        Boolean(plannedWorkoutId),
      ),
  );
}

function buildPlannedWorkoutById(
  plannedWorkouts: PlannedWorkout[],
): Map<string, PlannedWorkout> {
  return new Map(plannedWorkouts.map((workout) => [workout.id, workout]));
}

function buildEvaluationByLoggedWorkoutId(
  evaluations: WorkoutEvaluation[],
): Map<string, WorkoutEvaluation> {
  const evaluationByLoggedWorkoutId = new Map<string, WorkoutEvaluation>();

  for (const evaluation of evaluations) {
    if (!evaluationByLoggedWorkoutId.has(evaluation.logged_workout_id)) {
      evaluationByLoggedWorkoutId.set(evaluation.logged_workout_id, evaluation);
    }
  }

  return evaluationByLoggedWorkoutId;
}

function buildLoggedWorkoutByPlannedWorkoutId(
  loggedWorkouts: LoggedWorkout[],
): Map<string, LoggedWorkout> {
  const loggedWorkoutByPlannedWorkoutId = new Map<string, LoggedWorkout>();

  for (const loggedWorkout of loggedWorkouts) {
    if (loggedWorkout.planned_workout_id) {
      loggedWorkoutByPlannedWorkoutId.set(
        loggedWorkout.planned_workout_id,
        loggedWorkout,
      );
    }
  }

  return loggedWorkoutByPlannedWorkoutId;
}

function buildIntervalsWorkoutSyncByPlannedWorkoutId(
  syncs: IntervalsWorkoutSync[],
): Map<string, IntervalsWorkoutSync> {
  return new Map(syncs.map((sync) => [sync.planned_workout_id, sync]));
}

function buildLatestGarminExportByPlannedWorkoutId(
  workoutExports: WorkoutExport[],
): Map<string, WorkoutExport> {
  const exportByPlannedWorkoutId = new Map<string, WorkoutExport>();

  for (const workoutExport of workoutExports) {
    if (
      workoutExport.export_provider !== "garmin_direct" ||
      !workoutExport.planned_workout_id
    ) {
      continue;
    }

    const currentExport = exportByPlannedWorkoutId.get(
      workoutExport.planned_workout_id,
    );

    if (
      !currentExport ||
      workoutExport.created_at.localeCompare(currentExport.created_at) > 0
    ) {
      exportByPlannedWorkoutId.set(
        workoutExport.planned_workout_id,
        workoutExport,
      );
    }
  }

  return exportByPlannedWorkoutId;
}

function addWorkoutExportRecordIfPresent(
  workoutExports: WorkoutExport[],
  exportRecord: WorkoutExport | null,
): WorkoutExport[] {
  if (!exportRecord) {
    return workoutExports;
  }

  if (workoutExports.some((currentExport) => currentExport.id === exportRecord.id)) {
    return workoutExports;
  }

  return [exportRecord, ...workoutExports];
}

function replaceWorkoutExportRecordIfPresent(
  workoutExports: WorkoutExport[],
  exportRecord: WorkoutExport | null,
): WorkoutExport[] {
  if (!exportRecord) {
    return workoutExports;
  }

  let didReplace = false;
  const nextWorkoutExports = workoutExports.map((currentExport) => {
    if (currentExport.id !== exportRecord.id) {
      return currentExport;
    }

    didReplace = true;
    return exportRecord;
  });

  return didReplace ? nextWorkoutExports : [exportRecord, ...workoutExports];
}

function mergeWorkoutExportRecords(
  workoutExports: WorkoutExport[],
  exportRecords: Array<WorkoutExport | null>,
): WorkoutExport[] {
  return exportRecords.reduce(
    (currentExports, exportRecord) =>
      replaceWorkoutExportRecordIfPresent(currentExports, exportRecord),
    workoutExports,
  );
}

function addLoggedWorkoutIfMissing(
  loggedWorkouts: LoggedWorkout[],
  loggedWorkout: LoggedWorkout,
): LoggedWorkout[] {
  if (loggedWorkouts.some((currentLog) => currentLog.id === loggedWorkout.id)) {
    return loggedWorkouts;
  }

  return [...loggedWorkouts, loggedWorkout];
}

async function markUpdatedIntervalsSyncsNeedsResync(
  updatedWorkouts: PlannedWorkout[],
): Promise<string | null> {
  if (updatedWorkouts.length === 0) {
    return null;
  }

  try {
    await markSyncedIntervalsWorkoutSyncsNeedsResync(
      updatedWorkouts.map((workout) => workout.id),
    );

    return null;
  } catch (error) {
    return error instanceof Error
      ? ` Intervals.icu sync status could not be marked stale: ${error.message}`
      : " Intervals.icu sync status could not be marked stale.";
  }
}

async function markUpdatedGarminExportsStale(
  updatedWorkouts: PlannedWorkout[],
): Promise<string | null> {
  if (updatedWorkouts.length === 0) {
    return null;
  }

  try {
    await markSyncedGarminWorkoutExportsStale(
      updatedWorkouts.map((workout) => workout.id),
    );

    return null;
  } catch (error) {
    return error instanceof Error
      ? ` Direct Garmin export status could not be marked stale: ${error.message}`
      : " Direct Garmin export status could not be marked stale.";
  }
}

function combineSyncWarnings(...warnings: Array<string | null>): string {
  return warnings.filter((warning): warning is string => Boolean(warning)).join("");
}

async function rollbackPlanAdjustmentBeforeDeletingWorkout(input: {
  plan: TrainingPlan;
  loggedWorkout: LoggedWorkout;
}): Promise<DeleteWorkoutRollbackResult> {
  const planAdjustments = await fetchPlanAdjustmentsForLoggedWorkout(
    input.loggedWorkout.id,
  );
  const hadPlanChangingAdjustment = planAdjustments.some(
    (adjustment) =>
      adjustment.adjustment_type !== "none" &&
      adjustment.affected_workout_ids.length > 0,
  );
  const rollbackBuildResult =
    buildRollbackUpdatesFromAdjustments(planAdjustments);
  let rollbackUpdates = rollbackBuildResult.rollbackUpdates;
  let needsRegenerationWarning =
    rollbackBuildResult.needsRegenerationWarning;

  if (rollbackUpdates.length > 0) {
    const remainingAdjustments = await fetchPlanAdjustmentsAffectingWorkouts({
      trainingPlanId: input.plan.id,
      affectedWorkoutIds: rollbackUpdates.map(
        (rollbackUpdate) => rollbackUpdate.id,
      ),
    });
    const newerRemainingAdjustments = remainingAdjustments.filter(
      (adjustment) => adjustment.logged_workout_id !== input.loggedWorkout.id,
    );
    const rollbackFilterResult =
      filterRollbackUpdatesBlockedByNewerAdjustments(
        rollbackUpdates,
        newerRemainingAdjustments,
      );

    rollbackUpdates = rollbackFilterResult.rollbackUpdates;
    needsRegenerationWarning =
      needsRegenerationWarning ||
      rollbackFilterResult.skippedWorkoutIds.length > 0;
  }

  if (hadPlanChangingAdjustment && rollbackUpdates.length === 0) {
    return {
      hadPlanChangingAdjustment,
      restoredWorkoutCount: 0,
      needsRegenerationWarning: true,
      syncInvalidationWarning: null,
    };
  }

  try {
    const restoredWorkouts = await restoreFuturePlannedWorkoutsFromRollbackUpdates({
      rollbackUpdates,
      loggedWorkoutDate: input.loggedWorkout.workout_date,
    });
    const [intervalsSyncWarning, garminExportWarning] = await Promise.all([
      markUpdatedIntervalsSyncsNeedsResync(restoredWorkouts),
      markUpdatedGarminExportsStale(restoredWorkouts),
    ]);

    return {
      hadPlanChangingAdjustment,
      restoredWorkoutCount: restoredWorkouts.length,
      needsRegenerationWarning,
      syncInvalidationWarning: combineSyncWarnings(
        intervalsSyncWarning,
        garminExportWarning,
      ),
    };
  } catch {
    return {
      hadPlanChangingAdjustment,
      restoredWorkoutCount: 0,
      needsRegenerationWarning: true,
      syncInvalidationWarning: null,
    };
  }
}

function buildDeletedWorkoutMessage(
  rollbackResult: DeleteWorkoutRollbackResult,
): string {
  const syncInvalidationWarning = rollbackResult.syncInvalidationWarning ?? "";

  if (rollbackResult.needsRegenerationWarning) {
    return `Workout log and score deleted. Planned workout reset when needed. Some plan adjustment changes could not be safely reversed, so regenerate the plan if future workouts look wrong.${syncInvalidationWarning}`;
  }

  if (rollbackResult.restoredWorkoutCount > 0) {
    return `Workout log and score deleted. Planned workout reset when needed. Reversed ${rollbackResult.restoredWorkoutCount} future workout adjustment${rollbackResult.restoredWorkoutCount === 1 ? "" : "s"}.${syncInvalidationWarning}`;
  }

  if (rollbackResult.hadPlanChangingAdjustment) {
    return `Workout log and score deleted. Planned workout reset when needed. No editable future workouts needed rollback.${syncInvalidationWarning}`;
  }

  return `Workout log and score deleted. Planned workout reset when needed. No plan rollback was needed.${syncInvalidationWarning}`;
}

function canLogWorkout(
  workout: PlannedWorkout,
  loggedWorkoutIds: Set<string>,
): boolean {
  return workout.status !== "completed" && !loggedWorkoutIds.has(workout.id);
}

function getFirstLoggableWorkout(
  workouts: PlannedWorkout[],
  loggedWorkoutIds: Set<string>,
): PlannedWorkout | null {
  return (
    workouts.find((workout) => canLogWorkout(workout, loggedWorkoutIds)) ?? null
  );
}

function getWorkoutLogStatus(
  workout: PlannedWorkout,
  loggedWorkoutIds: Set<string>,
): string {
  if (loggedWorkoutIds.has(workout.id)) {
    return "Logged";
  }

  if (workout.status === "completed") {
    return "Completed";
  }

  return formatLabel(workout.status);
}

function getTodayDateText(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function isCurrentOrFuturePlannedWorkout(workout: PlannedWorkout): boolean {
  return workout.status === "planned" && workout.workout_date >= getTodayDateText();
}

function canPublishWorkoutToIntervals(workout: PlannedWorkout | null): boolean {
  return Boolean(
    workout &&
      isCurrentOrFuturePlannedWorkout(workout) &&
      workout.structured_workout,
  );
}

function getIntervalsPublishBlocker(workout: PlannedWorkout | null): string {
  if (!workout) {
    return "Choose one planned workout first.";
  }

  if (workout.status !== "planned") {
    return "Only workouts with planned status can be published.";
  }

  if (workout.workout_date < getTodayDateText()) {
    return "Only today or future planned workouts can be published.";
  }

  if (!workout.structured_workout) {
    return "This workout does not have a structured workout document yet.";
  }

  return "Ready to publish this workout with heart-rate targets.";
}

function optionalText(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

function optionalIntegerInRange(
  value: string,
  label: string,
  min: number,
  max: number,
): number | null {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isInteger(parsedValue)) {
    throw new Error(`${label} must be a whole number.`);
  }

  if (parsedValue < min || parsedValue > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return parsedValue;
}

function optionalDecimal(value: string, label: string): number | null {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`${label} must be a number.`);
  }

  return parsedValue;
}

function requiredPositiveDecimal(value: string, label: string): number {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    throw new Error(`${label} is required.`);
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return parsedValue;
}

function durationPartToInteger(value: string, label: string): number {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return 0;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new Error(`${label} must be a whole number of zero or more.`);
  }

  return parsedValue;
}

function parseDurationSeconds(form: FormState): number {
  const hours = durationPartToInteger(form.duration_hours, "Duration hours");
  const minutes = durationPartToInteger(
    form.duration_minutes,
    "Duration minutes",
  );
  const seconds = durationPartToInteger(
    form.duration_seconds,
    "Duration seconds",
  );

  if (minutes > 59) {
    throw new Error("Duration minutes must be between 0 and 59.");
  }

  if (seconds > 59) {
    throw new Error("Duration seconds must be between 0 and 59.");
  }

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  if (totalSeconds <= 0) {
    throw new Error("Duration must be greater than zero.");
  }

  return totalSeconds;
}

function calculatePreviewPace(form: FormState): number | null {
  const distance = Number(form.distance_km);
  const hours = Number(form.duration_hours || "0");
  const minutes = Number(form.duration_minutes || "0");
  const seconds = Number(form.duration_seconds || "0");

  if (
    !Number.isFinite(distance) ||
    distance <= 0 ||
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    hours < 0 ||
    minutes < 0 ||
    seconds < 0 ||
    minutes > 59 ||
    seconds > 59
  ) {
    return null;
  }

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  if (totalSeconds <= 0) {
    return null;
  }

  return Math.round(totalSeconds / distance);
}

function getLoggedWorkoutType(workout: PlannedWorkout): LoggedWorkoutType {
  return workout.terrain === "treadmill" ? "treadmill_run" : "run";
}

function buildLoggedWorkoutInput(
  form: FormState,
  selectedWorkout: PlannedWorkout | null,
  loggedWorkoutIds: Set<string>,
): SaveLoggedWorkoutInput {
  if (!selectedWorkout) {
    throw new Error("Choose a planned workout to log.");
  }

  if (!isRunRelatedWorkout(selectedWorkout)) {
    throw new Error("Only run-related planned workouts can be logged for now.");
  }

  if (!canLogWorkout(selectedWorkout, loggedWorkoutIds)) {
    throw new Error("This planned workout has already been logged or completed.");
  }

  if (!form.workout_date) {
    throw new Error("Workout date is required.");
  }

  const distanceKm = requiredPositiveDecimal(form.distance_km, "Distance");
  const durationSec = parseDurationSeconds(form);
  const avgPaceSecPerKm = Math.round(durationSec / distanceKm);
  const avgHeartRate = optionalIntegerInRange(
    form.avg_heart_rate,
    "Average heart rate",
    40,
    250,
  );
  const maxHeartRate = optionalIntegerInRange(
    form.max_heart_rate,
    "Max heart rate",
    40,
    250,
  );

  if (
    avgHeartRate !== null &&
    maxHeartRate !== null &&
    avgHeartRate > maxHeartRate
  ) {
    throw new Error("Average heart rate cannot be higher than max heart rate.");
  }

  return {
    profile_id: selectedWorkout.profile_id,
    race_goal_id: selectedWorkout.race_goal_id,
    training_plan_id: selectedWorkout.training_plan_id,
    planned_workout_id: selectedWorkout.id,
    workout_date: form.workout_date,
    workout_type: getLoggedWorkoutType(selectedWorkout),
    source: "manual",
    source_activity_id: null,
    distance_km: Number(distanceKm.toFixed(2)),
    duration_sec: durationSec,
    avg_pace_sec_per_km: avgPaceSecPerKm,
    avg_heart_rate: avgHeartRate,
    max_heart_rate: maxHeartRate,
    cadence: optionalIntegerInRange(form.cadence, "Cadence", 1, 300),
    elevation_gain_m: optionalDecimal(
      form.elevation_gain_m,
      "Elevation gain",
    ),
    rpe: optionalIntegerInRange(form.rpe, "RPE", 1, 10),
    notes: optionalText(form.notes),
  };
}

function resetFormForWorkout(workout: PlannedWorkout | null): FormState {
  return {
    ...emptyForm,
    planned_workout_id: workout?.id ?? "",
    workout_date: workout?.workout_date ?? "",
  };
}

export function WorkoutLoggingPanel() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [workoutsState, setWorkoutsState] = useState<WorkoutsState>(emptyState);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingDeleteLogId, setPendingDeleteLogId] = useState<string | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [publishingWorkoutId, setPublishingWorkoutId] = useState<string | null>(
    null,
  );
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [bulkPublishWindowDays, setBulkPublishWindowDays] =
    useState<IntervalsBulkPublishWindowDays>(7);
  const [bulkPublishSelection, setBulkPublishSelection] =
    useState<BulkPublishSelectionState>(emptyBulkPublishSelection);
  const [bulkPublishResults, setBulkPublishResults] = useState<
    IntervalsPublishWorkoutResult[]
  >([]);
  const [stravaLoadState, setStravaLoadState] =
    useState<StravaLoadState>("loading");
  const [stravaStatus, setStravaStatus] =
    useState<StravaStatusResponse | null>(null);
  const [stravaImportDays, setStravaImportDays] =
    useState<StravaImportDays>(7);
  const [stravaImporting, setStravaImporting] = useState(false);
  const [stravaImportSummary, setStravaImportSummary] =
    useState<StravaImportResponse | null>(null);
  const [stravaMessage, setStravaMessage] = useState<string | null>(null);
  const [garminBridgeStatus, setGarminBridgeStatus] =
    useState<GarminBridgeStatusResponse | null>(null);
  const [garminPreviewingWorkoutId, setGarminPreviewingWorkoutId] =
    useState<string | null>(null);
  const [garminPublishingWorkoutId, setGarminPublishingWorkoutId] =
    useState<string | null>(null);
  const [garminDeletingWorkoutId, setGarminDeletingWorkoutId] =
    useState<string | null>(null);
  const [garminUpdatingWorkoutId, setGarminUpdatingWorkoutId] =
    useState<string | null>(null);
  const [garminPreviewResult, setGarminPreviewResult] =
    useState<GarminPreviewApiResponse | null>(null);
  const [garminPublishResult, setGarminPublishResult] =
    useState<GarminPublishResponse | null>(null);
  const [garminDeleteResult, setGarminDeleteResult] =
    useState<GarminDeleteResponse | null>(null);
  const [garminUpdateResult, setGarminUpdateResult] =
    useState<GarminUpdateResponse | null>(null);

  const loadGarminBridgeStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/garmin/status");
      const result = (await response.json()) as GarminBridgeStatusResponse;

      setGarminBridgeStatus(result);
    } catch {
      setGarminBridgeStatus({
        ok: false,
        enabled: true,
        status: "BRIDGE_UNAVAILABLE",
        message: "Local Garmin bridge is not running.",
      });
    }
  }, []);

  const loadStravaStatus = useCallback(async () => {
    setStravaLoadState("loading");

    try {
      const response = await fetch("/api/strava/status");
      const result = (await response.json()) as StravaStatusResponse;

      if (!response.ok) {
        throw new Error(result.message || "Could not load Strava status.");
      }

      setStravaStatus(result);
      setStravaMessage(result.message);
      setStravaLoadState("ready");
    } catch (error) {
      setStravaStatus(null);
      setStravaMessage(
        error instanceof Error ? error.message : "Could not load Strava status.",
      );
      setStravaLoadState("error");
    }
  }, []);

  const loadWorkouts = useCallback(async (successMessage?: string) => {
    try {
      const profile = await fetchFirstProfile();

      if (!profile) {
        setWorkoutsState(emptyState);
        setForm(emptyForm);
        setBulkPublishing(false);
        setBulkPublishResults([]);
        setStravaImporting(false);
        setMessage(successMessage ?? "Create and save a Profile first.");
        setStatus("ready");
        return;
      }

      const activePlan = await fetchActiveTrainingPlanWithWorkouts(profile.id);

      if (!activePlan) {
        setWorkoutsState({
          profile,
          raceGoal: null,
          plan: null,
          plannedWorkouts: [],
          loggedWorkouts: [],
          workoutEvaluations: [],
          planAdjustments: [],
          intervalsWorkoutSyncs: [],
          workoutExports: [],
        });
        setForm(emptyForm);
        setBulkPublishing(false);
        setBulkPublishResults([]);
        setStravaImporting(false);
        setMessage(
          successMessage ??
            "Generate or select an active training plan on the Plan page before logging workouts.",
        );
        setStatus("ready");
        return;
      }

      const [
        raceGoal,
        loggedWorkouts,
        workoutEvaluations,
        intervalsWorkoutSyncs,
        workoutExports,
      ] = await Promise.all([
        fetchRaceGoalById(activePlan.plan.race_goal_id),
        fetchLoggedWorkoutsForTrainingPlan(activePlan.plan.id),
        fetchWorkoutEvaluationsForTrainingPlan(activePlan.plan.id),
        fetchIntervalsWorkoutSyncsForTrainingPlan(activePlan.plan.id),
        fetchWorkoutExportsForTrainingPlan(activePlan.plan.id),
      ]);
      const planAdjustments = await fetchPlanAdjustmentsForLoggedWorkouts(
        loggedWorkouts.map((loggedWorkout) => loggedWorkout.id),
      );
      const runWorkouts = activePlan.workouts.filter(isRunRelatedWorkout);
      const loggedWorkoutIds = buildLoggedWorkoutIdSet(loggedWorkouts);
      const firstLoggableWorkout = getFirstLoggableWorkout(
        runWorkouts,
        loggedWorkoutIds,
      );

      setWorkoutsState({
        profile,
        raceGoal,
        plan: activePlan.plan,
        plannedWorkouts: activePlan.workouts,
        loggedWorkouts,
        workoutEvaluations,
        planAdjustments,
        intervalsWorkoutSyncs,
        workoutExports,
      });
      setPendingDeleteLogId(null);
      setDeletingLogId(null);
      setPublishingWorkoutId(null);
      setGarminPreviewingWorkoutId(null);
      setGarminPublishingWorkoutId(null);
      setGarminDeletingWorkoutId(null);
      setGarminUpdatingWorkoutId(null);
      setBulkPublishing(false);
      setStravaImporting(false);
      setForm(resetFormForWorkout(firstLoggableWorkout));
      setMessage(
        successMessage ??
          (runWorkouts.length > 0
            ? "Loaded planned run workouts."
            : "No run-related planned workouts are available in the active plan."),
      );
      setStatus(successMessage ? "saved" : "ready");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load planned workouts.",
      );
      setBulkPublishing(false);
      setStravaImporting(false);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadWorkouts());
  }, [loadWorkouts]);

  useEffect(() => {
    void Promise.resolve().then(() => loadGarminBridgeStatus());
  }, [loadGarminBridgeStatus]);

  useEffect(() => {
    void Promise.resolve().then(() => loadStravaStatus());
  }, [loadStravaStatus]);

  const runWorkouts = useMemo(
    () => workoutsState.plannedWorkouts.filter(isRunRelatedWorkout),
    [workoutsState.plannedWorkouts],
  );
  const todayDateText = getTodayDateText();
  const bulkPublishWindowWorkouts = useMemo(
    () =>
      runWorkouts.filter((workout) =>
        isWorkoutInIntervalsBulkPublishWindow(
          workout,
          todayDateText,
          bulkPublishWindowDays,
        ),
      ),
    [bulkPublishWindowDays, runWorkouts, todayDateText],
  );
  const defaultBulkPublishWorkoutIds = useMemo(
    () =>
      getDefaultIntervalsBulkPublishWorkoutIds(
        runWorkouts,
        todayDateText,
        bulkPublishWindowDays,
      ),
    [bulkPublishWindowDays, runWorkouts, todayDateText],
  );
  const defaultBulkPublishWorkoutIdKey =
    defaultBulkPublishWorkoutIds.join("|");
  const selectedBulkPublishWorkoutIds =
    bulkPublishSelection.defaultKey === defaultBulkPublishWorkoutIdKey
      ? bulkPublishSelection.selectedWorkoutIds
      : defaultBulkPublishWorkoutIds;
  const selectedBulkPublishWorkoutIdSet = useMemo(
    () => new Set(selectedBulkPublishWorkoutIds),
    [selectedBulkPublishWorkoutIds],
  );
  const loggedWorkoutIds = useMemo(
    () => buildLoggedWorkoutIdSet(workoutsState.loggedWorkouts),
    [workoutsState.loggedWorkouts],
  );
  const selectedWorkout = useMemo(
    () =>
      runWorkouts.find(
        (workout) => workout.id === form.planned_workout_id,
      ) ?? null,
    [form.planned_workout_id, runWorkouts],
  );
  const plannedWorkoutById = useMemo(
    () => buildPlannedWorkoutById(workoutsState.plannedWorkouts),
    [workoutsState.plannedWorkouts],
  );
  const evaluationByLoggedWorkoutId = useMemo(
    () => buildEvaluationByLoggedWorkoutId(workoutsState.workoutEvaluations),
    [workoutsState.workoutEvaluations],
  );
  const loggedWorkoutByPlannedWorkoutId = useMemo(
    () => buildLoggedWorkoutByPlannedWorkoutId(workoutsState.loggedWorkouts),
    [workoutsState.loggedWorkouts],
  );
  const intervalsWorkoutSyncByPlannedWorkoutId = useMemo(
    () =>
      buildIntervalsWorkoutSyncByPlannedWorkoutId(
        workoutsState.intervalsWorkoutSyncs,
      ),
    [workoutsState.intervalsWorkoutSyncs],
  );
  const garminExportByPlannedWorkoutId = useMemo(
    () => buildLatestGarminExportByPlannedWorkoutId(workoutsState.workoutExports),
    [workoutsState.workoutExports],
  );
  const adjustmentByLoggedWorkoutId = useMemo(
    () => buildPlanAdjustmentByLoggedWorkoutId(workoutsState.planAdjustments),
    [workoutsState.planAdjustments],
  );
  const workoutHistory = useMemo(
    () =>
      [...workoutsState.loggedWorkouts].sort((firstWorkout, secondWorkout) =>
        secondWorkout.workout_date.localeCompare(firstWorkout.workout_date),
      ),
    [workoutsState.loggedWorkouts],
  );

  const previewPaceSecPerKm = calculatePreviewPace(form);
  const isSaving = status === "saving";
  const isDeleting = deletingLogId !== null;
  const isGarminBusy =
    garminPreviewingWorkoutId !== null ||
    garminPublishingWorkoutId !== null ||
    garminDeletingWorkoutId !== null ||
    garminUpdatingWorkoutId !== null;
  const isPublishing =
    publishingWorkoutId !== null ||
    bulkPublishing ||
    isGarminBusy ||
    stravaImporting;
  const isBusy = isSaving || isDeleting || isPublishing;
  const isStravaConnected = stravaStatus?.connected === true;
  const isGarminBridgeConfigured = garminBridgeStatus?.enabled === true;
  const selectedWorkoutIntervalsSync = selectedWorkout
    ? intervalsWorkoutSyncByPlannedWorkoutId.get(selectedWorkout.id) ?? null
    : null;
  const selectedWorkoutGarminExport = selectedWorkout
    ? garminExportByPlannedWorkoutId.get(selectedWorkout.id) ?? null
    : null;
  const selectedWorkoutGarminEffectiveStatus =
    getEffectiveGarminExportStatus(selectedWorkoutGarminExport);
  const selectedWorkoutGarminGuardMessage = getGarminExportGuardMessage(
    selectedWorkoutGarminExport,
  );
  const canDeleteSelectedWorkoutFromGarmin =
    Boolean(selectedWorkoutGarminExport?.provider_workout_id) &&
    (selectedWorkoutGarminEffectiveStatus === "synced" ||
      selectedWorkoutGarminEffectiveStatus === "stale" ||
      selectedWorkoutGarminEffectiveStatus === "partial");
  const canUpdateSelectedGarminExport =
    Boolean(selectedWorkoutGarminExport?.provider_workout_id) &&
    selectedWorkoutGarminEffectiveStatus === "stale";
  const canPreviewSelectedWorkoutToGarmin =
    canPublishWorkoutToIntervals(selectedWorkout);
  const canPublishSelectedWorkout =
    canPreviewSelectedWorkoutToGarmin &&
    selectedWorkoutGarminEffectiveStatus !== "synced" &&
    selectedWorkoutGarminEffectiveStatus !== "stale" &&
    selectedWorkoutGarminEffectiveStatus !== "partial";
  const canBulkPublishWorkouts =
    selectedBulkPublishWorkoutIds.length > 0 && workoutsState.plan !== null;

  function handleSelectWorkout(workout: PlannedWorkout) {
    setForm({
      ...form,
      planned_workout_id: workout.id,
      workout_date: workout.workout_date,
    });
    setGarminPreviewResult(null);
    setGarminPublishResult(null);
    setGarminDeleteResult(null);
    setGarminUpdateResult(null);
  }

  function handleBulkPublishWindowChange(
    windowDays: IntervalsBulkPublishWindowDays,
  ) {
    setBulkPublishWindowDays(windowDays);
    setBulkPublishResults([]);
  }

  function handleToggleBulkPublishWorkout(plannedWorkoutId: string) {
    setBulkPublishResults([]);
    setBulkPublishSelection((currentSelection) => {
      const currentIds =
        currentSelection.defaultKey === defaultBulkPublishWorkoutIdKey
          ? currentSelection.selectedWorkoutIds
          : defaultBulkPublishWorkoutIds;

      return {
        defaultKey: defaultBulkPublishWorkoutIdKey,
        selectedWorkoutIds: currentIds.includes(plannedWorkoutId)
          ? currentIds.filter((currentId) => currentId !== plannedWorkoutId)
          : [...currentIds, plannedWorkoutId],
      };
    });
  }

  async function handlePublishSelectedWorkout() {
    if (!selectedWorkout) {
      setStatus("error");
      setMessage("Choose one planned workout before publishing.");
      return;
    }

    if (!canPublishWorkoutToIntervals(selectedWorkout)) {
      setStatus("error");
      setMessage(getIntervalsPublishBlocker(selectedWorkout));
      return;
    }

    setPublishingWorkoutId(selectedWorkout.id);
    setStatus("publishing");
    setMessage(null);

    try {
      const response = await fetch("/api/intervals/publish-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plannedWorkoutId: selectedWorkout.id,
        }),
      });
      const result = (await response.json()) as PublishWorkoutResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Intervals.icu publish failed.");
      }

      await loadWorkouts(result.message);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not publish workout to Intervals.icu.",
      );
    } finally {
      setPublishingWorkoutId(null);
    }
  }

  async function handlePreviewGarminExport() {
    if (!selectedWorkout) {
      setStatus("error");
      setMessage("Choose one planned workout before previewing Garmin export.");
      return;
    }

    if (!canPublishWorkoutToIntervals(selectedWorkout)) {
      setStatus("error");
      setMessage(getIntervalsPublishBlocker(selectedWorkout));
      return;
    }

    setGarminPreviewingWorkoutId(selectedWorkout.id);
    setGarminPreviewResult(null);
    setGarminPublishResult(null);
    setGarminDeleteResult(null);
    setGarminUpdateResult(null);
    setMessage(null);

    try {
      const response = await fetch("/api/garmin/preview-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plannedWorkoutId: selectedWorkout.id,
        }),
      });
      const result = (await response.json()) as GarminPreviewApiResponse;

      setGarminPreviewResult(result);
      setStatus(result.ok ? "saved" : "error");
      setMessage(result.message);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not preview direct Garmin export.",
      );
    } finally {
      setGarminPreviewingWorkoutId(null);
    }
  }

  async function handlePublishGarminExport() {
    if (!selectedWorkout) {
      setStatus("error");
      setMessage("Choose one planned workout before publishing to Garmin.");
      return;
    }

    if (!canPublishWorkoutToIntervals(selectedWorkout)) {
      setStatus("error");
      setMessage(getIntervalsPublishBlocker(selectedWorkout));
      return;
    }

    if (
      selectedWorkoutGarminEffectiveStatus === "synced" ||
      selectedWorkoutGarminEffectiveStatus === "stale" ||
      selectedWorkoutGarminEffectiveStatus === "partial"
    ) {
      setStatus("error");
      setMessage(
        selectedWorkoutGarminGuardMessage ??
          "This workout is already exported to Garmin.",
      );
      return;
    }

    const confirmationMessages = [
      "This uses an unofficial local Garmin Connect bridge. It runs only on your laptop and may break if Garmin changes internal APIs.",
    ];

    if (selectedWorkoutGarminGuardMessage) {
      confirmationMessages.push(selectedWorkoutGarminGuardMessage);
    }

    const confirmed = window.confirm(confirmationMessages.join("\n\n"));

    if (!confirmed) {
      return;
    }

    setGarminPublishingWorkoutId(selectedWorkout.id);
    setGarminPublishResult(null);
    setGarminDeleteResult(null);
    setGarminUpdateResult(null);
    setMessage(null);
    setStatus("publishing");

    try {
      const response = await fetch("/api/garmin/publish-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plannedWorkoutId: selectedWorkout.id,
        }),
      });
      const result = (await response.json()) as GarminPublishResponse;

      setGarminPublishResult(result);
      setMessage(result.message);
      setStatus(result.ok ? "saved" : "error");

      if (result.exportRecord) {
        setWorkoutsState((currentState) => ({
          ...currentState,
          workoutExports: addWorkoutExportRecordIfPresent(
            currentState.workoutExports,
            result.exportRecord,
          ),
        }));
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not publish direct Garmin export.",
      );
    } finally {
      setGarminPublishingWorkoutId(null);
    }
  }

  async function handleDeleteGarminExport() {
    if (!selectedWorkout) {
      setStatus("error");
      setMessage("Choose one planned workout before deleting from Garmin.");
      return;
    }

    if (!canDeleteSelectedWorkoutFromGarmin) {
      setStatus("error");
      setMessage(
        "Delete from Garmin is only available for synced, stale, or partial direct Garmin exports with a Garmin workout ID.",
      );
      return;
    }

    const confirmationMessages = [
      "This will ask the local Garmin bridge to delete this workout from Garmin.",
      "It will not delete the planned workout from this app.",
      "After deletion, confirm the workout is gone in Garmin Connect and on your watch.",
    ];

    if (selectedWorkoutGarminGuardMessage) {
      confirmationMessages.push(selectedWorkoutGarminGuardMessage);
    }

    const confirmed = window.confirm(confirmationMessages.join("\n\n"));

    if (!confirmed) {
      return;
    }

    setGarminDeletingWorkoutId(selectedWorkout.id);
    setGarminDeleteResult(null);
    setGarminUpdateResult(null);
    setMessage(null);
    setStatus("publishing");

    try {
      const response = await fetch("/api/garmin/delete-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plannedWorkoutId: selectedWorkout.id,
        }),
      });
      const result = (await response.json()) as GarminDeleteResponse;
      const trackingSucceeded =
        result.exportRecord !== null &&
        (result.status === "DELETED" || result.status === "UNSCHEDULED_ONLY");

      setGarminDeleteResult(result);
      setMessage(result.message);
      setStatus(result.ok || trackingSucceeded ? "saved" : "error");

      if (result.exportRecord) {
        setWorkoutsState((currentState) => ({
          ...currentState,
          workoutExports: replaceWorkoutExportRecordIfPresent(
            currentState.workoutExports,
            result.exportRecord,
          ),
        }));
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not delete direct Garmin export.",
      );
    } finally {
      setGarminDeletingWorkoutId(null);
    }
  }

  async function handleUpdateGarminExport() {
    if (!selectedWorkout) {
      setStatus("error");
      setMessage("Choose one planned workout before updating Garmin export.");
      return;
    }

    if (!canUpdateSelectedGarminExport) {
      setStatus("error");
      setMessage(
        "Update Garmin Export is only available for stale direct Garmin exports with a Garmin workout ID.",
      );
      return;
    }

    const confirmed = window.confirm(
      "This will try to remove the old Garmin workout and publish the current app version. If Garmin removal fails, a duplicate may remain in Garmin.",
    );

    if (!confirmed) {
      return;
    }

    setGarminUpdatingWorkoutId(selectedWorkout.id);
    setGarminUpdateResult(null);
    setGarminPublishResult(null);
    setGarminDeleteResult(null);
    setMessage(null);
    setStatus("publishing");

    try {
      const response = await fetch("/api/garmin/update-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plannedWorkoutId: selectedWorkout.id,
        }),
      });
      const result = (await response.json()) as GarminUpdateResponse;
      const trackedUpdate = result.exportRecord !== null;

      setGarminUpdateResult(result);
      setMessage(result.message);
      setStatus(result.ok || trackedUpdate ? "saved" : "error");

      if (result.exportRecord || result.oldExportRecord) {
        setWorkoutsState((currentState) => ({
          ...currentState,
          workoutExports: mergeWorkoutExportRecords(
            currentState.workoutExports,
            [result.oldExportRecord, result.exportRecord],
          ),
        }));
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update direct Garmin export.",
      );
    } finally {
      setGarminUpdatingWorkoutId(null);
    }
  }

  async function handleBulkPublishWorkouts() {
    const { plan } = workoutsState;

    if (!plan) {
      setStatus("error");
      setMessage("Load an active training plan before publishing workouts.");
      return;
    }

    if (selectedBulkPublishWorkoutIds.length === 0) {
      setStatus("error");
      setMessage("Select at least one planned workout to publish.");
      return;
    }

    setBulkPublishing(true);
    setStatus("publishing");
    setMessage(null);
    setBulkPublishResults([]);

    try {
      const response = await fetch("/api/intervals/publish-workouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trainingPlanId: plan.id,
          plannedWorkoutIds: selectedBulkPublishWorkoutIds,
        }),
      });
      const result = (await response.json()) as IntervalsBulkPublishWorkoutsResponse;

      if (result.results.length > 0) {
        const hasSuccess = result.results.some(
          (publishResult) => publishResult.ok,
        );
        const hasFailure = result.results.some(
          (publishResult) => !publishResult.ok,
        );

        if (hasSuccess) {
          await loadWorkouts(result.message);
        } else {
          setMessage(result.message);
        }

        setStatus(hasFailure && !hasSuccess ? "error" : "saved");
        setBulkPublishResults(result.results);
        return;
      }

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Intervals.icu bulk publish failed.");
      }

      setMessage(result.message);
      setStatus("saved");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not publish workouts to Intervals.icu.",
      );
    } finally {
      setBulkPublishing(false);
    }
  }

  async function handleImportStravaRuns() {
    if (!isStravaConnected) {
      setStravaMessage("Connect Strava in Settings before importing runs.");
      return;
    }

    setStravaImporting(true);
    setStravaImportSummary(null);
    setStravaMessage(null);

    try {
      const response = await fetch("/api/strava/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ days: stravaImportDays }),
      });
      const result = (await response.json()) as StravaImportResponse;

      if (!response.ok) {
        throw new Error(result.message || "Could not import Strava runs.");
      }

      setStravaImportSummary(result);
      setStravaMessage(result.message);
      await loadWorkouts(result.message);
    } catch (error) {
      setStravaMessage(
        error instanceof Error ? error.message : "Could not import Strava runs.",
      );
    } finally {
      setStravaImporting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { profile, raceGoal, plan } = workoutsState;
    setPendingDeleteLogId(null);
    setStatus("saving");
    setMessage(null);

    if (!profile || !raceGoal || !plan) {
      setStatus("error");
      setMessage("Load a profile, race goal, and active plan before logging workouts.");
      return;
    }

    let loggedWorkoutInput: SaveLoggedWorkoutInput;

    try {
      loggedWorkoutInput = buildLoggedWorkoutInput(
        form,
        selectedWorkout,
        loggedWorkoutIds,
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Check the workout form.",
      );
      return;
    }

    try {
      const completionResult = await saveLoggedWorkoutWithCompletion({
        profile,
        raceGoal,
        plan,
        loggedWorkoutInput,
        plannedWorkout: selectedWorkout,
        recentLoggedWorkouts: workoutsState.loggedWorkouts,
        recentWorkoutEvaluations: workoutsState.workoutEvaluations,
      });

      try {
        await loadWorkouts(completionResult.message);
        setStatus(completionResult.ok ? "saved" : "error");
      } catch (error) {
        setWorkoutsState((currentState) => ({
          ...currentState,
          loggedWorkouts: addLoggedWorkoutIfMissing(
            currentState.loggedWorkouts,
            completionResult.loggedWorkout,
          ),
        }));
        setStatus("error");
        setMessage(
          error instanceof Error
            ? `${completionResult.message} Could not reload workouts: ${error.message}`
            : `${completionResult.message} Could not reload workouts.`,
        );
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `Could not save workout log: ${error.message}`
          : "Could not save workout log.",
      );
    }
  }

  async function handleDeleteLoggedWorkout(loggedWorkout: LoggedWorkout) {
    const { profile, plan } = workoutsState;

    if (!profile || !plan) {
      setStatus("error");
      setMessage("Load a profile and active plan before deleting a workout log.");
      return;
    }

    if (loggedWorkout.profile_id !== profile.id || loggedWorkout.training_plan_id !== plan.id) {
      setStatus("error");
      setMessage("This workout log does not belong to the currently loaded profile and active plan.");
      return;
    }

    setDeletingLogId(loggedWorkout.id);
    setStatus("deleting");
    setMessage(null);

    let rollbackResult: DeleteWorkoutRollbackResult;

    try {
      rollbackResult = await rollbackPlanAdjustmentBeforeDeletingWorkout({
        plan,
        loggedWorkout,
      });
    } catch (error) {
      setDeletingLogId(null);
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `Could not check plan adjustments before deleting workout log: ${error.message}`
          : "Could not check plan adjustments before deleting workout log.",
      );
      return;
    }

    try {
      await deletePlanAdjustmentsForLoggedWorkout(loggedWorkout.id);
      await deleteWorkoutEvaluationsForLoggedWorkout(loggedWorkout.id);
      await deleteLoggedWorkout(loggedWorkout.id);
    } catch (error) {
      setDeletingLogId(null);
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `Could not delete workout log: ${error.message}`
          : "Could not delete workout log.",
      );
      return;
    }

    try {
      if (loggedWorkout.planned_workout_id) {
        const remainingLogs = await fetchLoggedWorkoutsForPlannedWorkout(
          loggedWorkout.planned_workout_id,
        );

        if (remainingLogs.length === 0) {
          await markPlannedWorkoutPlanned(loggedWorkout.planned_workout_id);
        }
      }

      await loadWorkouts(
        buildDeletedWorkoutMessage(rollbackResult),
      );
    } catch (error) {
      setPendingDeleteLogId(null);
      setDeletingLogId(null);
      setWorkoutsState((currentState) => ({
        ...currentState,
        loggedWorkouts: currentState.loggedWorkouts.filter(
          (currentLog) => currentLog.id !== loggedWorkout.id,
        ),
        workoutEvaluations: currentState.workoutEvaluations.filter(
          (evaluation) => evaluation.logged_workout_id !== loggedWorkout.id,
        ),
      }));
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `Workout log and score were deleted, but the planned workout was not reset: ${error.message}`
          : "Workout log and score were deleted, but the planned workout was not reset.",
      );
    }
  }

  if (status === "loading") {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Loading planned workouts...
      </div>
    );
  }

  const { profile, plan } = workoutsState;
  const hasRunWorkouts = runWorkouts.length > 0;
  const canSubmit = Boolean(
    selectedWorkout && canLogWorkout(selectedWorkout, loggedWorkoutIds),
  );

  return (
    <div className="space-y-6">
      {message ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            status === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      {!profile ? (
        <section className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-700">
          Save a profile before logging workouts. 
          <Link className="font-medium text-slate-950 underline" href="/profile">
            Go to Profile
          </Link>
        </section>
      ) : null}

      {profile && !plan ? (
        <section className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-700">
          Generate or select an active training plan before logging workouts.{" "}
          <Link className="font-medium text-slate-950 underline" href="/plan">
            Go to Plan
          </Link>
        </section>
      ) : null}

      {profile && plan ? (
        <>
          <section className="rounded-md border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-medium text-slate-950">
                  Strava import
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Import recent Strava runs into this active plan.
                </p>
              </div>
              <button
                className="w-fit rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={isBusy || stravaLoadState === "loading"}
                onClick={() => void loadStravaStatus()}
                type="button"
              >
                {stravaLoadState === "loading" ? "Checking..." : "Refresh status"}
              </button>
            </div>

            {stravaMessage ? (
              <div
                className={`mt-4 rounded-md border px-4 py-3 text-sm ${
                  stravaLoadState === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                {stravaMessage}
              </div>
            ) : null}

            {!isStravaConnected ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                Connect Strava in{" "}
                <Link className="font-medium underline" href="/settings">
                  Settings
                </Link>{" "}
                before importing Strava runs.
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                <div className="flex w-fit rounded-md border border-slate-300 bg-white p-1">
                  {stravaImportDayOptions.map((days) => (
                    <button
                      aria-pressed={stravaImportDays === days}
                      className={`rounded px-3 py-1.5 text-sm font-medium ${
                        stravaImportDays === days
                          ? "bg-slate-900 text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                      disabled={isBusy}
                      key={days}
                      onClick={() => setStravaImportDays(days)}
                      type="button"
                    >
                      Last {days} days
                    </button>
                  ))}
                </div>

                <button
                  className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={isBusy}
                  onClick={() => void handleImportStravaRuns()}
                  type="button"
                >
                  {stravaImporting ? "Importing..." : "Import latest Strava runs"}
                </button>
              </div>
            )}

            <div className="mt-5">
              <StravaImportSummary summary={stravaImportSummary} />
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-6">
            <div>
              <h2 className="text-base font-medium text-slate-950">
                Workout history
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Completed manual logs, planned vs actual details, and saved scores.
              </p>
            </div>

            {workoutHistory.length === 0 ? (
              <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                No logged workouts yet. Save one planned run workout to see its
                score here.
              </div>
            ) : (
              <div className="mt-5 divide-y divide-slate-100 rounded-md border border-slate-200">
                {workoutHistory.map((loggedWorkout) => {
                  const plannedWorkout = loggedWorkout.planned_workout_id
                    ? plannedWorkoutById.get(loggedWorkout.planned_workout_id) ??
                      null
                    : null;
                  const evaluation =
                    evaluationByLoggedWorkoutId.get(loggedWorkout.id) ?? null;
                  const planAdjustment =
                    adjustmentByLoggedWorkoutId.get(loggedWorkout.id) ?? null;
                  const affectedWorkoutLabels = planAdjustment
                    ? formatAffectedWorkoutLabels(
                        planAdjustment,
                        plannedWorkoutById,
                      )
                    : [];
                  const isConfirmingDelete = pendingDeleteLogId === loggedWorkout.id;
                  const isDeletingThisLog = deletingLogId === loggedWorkout.id;
                  const canStartDelete = !isBusy || isDeletingThisLog;
                  const scoreItems: Array<[string, number]> = evaluation
                    ? [
                        ["Completion", evaluation.completion_score],
                        ["Distance", evaluation.distance_completion_score],
                        ["Pace", evaluation.pace_accuracy_score],
                        ["Effort", evaluation.effort_control_score],
                        ["Training value", evaluation.training_value_score],
                      ]
                    : [];

                  return (
                    <article
                      className={`p-4 text-sm ${
                        isDeletingThisLog ? "opacity-60" : ""
                      }`}
                      key={loggedWorkout.id}
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h3 className="font-medium text-slate-950">
                            {plannedWorkout?.title ?? "Unplanned workout"}
                          </h3>
                          <p className="mt-1 text-slate-600">
                            {formatDate(loggedWorkout.workout_date)} - {formatLabel(loggedWorkout.source)} log
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          {evaluation ? (
                            <span className="w-fit rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
                              {evaluation.overall_score}/100 overall
                            </span>
                          ) : (
                            <span className="w-fit rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
                              Not scored yet
                            </span>
                          )}
                          <span
                            className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getPlanAdjustmentStatusBadgeClass(
                              planAdjustment,
                            )}`}
                          >
                            {getPlanAdjustmentStatusLabel(planAdjustment)}
                          </span>
                          {isConfirmingDelete ? (
                            <>
                              <button
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isDeletingThisLog}
                                onClick={() => setPendingDeleteLogId(null)}
                                type="button"
                              >
                                Cancel
                              </button>
                              <button
                                className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isDeletingThisLog}
                                onClick={() => void handleDeleteLoggedWorkout(loggedWorkout)}
                                type="button"
                              >
                                {isDeletingThisLog ? "Deleting..." : "Delete permanently"}
                              </button>
                            </>
                          ) : (
                            <button
                              className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={!canStartDelete}
                              onClick={() => setPendingDeleteLogId(loggedWorkout.id)}
                              type="button"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Planned vs actual
                        </p>
                        <dl className="mt-2 grid gap-3 text-slate-700 md:grid-cols-4">
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Distance
                            </dt>
                            <dd className="mt-1">
                              <span className="block text-slate-950">
                                Planned: {formatDistanceKm(plannedWorkout?.distance_km ?? null, "No distance target")}
                              </span>
                              <span className="block">
                                Actual: {formatDistanceKm(loggedWorkout.distance_km, "No distance logged")}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Duration
                            </dt>
                            <dd className="mt-1">
                              <span className="block text-slate-950">
                                Planned: {formatPlannedDuration(plannedWorkout)}
                              </span>
                              <span className="block">
                                Actual: {formatDurationSeconds(loggedWorkout.duration_sec, "No duration logged")}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Pace
                            </dt>
                            <dd className="mt-1">
                              <span className="block text-slate-950">
                                Planned: {plannedWorkout ? formatTargetPace(plannedWorkout) : "No planned workout"}
                              </span>
                              <span className="block">
                                Actual: {formatPaceFromSeconds(loggedWorkout.avg_pace_sec_per_km, "No pace logged")}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Type
                            </dt>
                            <dd className="mt-1">
                              <span className="block text-slate-950">
                                Planned: {plannedWorkout ? formatLabel(plannedWorkout.workout_type) : "No planned workout"}
                              </span>
                              <span className="block">
                                Actual: {formatLabel(loggedWorkout.workout_type)}
                              </span>
                            </dd>
                          </div>
                        </dl>
                      </div>

                      {evaluation ? (
                        <div className="mt-4 border-t border-slate-100 pt-4">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Scoring breakdown
                            </p>
                            <span
                              className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getRiskBadgeClass(
                                evaluation.risk_level,
                              )}`}
                            >
                              {formatLabel(evaluation.risk_level)} risk
                            </span>
                          </div>
                          <dl className="mt-3 grid gap-3 text-slate-700 md:grid-cols-5">
                            {scoreItems.map(([label, score]) => (
                              <div key={label}>
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  {label}
                                </dt>
                                <dd className="mt-1 text-slate-950">
                                  {score}/100
                                </dd>
                              </div>
                            ))}
                          </dl>
                          {evaluation.summary ? (
                            <p className="mt-3 text-slate-700">
                              {evaluation.summary}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
                          This log does not have a saved score yet.
                        </div>
                      )}

                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Plan adjustment
                        </p>

                        {!planAdjustment ? (
                          <p className="mt-2 text-slate-700">
                            This older log does not have a saved plan adjustment
                            decision.
                          </p>
                        ) : (
                          <>
                            <dl className="mt-3 grid gap-3 text-slate-700 md:grid-cols-3">
                              <div>
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Date
                                </dt>
                                <dd className="mt-1">
                                  {formatDate(
                                    planAdjustment.created_at.slice(0, 10),
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Type
                                </dt>
                                <dd className="mt-1">
                                  {formatAdjustmentTypeLabel(
                                    planAdjustment.adjustment_type,
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Reason
                                </dt>
                                <dd className="mt-1">
                                  {planAdjustment.reason}
                                </dd>
                              </div>
                            </dl>

                            <div className="mt-3 text-slate-700">
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                Explanation
                              </p>
                              <p className="mt-1">
                                {planAdjustment.explanation ??
                                  "No explanation saved."}
                              </p>
                            </div>

                            <div className="mt-3">
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                Affected future workouts
                              </p>
                              {affectedWorkoutLabels.length === 0 ? (
                                <p className="mt-1 text-slate-700">
                                  No future workouts were changed.
                                </p>
                              ) : (
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
                                  {affectedWorkoutLabels.map((label, index) => (
                                    <li key={`${planAdjustment.id}-${index}`}>
                                      {label}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <section className="rounded-md border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-medium text-slate-950">
                  Planned run workouts
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Active plan: {plan.name}
                </p>
              </div>
              <button
                className="w-fit rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={isBusy}
                onClick={() => loadWorkouts()}
                type="button"
              >
                Refresh
              </button>
            </div>

            {!hasRunWorkouts ? (
              <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                No run-related planned workouts are available in this active plan.
              </div>
            ) : null}

            {hasRunWorkouts ? (
              <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-slate-950">
                      Bulk publish to Intervals.icu
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Publishes selected planned workouts with heart-rate targets.
                    </p>
                  </div>
                  <div className="flex w-fit rounded-md border border-slate-300 bg-white p-1">
                    {[7, 14].map((windowDays) => (
                      <button
                        aria-pressed={bulkPublishWindowDays === windowDays}
                        className={`rounded px-3 py-1.5 text-sm font-medium ${
                          bulkPublishWindowDays === windowDays
                            ? "bg-slate-900 text-white"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                        disabled={isBusy}
                        key={windowDays}
                        onClick={() =>
                          handleBulkPublishWindowChange(
                            windowDays as IntervalsBulkPublishWindowDays,
                          )
                        }
                        type="button"
                      >
                        Next {windowDays} days
                      </button>
                    ))}
                  </div>
                </div>

                {bulkPublishWindowWorkouts.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-700">
                    No today-or-future planned run workouts are in this window.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {bulkPublishWindowWorkouts.map((workout) => {
                      const canSelectWorkout =
                        canPublishWorkoutToIntervals(workout);
                      const isChecked = selectedBulkPublishWorkoutIdSet.has(
                        workout.id,
                      );

                      return (
                        <label
                          className={`flex gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm ${
                            canSelectWorkout
                              ? "text-slate-800"
                              : "text-slate-500 opacity-75"
                          }`}
                          key={workout.id}
                        >
                          <input
                            checked={isChecked}
                            className="mt-1 h-4 w-4"
                            disabled={!canSelectWorkout || isBusy}
                            onChange={() =>
                              handleToggleBulkPublishWorkout(workout.id)
                            }
                            type="checkbox"
                          />
                          <span>
                            <span className="block font-medium text-slate-950">
                              {formatDate(workout.workout_date)} - {workout.title}
                            </span>
                            <span className="mt-1 block text-slate-600">
                              {canSelectWorkout
                                ? formatWorkoutLoad(workout)
                                : getIntervalsPublishBlocker(workout)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-slate-600">
                    {selectedBulkPublishWorkoutIds.length} selected
                  </p>
                  <button
                    className="w-fit rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    disabled={!canBulkPublishWorkouts || isBusy}
                    onClick={() => void handleBulkPublishWorkouts()}
                    type="button"
                  >
                    {bulkPublishing
                      ? "Publishing selected..."
                      : "Publish selected to Intervals.icu"}
                  </button>
                </div>

                {bulkPublishResults.length > 0 ? (
                  <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
                    <h4 className="text-sm font-medium text-slate-950">
                      Latest bulk publish results
                    </h4>
                    <div className="mt-3 space-y-2">
                      {bulkPublishResults.map((publishResult) => (
                        <div
                          className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 text-sm md:flex-row md:items-start md:justify-between"
                          key={publishResult.plannedWorkoutId}
                        >
                          <div>
                            <p className="font-medium text-slate-950">
                              {publishResult.title ?? publishResult.plannedWorkoutId}
                            </p>
                            <p className="mt-1 text-slate-600">
                              {publishResult.workoutDate
                                ? formatDate(publishResult.workoutDate)
                                : "Date unavailable"}
                            </p>
                            <p className="mt-1 text-slate-700">
                              {publishResult.message}
                            </p>
                          </div>
                          <span
                            className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getPublishResultBadgeClass(
                              publishResult.ok,
                            )}`}
                          >
                            {publishResult.ok ? "Synced" : "Failed"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {hasRunWorkouts ? (
              <div className="mt-5 divide-y divide-slate-100 rounded-md border border-slate-200">
                {runWorkouts.map((workout) => {
                  const isSelected = workout.id === selectedWorkout?.id;
                  const isLoggable = canLogWorkout(workout, loggedWorkoutIds);
                  const linkedLoggedWorkout =
                    loggedWorkoutByPlannedWorkoutId.get(workout.id) ?? null;
                  const linkedEvaluation = linkedLoggedWorkout
                    ? evaluationByLoggedWorkoutId.get(linkedLoggedWorkout.id) ??
                      null
                    : null;
                  const intervalsSync =
                    intervalsWorkoutSyncByPlannedWorkoutId.get(workout.id) ??
                    null;
                  const intervalsSyncStatus =
                    intervalsSync?.sync_status ?? "not_synced";
                  const garminExport =
                    garminExportByPlannedWorkoutId.get(workout.id) ?? null;
                  const garminExportStatus =
                    getEffectiveGarminExportStatus(garminExport);

                  return (
                    <button
                      className={`block w-full p-4 text-left text-sm ${
                        isSelected ? "bg-slate-50" : "bg-white"
                      } ${
                        isLoggable
                          ? "hover:bg-slate-50"
                          : "cursor-not-allowed opacity-70"
                      }`}
                      disabled={!isLoggable || isBusy}
                      key={workout.id}
                      onClick={() => handleSelectWorkout(workout)}
                      type="button"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-medium text-slate-950">
                            {workout.title}
                          </p>
                          <p className="mt-1 text-slate-600">
                            {formatDate(workout.workout_date)} - {formatLabel(workout.workout_type)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="w-fit rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
                            {getWorkoutLogStatus(workout, loggedWorkoutIds)}
                          </span>
                          {linkedEvaluation ? (
                            <span className="w-fit rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                              {linkedEvaluation.overall_score}/100 score
                            </span>
                          ) : null}
                          <span
                            className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getIntervalsSyncStatusBadgeClass(
                              intervalsSyncStatus,
                            )}`}
                            title={intervalsSync?.last_error ?? undefined}
                          >
                            {getIntervalsSyncStatusLabel(intervalsSync)}
                          </span>
                          {isGarminBridgeConfigured ? (
                            <span
                              className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getGarminExportStatusBadgeClass(
                                garminExportStatus,
                              )}`}
                              title={
                                getGarminExportError(garminExport) ?? undefined
                              }
                            >
                              Garmin {getGarminExportStatusLabel(garminExport)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <dl className="mt-3 grid gap-3 text-slate-600 md:grid-cols-3">
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Target
                          </dt>
                          <dd className="mt-1">{formatWorkoutLoad(workout)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Pace
                          </dt>
                          <dd className="mt-1">{formatTargetPace(workout)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Purpose
                          </dt>
                          <dd className="mt-1">
                            {workout.purpose ?? "No purpose saved"}
                          </dd>
                        </div>
                      </dl>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <section className="rounded-md border border-slate-200 bg-white p-6">
              <h2 className="text-base font-medium text-slate-950">
                Log actual results
              </h2>

              {selectedWorkout ? (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-medium text-slate-950">
                    {selectedWorkout.title}
                  </p>
                  <p className="mt-1">
                    {formatDate(selectedWorkout.workout_date)} - {formatWorkoutLoad(selectedWorkout)}
                  </p>
                  <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-medium text-slate-950">
                          Intervals.icu publishing
                        </p>
                        <span
                          className={`mt-2 inline-flex w-fit rounded-md border px-2 py-1 text-xs font-medium ${getIntervalsSyncStatusBadgeClass(
                            selectedWorkoutIntervalsSync?.sync_status ??
                              "not_synced",
                          )}`}
                          title={
                            selectedWorkoutIntervalsSync?.last_error ??
                            undefined
                          }
                        >
                          {getIntervalsSyncStatusLabel(
                            selectedWorkoutIntervalsSync,
                          )}
                        </span>
                        <p className="mt-1 text-slate-600">
                          {getIntervalsPublishBlocker(selectedWorkout)}
                        </p>
                      </div>
                      <button
                        className="w-fit rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        disabled={!canPublishSelectedWorkout || isBusy}
                        onClick={() => void handlePublishSelectedWorkout()}
                        type="button"
                      >
                        {publishingWorkoutId === selectedWorkout.id
                          ? "Publishing..."
                          : "Publish to Intervals.icu"}
                      </button>
                    </div>
                  </div>
                  {isGarminBridgeConfigured ? (
                    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-medium text-slate-950">
                            Direct Garmin publishing
                          </p>
                          <p className="mt-1 text-slate-700">
                            This uses an unofficial local Garmin Connect bridge. It runs only on your laptop and may break if Garmin changes internal APIs.
                          </p>
                          <span
                            className={`mt-2 inline-flex w-fit rounded-md border px-2 py-1 text-xs font-medium ${getGarminExportStatusBadgeClass(
                              getEffectiveGarminExportStatus(
                                selectedWorkoutGarminExport,
                              ),
                            )}`}
                            title={
                              getGarminExportError(
                                selectedWorkoutGarminExport,
                              ) ??
                              undefined
                            }
                          >
                            Garmin{" "}
                            {getGarminExportStatusLabel(
                              selectedWorkoutGarminExport,
                            )}
                          </span>
                          {selectedWorkoutGarminExport?.provider_workout_id ? (
                            <p className="mt-2 text-sm text-slate-700">
                              Garmin workout ID:{" "}
                              {selectedWorkoutGarminExport.provider_workout_id}
                            </p>
                          ) : null}
                          {getGarminExportError(selectedWorkoutGarminExport) ? (
                            <p className="mt-2 text-sm text-red-700">
                              {getGarminExportError(selectedWorkoutGarminExport)}
                            </p>
                          ) : null}
                          {selectedWorkoutGarminGuardMessage ? (
                            <p
                              className={`mt-2 text-sm ${
                                selectedWorkoutGarminEffectiveStatus === "synced"
                                  ? "text-emerald-700"
                                  : "text-amber-800"
                              }`}
                            >
                              {selectedWorkoutGarminGuardMessage}
                            </p>
                          ) : null}
                          {garminBridgeStatus ? (
                            <p className="mt-2 text-sm text-slate-700">
                              Bridge status: {garminBridgeStatus.message}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                          <button
                            className="w-fit rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                            disabled={
                              !canPreviewSelectedWorkoutToGarmin ||
                              isBusy ||
                              garminBridgeStatus?.status === "DISABLED"
                            }
                            onClick={() => void handlePreviewGarminExport()}
                            type="button"
                          >
                            {garminPreviewingWorkoutId === selectedWorkout.id
                              ? "Previewing..."
                              : "Preview Garmin Export"}
                          </button>
                          <button
                            className="w-fit rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                            disabled={!canPublishSelectedWorkout || isBusy}
                            onClick={() => void handlePublishGarminExport()}
                            type="button"
                          >
                            {getGarminPublishButtonLabel(
                              selectedWorkoutGarminExport,
                              garminPublishingWorkoutId === selectedWorkout.id,
                            )}
                          </button>
                          {canUpdateSelectedGarminExport ? (
                            <button
                              className="w-fit rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                              disabled={isBusy}
                              onClick={() => void handleUpdateGarminExport()}
                              type="button"
                            >
                              {garminUpdatingWorkoutId === selectedWorkout.id
                                ? "Updating..."
                                : "Update Garmin Export"}
                            </button>
                          ) : null}
                          {canDeleteSelectedWorkoutFromGarmin ? (
                            <button
                              className="w-fit rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                              disabled={isBusy}
                              onClick={() => void handleDeleteGarminExport()}
                              type="button"
                            >
                              {garminDeletingWorkoutId === selectedWorkout.id
                                ? "Deleting..."
                                : "Delete from Garmin"}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {garminPreviewResult?.plannedWorkoutId ===
                      selectedWorkout.id ? (
                        <div className="mt-4 rounded-md border border-amber-200 bg-white p-3 text-sm">
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-medium text-slate-950">
                                Latest Garmin preview
                              </p>
                              <p className="mt-1 text-slate-700">
                                {garminPreviewResult.message}
                              </p>
                            </div>
                            <span
                              className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getPublishResultBadgeClass(
                                garminPreviewResult.ok,
                              )}`}
                            >
                              {garminPreviewResult.ok ? "Ready" : "Failed"}
                            </span>
                          </div>
                          {garminPreviewResult.preview ? (
                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                              <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Steps
                                </p>
                                <p className="mt-1 text-slate-800">
                                  {garminPreviewResult.preview.step_count}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Pace targets
                                </p>
                                <p className="mt-1 text-slate-800">
                                  {
                                    garminPreviewResult.preview
                                      .pace_target_count
                                  }
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Target
                                </p>
                                <p className="mt-1 text-slate-800">
                                  {
                                    garminPreviewResult.preview.target_summary
                                      .display
                                  }
                                </p>
                              </div>
                            </div>
                          ) : null}
                          {garminPreviewResult.preview?.warnings.length ? (
                            <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-700">
                              {garminPreviewResult.preview.warnings.map(
                                (warning) => (
                                  <li key={warning}>{warning}</li>
                                ),
                              )}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}

                      {garminPublishResult?.plannedWorkoutId ===
                      selectedWorkout.id ? (
                        <div className="mt-4 rounded-md border border-amber-200 bg-white p-3 text-sm">
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-medium text-slate-950">
                                Latest Garmin publish result
                              </p>
                              <p className="mt-1 text-slate-700">
                                {garminPublishResult.message}
                              </p>
                            </div>
                            <span
                              className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getGarminExportStatusBadgeClass(
                                garminPublishResult.exportRecord
                                  ?.sync_status ??
                                  (garminPublishResult.ok
                                    ? "synced"
                                    : "failed"),
                              )}`}
                            >
                              {garminPublishResult.exportRecord
                                ? getGarminExportStatusLabel(
                                    garminPublishResult.exportRecord,
                                  )
                                : garminPublishResult.ok
                                  ? "Synced"
                                  : "Failed"}
                            </span>
                          </div>
                          {garminPublishResult.publish?.garmin_workout_id ? (
                            <p className="mt-3 text-slate-700">
                              Garmin workout ID:{" "}
                              {garminPublishResult.publish.garmin_workout_id}
                            </p>
                          ) : null}
                          {garminPublishResult.publish?.error ? (
                            <p className="mt-2 text-red-700">
                              {garminPublishResult.publish.error}
                            </p>
                          ) : null}
                          {garminPublishResult.trackingError ? (
                            <p className="mt-2 text-red-700">
                              Export tracking error:{" "}
                              {garminPublishResult.trackingError}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {garminUpdateResult?.plannedWorkoutId ===
                      selectedWorkout.id ? (
                        <div className="mt-4 rounded-md border border-amber-200 bg-white p-3 text-sm">
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-medium text-slate-950">
                                Latest Garmin update result
                              </p>
                              <p className="mt-1 text-slate-700">
                                {garminUpdateResult.message}
                              </p>
                            </div>
                            <span
                              className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getGarminExportStatusBadgeClass(
                                garminUpdateResult.exportRecord?.sync_status ??
                                  (garminUpdateResult.ok ? "synced" : "failed"),
                              )}`}
                            >
                              {garminUpdateResult.exportRecord
                                ? getGarminExportStatusLabel(
                                    garminUpdateResult.exportRecord,
                                  )
                                : garminUpdateResult.ok
                                  ? "Synced"
                                  : "Failed"}
                            </span>
                          </div>
                          {garminUpdateResult.publish?.garmin_workout_id ? (
                            <p className="mt-3 text-slate-700">
                              New Garmin workout ID:{" "}
                              {garminUpdateResult.publish.garmin_workout_id}
                            </p>
                          ) : null}
                          {garminUpdateResult.deleteResult?.garmin_workout_id ? (
                            <p className="mt-2 text-slate-700">
                              Old Garmin workout ID:{" "}
                              {
                                garminUpdateResult.deleteResult
                                  .garmin_workout_id
                              }
                            </p>
                          ) : null}
                          {garminUpdateResult.exportRecord?.warnings.length ? (
                            <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-700">
                              {garminUpdateResult.exportRecord.warnings.map(
                                (warning) => (
                                  <li key={warning}>{warning}</li>
                                ),
                              )}
                            </ul>
                          ) : null}
                          {garminUpdateResult.publish?.error ? (
                            <p className="mt-2 text-red-700">
                              {garminUpdateResult.publish.error}
                            </p>
                          ) : null}
                          {garminUpdateResult.trackingError ? (
                            <p className="mt-2 text-red-700">
                              Export tracking error:{" "}
                              {garminUpdateResult.trackingError}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {garminDeleteResult?.plannedWorkoutId ===
                      selectedWorkout.id ? (
                        <div className="mt-4 rounded-md border border-amber-200 bg-white p-3 text-sm">
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-medium text-slate-950">
                                Latest Garmin delete result
                              </p>
                              <p className="mt-1 text-slate-700">
                                {garminDeleteResult.message}
                              </p>
                            </div>
                            <span
                              className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getGarminExportStatusBadgeClass(
                                garminDeleteResult.exportRecord?.sync_status ??
                                  (garminDeleteResult.ok ? "deleted" : "failed"),
                              )}`}
                            >
                              {garminDeleteResult.exportRecord
                                ? getGarminExportStatusLabel(
                                    garminDeleteResult.exportRecord,
                                  )
                                : garminDeleteResult.ok
                                  ? "Deleted"
                                  : "Failed"}
                            </span>
                          </div>
                          {garminDeleteResult.deleteResult?.garmin_workout_id ? (
                            <p className="mt-3 text-slate-700">
                              Garmin workout ID:{" "}
                              {
                                garminDeleteResult.deleteResult
                                  .garmin_workout_id
                              }
                            </p>
                          ) : null}
                          {garminDeleteResult.deleteResult?.warnings.length ? (
                            <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-700">
                              {garminDeleteResult.deleteResult.warnings.map(
                                (warning) => (
                                  <li key={warning}>{warning}</li>
                                ),
                              )}
                            </ul>
                          ) : null}
                          {garminDeleteResult.deleteResult?.error ? (
                            <p className="mt-2 text-red-700">
                              {garminDeleteResult.deleteResult.error}
                            </p>
                          ) : null}
                          {garminDeleteResult.trackingError ? (
                            <p className="mt-2 text-red-700">
                              Export tracking error:{" "}
                              {garminDeleteResult.trackingError}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  Choose an unlogged planned run workout first.
                </div>
              )}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className={labelClass}>
                  Workout date
                  <input
                    className={inputClass}
                    disabled={!canSubmit || isBusy}
                    onChange={(event) =>
                      setForm({ ...form, workout_date: event.target.value })
                    }
                    required
                    type="date"
                    value={form.workout_date}
                  />
                </label>

                <label className={labelClass}>
                  Distance (km)
                  <input
                    className={inputClass}
                    disabled={!canSubmit || isBusy}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      setForm({ ...form, distance_km: event.target.value })
                    }
                    placeholder="8.00"
                    required
                    step="0.01"
                    type="number"
                    value={form.distance_km}
                  />
                </label>
              </div>

              <div className="mt-4">
                <p className={labelClass}>Duration</p>
                <div className="mt-1 grid grid-cols-3 gap-3">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Hours
                    <input
                      className={inputClass}
                      disabled={!canSubmit || isBusy}
                      inputMode="numeric"
                      min="0"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          duration_hours: event.target.value,
                        })
                      }
                      placeholder="0"
                      type="number"
                      value={form.duration_hours}
                    />
                  </label>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Minutes
                    <input
                      className={inputClass}
                      disabled={!canSubmit || isBusy}
                      inputMode="numeric"
                      max="59"
                      min="0"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          duration_minutes: event.target.value,
                        })
                      }
                      placeholder="45"
                      type="number"
                      value={form.duration_minutes}
                    />
                  </label>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Seconds
                    <input
                      className={inputClass}
                      disabled={!canSubmit || isBusy}
                      inputMode="numeric"
                      max="59"
                      min="0"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          duration_seconds: event.target.value,
                        })
                      }
                      placeholder="00"
                      type="number"
                      value={form.duration_seconds}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                Average pace: {previewPaceSecPerKm ? formatPace(previewPaceSecPerKm) : "Enter distance and duration"}
              </div>
            </section>

            <section className="rounded-md border border-slate-200 bg-white p-6">
              <h2 className="text-base font-medium text-slate-950">
                Optional details
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className={labelClass}>
                  Average heart rate
                  <input
                    className={inputClass}
                    disabled={!canSubmit || isBusy}
                    inputMode="numeric"
                    onChange={(event) =>
                      setForm({ ...form, avg_heart_rate: event.target.value })
                    }
                    placeholder="150"
                    type="number"
                    value={form.avg_heart_rate}
                  />
                </label>

                <label className={labelClass}>
                  Max heart rate
                  <input
                    className={inputClass}
                    disabled={!canSubmit || isBusy}
                    inputMode="numeric"
                    onChange={(event) =>
                      setForm({ ...form, max_heart_rate: event.target.value })
                    }
                    placeholder="175"
                    type="number"
                    value={form.max_heart_rate}
                  />
                </label>

                <label className={labelClass}>
                  Cadence
                  <input
                    className={inputClass}
                    disabled={!canSubmit || isBusy}
                    inputMode="numeric"
                    onChange={(event) =>
                      setForm({ ...form, cadence: event.target.value })
                    }
                    placeholder="170"
                    type="number"
                    value={form.cadence}
                  />
                </label>

                <label className={labelClass}>
                  Elevation change (m)
                  <input
                    className={inputClass}
                    disabled={!canSubmit || isBusy}
                    inputMode="decimal"
                    onChange={(event) =>
                      setForm({ ...form, elevation_gain_m: event.target.value })
                    }
                    placeholder="-25"
                    step="0.01"
                    type="number"
                    value={form.elevation_gain_m}
                  />
                </label>

                <label className={labelClass}>
                  RPE (1-10)
                  <input
                    className={inputClass}
                    disabled={!canSubmit || isBusy}
                    inputMode="numeric"
                    max="10"
                    min="1"
                    onChange={(event) =>
                      setForm({ ...form, rpe: event.target.value })
                    }
                    placeholder="6"
                    type="number"
                    value={form.rpe}
                  />
                </label>
              </div>

              <label className={`${labelClass} mt-4 block`}>
                Notes
                <textarea
                  className={`${inputClass} min-h-28`}
                  disabled={!canSubmit || isBusy}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  placeholder="How did it feel? Any pain, fatigue, weather, or route notes?"
                  value={form.notes}
                />
              </label>

              <button
                className="mt-5 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!canSubmit || isBusy}
                type="submit"
              >
                {isSaving ? "Saving..." : "Save workout log"}
              </button>
            </section>
          </form>
          </div>

        </>
      ) : null}
    </div>
  );
}
