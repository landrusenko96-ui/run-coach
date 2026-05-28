"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchRecentPlanAdjustmentsForTrainingPlan } from "@/lib/db/planAdjustments";
import { fetchFirstProfile } from "@/lib/db/profiles";
import { fetchActiveRaceGoal } from "@/lib/db/raceGoals";
import {
  activateTrainingPlan,
  fetchPlannedWorkouts,
  fetchTrainingPlanDeletePreview,
  fetchTrainingPlans,
  type DeleteTrainingPlanResult,
  type TrainingPlanDeletePreview,
} from "@/lib/db/trainingPlans";
import {
  filterPlanChangingAdjustments,
  formatAdjustmentTypeLabel,
  formatAffectedWorkoutLabels,
} from "@/lib/training/planAdjustmentDisplay";
import { buildDefaultTrainingPlanName } from "@/lib/training/planGenerator";
import {
  getLatestAllowedPlanStartDate,
  getLocalDateText,
  validatePlanStartDate,
} from "@/lib/training/planStart";
import type {
  PlanAdjustment,
  GarminBulkMaintenanceExecuteResponse,
  GarminBulkMaintenanceMode,
  GarminBulkMaintenancePreviewResponse,
  GarminBulkPreviewWorkoutsResponse,
  GarminBulkPublishWindowDays,
  GarminBulkPublishWorkoutsResponse,
  GarminPlanDeleteCleanupMode,
  GenerateTrainingPlanApiResponse,
  PlannedWorkout,
  PlanGenerationHistorySummary,
  Profile,
  RaceGoal,
  TrainingPlan,
  WorkoutStep,
} from "@/types";

type LoadStatus =
  | "loading"
  | "ready"
  | "generating"
  | "activating"
  | "deleting"
  | "error";

type PlansState = {
  profile: Profile | null;
  raceGoal: RaceGoal | null;
  plans: TrainingPlan[];
  activePlan: TrainingPlan | null;
  workouts: PlannedWorkout[];
  planAdjustments: PlanAdjustment[];
};

type WeeklyWorkoutGroup = {
  weekNumber: number;
  workouts: PlannedWorkout[];
};

type DeletePreviewByPlanId = Record<string, TrainingPlanDeletePreview>;

type DeleteTrainingPlanApiResult = DeleteTrainingPlanResult & {
  intervals_delete_attempt_count?: number;
  intervals_deleted_event_count?: number;
  garmin_cleanup_mode?: GarminPlanDeleteCleanupMode;
  garmin_future_export_count?: number;
  garmin_delete_attempt_count?: number;
  garmin_deleted_count?: number;
  garmin_partial_count?: number;
  garmin_failed_count?: number;
  garmin_direct_exports_marked_deleted_count?: number;
};

type DeleteTrainingPlanResponse = {
  ok: boolean;
  message: string;
  result: DeleteTrainingPlanApiResult | null;
};

type GarminBridgeStatusResponse = {
  ok: boolean;
  enabled: boolean;
  status: string;
  message: string;
};

const emptyState: PlansState = {
  profile: null,
  raceGoal: null,
  plans: [],
  activePlan: null,
  workouts: [],
  planAdjustments: [],
};

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function formatTimestampDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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

  return "No distance or duration";
}

function formatPace(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = secondsPerKm % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function formatPaceRange(workout: PlannedWorkout): string {
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

function formatStepDuration(step: WorkoutStep): string {
  if (step.durationType === "open") {
    return "Open";
  }

  if (
    step.durationValue === undefined ||
    step.durationUnit === undefined ||
    step.durationValue <= 0
  ) {
    return "No duration";
  }

  if (step.durationUnit === "meters") {
    if (step.durationValue >= 1000) {
      return `${Number((step.durationValue / 1000).toFixed(1))} km`;
    }

    return `${step.durationValue} m`;
  }

  if (step.durationValue >= 3600) {
    const hours = Math.floor(step.durationValue / 3600);
    const minutes = Math.round((step.durationValue % 3600) / 60);

    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }

  if (step.durationValue >= 60) {
    return `${Math.round(step.durationValue / 60)} min`;
  }

  return `${step.durationValue} sec`;
}

function formatStepTarget(step: WorkoutStep): string {
  if (!step.targetType || step.targetType === "none") {
    return "No target";
  }

  if (
    step.targetType === "pace" &&
    step.targetMin !== undefined &&
    step.targetMax !== undefined
  ) {
    return `${formatPace(step.targetMin)} - ${formatPace(step.targetMax)}`;
  }

  if (
    step.targetType === "heart_rate" &&
    step.targetMin !== undefined &&
    step.targetMax !== undefined
  ) {
    return `${step.targetMin}-${step.targetMax} bpm`;
  }

  if (
    step.targetType === "rpe" &&
    step.targetMin !== undefined &&
    step.targetMax !== undefined
  ) {
    return `RPE ${step.targetMin}-${step.targetMax}`;
  }

  return formatLabel(step.targetType);
}

function formatTerrain(terrain: string | null): string {
  return terrain ? formatLabel(terrain) : "No terrain target";
}

function formatPlanDateRange(plan: TrainingPlan): string {
  return `${formatDate(plan.start_date)} - ${formatDate(plan.end_date)}`;
}

function getStatusBadgeClass(status: string): string {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function groupWorkoutsByWeek(workouts: PlannedWorkout[]): WeeklyWorkoutGroup[] {
  const groups = new Map<number, PlannedWorkout[]>();

  for (const workout of workouts) {
    const weekWorkouts = groups.get(workout.week_number) ?? [];
    weekWorkouts.push(workout);
    groups.set(workout.week_number, weekWorkouts);
  }

  return Array.from(groups.entries())
    .sort(([firstWeek], [secondWeek]) => firstWeek - secondWeek)
    .map(([weekNumber, weekWorkouts]) => ({
      weekNumber,
      workouts: [...weekWorkouts].sort((firstWorkout, secondWorkout) =>
        firstWorkout.workout_date.localeCompare(secondWorkout.workout_date),
      ),
    }));
}

function buildPlannedWorkoutById(
  plannedWorkouts: PlannedWorkout[],
): Map<string, PlannedWorkout> {
  return new Map(plannedWorkouts.map((workout) => [workout.id, workout]));
}

function buildDefaultMessage(input: {
  profile: Profile;
  raceGoal: RaceGoal | null;
  plans: TrainingPlan[];
  activePlan: TrainingPlan | null;
}): string {
  if (!input.raceGoal) {
    return "Create and save a Race Goal before generating a new plan.";
  }

  if (input.plans.length === 0) {
    return "No training plan has been generated yet.";
  }

  if (!input.activePlan) {
    return "No active plan is selected. Open the plan picker and choose one plan to make it active.";
  }

  return "Loaded your active training plan.";
}

function buildDeleteSuccessMessage(result: DeleteTrainingPlanApiResult): string {
  const activePlanMessage = result.was_active
    ? " It was the active plan, so select another plan before using Dashboard or Workouts."
    : "";
  const intervalsDeletedEventCount =
    result.intervals_deleted_event_count ?? 0;
  const intervalsMessage =
    intervalsDeletedEventCount > 0
      ? ` Deleted ${intervalsDeletedEventCount} future Intervals.icu event${intervalsDeletedEventCount === 1 ? "" : "s"}.`
      : "";
  const garminDeletedCount =
    result.garmin_direct_exports_marked_deleted_count ?? 0;
  const garminFutureExportCount = result.garmin_future_export_count ?? 0;
  let garminMessage = "";

  if (
    result.garmin_cleanup_mode === "attempt_future_delete" &&
    garminFutureExportCount > 0
  ) {
    garminMessage = ` Attempted to remove ${result.garmin_delete_attempt_count ?? 0} future Garmin workout${(result.garmin_delete_attempt_count ?? 0) === 1 ? "" : "s"}: ${result.garmin_deleted_count ?? 0} deleted, ${result.garmin_partial_count ?? 0} partial, ${result.garmin_failed_count ?? 0} failed.`;
  } else if (garminDeletedCount > 0) {
    garminMessage = ` Marked ${garminDeletedCount} future direct Garmin export${garminDeletedCount === 1 ? "" : "s"} deleted locally. Garmin Connect was not changed.`;
  }

  return `Deleted ${result.deleted_plan_name}. Removed ${result.deleted_planned_workout_count} planned workouts and ${result.deleted_workout_evaluation_count} workout evaluations. Kept and unlinked ${result.unlinked_logged_workout_count} logged workouts.${intervalsMessage}${garminMessage}${activePlanMessage}`;
}

function getBulkSummaryCountClass(count: number): string {
  return count > 0 ? "text-slate-950" : "text-slate-500";
}

function getGarminBulkActionLabel(action: string): string {
  if (action === "publish") {
    return "Ready";
  }

  if (action === "skip_synced") {
    return "Skipped";
  }

  if (action === "needs_confirmation") {
    return "Needs confirmation";
  }

  return "Blocked";
}

function getGarminBulkExportStatusLabel(exportStatus: string): string {
  if (exportStatus === "stale") {
    return "Changed after Garmin export — update if needed";
  }

  return formatLabel(exportStatus);
}

function getGarminBulkActionBadgeClass(action: string): string {
  if (action === "publish") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (action === "skip_synced") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  if (action === "needs_confirmation") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-red-200 bg-red-50 text-red-800";
}

function getGarminBulkResultBadgeClass(statusValue: string): string {
  if (statusValue === "PUBLISHED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (
    statusValue === "UPLOADED_NOT_SCHEDULED" ||
    statusValue.startsWith("SKIPPED")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-red-200 bg-red-50 text-red-800";
}

function getGarminMaintenanceModeLabel(mode: GarminBulkMaintenanceMode): string {
  return mode === "update_stale"
    ? "Update stale Garmin exports"
    : "Delete selected Garmin exports";
}

function getGarminMaintenanceActionLabel(action: string): string {
  if (action === "update") {
    return "Update";
  }

  if (action === "delete") {
    return "Delete";
  }

  return "Skipped";
}

function getGarminMaintenanceActionBadgeClass(action: string): string {
  if (action === "update") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  if (action === "delete") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function getGarminMaintenanceResultBadgeClass(statusValue: string): string {
  if (statusValue === "UPDATED" || statusValue === "DELETED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (
    statusValue === "UPDATED_PARTIAL" ||
    statusValue === "UNSCHEDULED_ONLY" ||
    statusValue.startsWith("SKIPPED")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-red-200 bg-red-50 text-red-800";
}

function StructuredWorkoutStepList({
  steps,
  level = 0,
}: {
  steps: WorkoutStep[];
  level?: number;
}) {
  return (
    <ol className={level === 0 ? "space-y-2" : "mt-2 space-y-2"}>
      {steps.map((step) => (
        <li
          className="border-l border-slate-200 pl-3"
          key={`${level}-${step.id}`}
        >
          <div className="grid gap-2 md:grid-cols-[1.1fr_0.7fr_1fr]">
            <div>
              <p className="font-medium text-slate-800">{step.name}</p>
              {step.repeat ? (
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Repeat {step.repeat.count} times
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Duration
              </p>
              <p className="mt-1 text-slate-700">{formatStepDuration(step)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Target
              </p>
              <p className="mt-1 text-slate-700">{formatStepTarget(step)}</p>
            </div>
          </div>

          {step.notes ? (
            <p className="mt-2 text-slate-600">{step.notes}</p>
          ) : null}

          {step.repeat ? (
            <StructuredWorkoutStepList
              level={level + 1}
              steps={step.repeat.steps}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function StructuredWorkoutPreview({ workout }: { workout: PlannedWorkout }) {
  const structuredWorkout = workout.structured_workout;

  if (!structuredWorkout) {
    return (
      <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-amber-800">
        No structured workout is saved for this planned workout. It cannot be
        exported.
      </div>
    );
  }

  const exportWarnings = structuredWorkout.exportWarnings ?? [];
  const hasExportSafetyMetadata =
    typeof structuredWorkout.exportSafe === "boolean" &&
    Array.isArray(structuredWorkout.exportWarnings);
  const visibleWarnings = hasExportSafetyMetadata
    ? exportWarnings
    : [
        "Export safety metadata is missing. Regenerate or adjust this workout before export.",
      ];
  const isExportSafe =
    structuredWorkout.exportSafe === true && visibleWarnings.length === 0;

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Structured workout preview
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {structuredWorkout.name}
          </p>
        </div>
        <span
          className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${
            isExportSafe
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {isExportSafe ? "Export-safe" : "Needs review"}
        </span>
      </div>

      {visibleWarnings.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800">
          {visibleWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 text-sm">
        <StructuredWorkoutStepList steps={structuredWorkout.steps ?? []} />
      </div>
    </div>
  );
}

function PlanGenerationHistorySummaryCard({
  summary,
  isBusy,
  canGeneratePlan,
  onUseManualHistory,
}: {
  summary: PlanGenerationHistorySummary;
  isBusy: boolean;
  canGeneratePlan: boolean;
  onUseManualHistory: () => void;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-6">
      <h2 className="text-base font-medium text-slate-950">
        Plan history audit
      </h2>
      <p className="mt-1 text-sm text-slate-600">{summary.message}</p>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
        <div className="rounded-md border border-slate-200 p-3">
          <dt className="font-medium text-slate-700">Window</dt>
          <dd className="mt-1 text-slate-600">
            {formatDate(summary.window_start_date)} to{" "}
            {formatDate(summary.window_end_date)}
          </dd>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <dt className="font-medium text-slate-700">Coverage</dt>
          <dd className="mt-1 text-slate-600">{formatLabel(summary.coverage)}</dd>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <dt className="font-medium text-slate-700">App runs</dt>
          <dd className="mt-1 text-slate-600">
            {summary.app_workouts_used.length}
          </dd>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <dt className="font-medium text-slate-700">Strava imported</dt>
          <dd className="mt-1 text-slate-600">
            {summary.strava_workouts_imported.length}
          </dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-2 md:grid-cols-6">
        {summary.weeks.map((week, index) => (
          <div
            key={`${week.week_start_date}-${index}`}
            className="rounded-md border border-slate-200 p-3 text-sm"
          >
            <div className="font-medium text-slate-950">Week {index + 1}</div>
            <div className="mt-1 text-xs text-slate-500">
              {week.week_start_date} to {week.week_end_date}
            </div>
            <div className="mt-2 text-slate-700">
              {week.run_count} run{week.run_count === 1 ? "" : "s"}
            </div>
            <div className="text-slate-700">{week.distance_km} km</div>
            <div className="text-xs text-slate-500">
              {formatLabel(week.source)}
            </div>
          </div>
        ))}
      </div>

      {summary.strava_workouts_skipped.length > 0 ? (
        <details className="mt-4 rounded-md border border-slate-200 p-3 text-sm text-slate-700">
          <summary className="cursor-pointer font-medium text-slate-900">
            Strava skipped activities ({summary.strava_workouts_skipped.length})
          </summary>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {summary.strava_workouts_skipped.slice(0, 20).map((activity) => (
              <li key={activity.strava_activity_id}>
                {activity.date}: {activity.name} ({activity.reason})
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {summary.needs_strava_connection || summary.needs_manual_history ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {summary.needs_strava_connection ? (
            <p>
              Connect Strava from the Workouts page, then generate again to let
              the server import missing six-week runs.
            </p>
          ) : null}
          {summary.needs_manual_history ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link className="font-medium underline" href="/profile">
                Fill manual history on Profile
              </Link>
              <button
                className="rounded-md bg-amber-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-amber-300"
                disabled={isBusy || !canGeneratePlan}
                onClick={onUseManualHistory}
                type="button"
              >
                Generate from manual history
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function TrainingPlanPanel() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [plansState, setPlansState] = useState<PlansState>(emptyState);
  const [showReplaceConfirmation, setShowReplaceConfirmation] =
    useState(false);
  const [generationAssumptions, setGenerationAssumptions] = useState<string[]>(
    [],
  );
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [generationHistorySummary, setGenerationHistorySummary] =
    useState<PlanGenerationHistorySummary | null>(null);
  const [planNameInput, setPlanNameInput] = useState("");
  const [planStartDateInput, setPlanStartDateInput] = useState(() =>
    getLocalDateText(),
  );
  const [isPlanPickerOpen, setIsPlanPickerOpen] = useState(false);
  const [pendingDeletePlanId, setPendingDeletePlanId] = useState<string | null>(
    null,
  );
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [deletePreviews, setDeletePreviews] = useState<DeletePreviewByPlanId>(
    {},
  );
  const [garminBridgeStatus, setGarminBridgeStatus] =
    useState<GarminBridgeStatusResponse | null>(null);
  const [garminBulkPreviewingWindowDays, setGarminBulkPreviewingWindowDays] =
    useState<GarminBulkPublishWindowDays | null>(null);
  const [garminBulkPublishing, setGarminBulkPublishing] = useState(false);
  const [garminBulkPreview, setGarminBulkPreview] =
    useState<GarminBulkPreviewWorkoutsResponse | null>(null);
  const [garminBulkPublishResult, setGarminBulkPublishResult] =
    useState<GarminBulkPublishWorkoutsResponse | null>(null);
  const [includeGarminRetryStatuses, setIncludeGarminRetryStatuses] =
    useState(false);
  const [stopGarminBulkOnError, setStopGarminBulkOnError] = useState(false);
  const [garminMaintenancePreviewing, setGarminMaintenancePreviewing] =
    useState<{
      mode: GarminBulkMaintenanceMode;
      windowDays: GarminBulkPublishWindowDays;
    } | null>(null);
  const [garminMaintenanceExecuting, setGarminMaintenanceExecuting] =
    useState(false);
  const [garminMaintenancePreview, setGarminMaintenancePreview] =
    useState<GarminBulkMaintenancePreviewResponse | null>(null);
  const [garminMaintenanceResult, setGarminMaintenanceResult] =
    useState<GarminBulkMaintenanceExecuteResponse | null>(null);
  const [
    selectedGarminMaintenanceDeleteIds,
    setSelectedGarminMaintenanceDeleteIds,
  ] = useState<string[]>([]);
  const [stopGarminMaintenanceOnError, setStopGarminMaintenanceOnError] =
    useState(false);

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
        message: "Garmin bridge is not reachable.",
      });
    }
  }, []);

  const loadPlans = useCallback(async (successMessage?: string) => {
    try {
      const profile = await fetchFirstProfile();

      if (!profile) {
        setPlansState(emptyState);
        setMessage(successMessage ?? "Create and save a Profile first.");
        setStatus("ready");
        return;
      }

      const [raceGoal, plans] = await Promise.all([
        fetchActiveRaceGoal(profile.id),
        fetchTrainingPlans(profile.id),
      ]);
      const activePlan = plans.find((plan) => plan.status === "active") ?? null;
      let workouts: PlannedWorkout[] = [];
      let planAdjustments: PlanAdjustment[] = [];

      if (activePlan) {
        [workouts, planAdjustments] = await Promise.all([
          fetchPlannedWorkouts(activePlan.id),
          fetchRecentPlanAdjustmentsForTrainingPlan(activePlan.id, 50),
        ]);
      }

      setPlansState({
        profile,
        raceGoal,
        plans,
        activePlan,
        workouts,
        planAdjustments,
      });
      setPendingDeletePlanId(null);
      setDeletingPlanId(null);
      setMessage(
        successMessage ??
          buildDefaultMessage({
            profile,
            raceGoal,
            plans,
            activePlan,
          }),
      );
      setStatus("ready");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load your training plans.",
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadPlans());
  }, [loadPlans]);

  useEffect(() => {
    void Promise.resolve().then(() => loadGarminBridgeStatus());
  }, [loadGarminBridgeStatus]);

  async function requestGeneratedPlan(input: {
    replaceActivePlan: boolean;
    historyMode: "auto" | "manual";
  }): Promise<GenerateTrainingPlanApiResponse> {
    const response = await fetch("/api/training-plans/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        planName: planNameInput,
        replaceActivePlan: input.replaceActivePlan,
        startDate: planStartDateInput,
        historyMode: input.historyMode,
      }),
    });
    const result = (await response.json()) as GenerateTrainingPlanApiResponse;

    return result;
  }

  async function handleGeneratePlan(
    replaceActivePlan: boolean,
    historyMode: "auto" | "manual" = "auto",
  ) {
    const activeRaceGoal = plansState.raceGoal;

    if (!activeRaceGoal) {
      setStatus("error");
      setMessage("Create and save an active Race Goal before generating a plan.");
      return;
    }

    const startDateValidationMessage = validatePlanStartDate({
      startDateText: planStartDateInput,
      raceDateText: activeRaceGoal.race_date,
      raceDistance: activeRaceGoal.distance,
    });

    if (startDateValidationMessage) {
      setStatus("error");
      setMessage(startDateValidationMessage);
      return;
    }

    setStatus("generating");
    setMessage("Generating and saving your training plan...");
    setShowReplaceConfirmation(false);
    setIsPlanPickerOpen(false);
    setPendingDeletePlanId(null);
    setGenerationAssumptions([]);
    setGenerationWarnings([]);
    setGenerationHistorySummary(null);

    let result: GenerateTrainingPlanApiResponse;

    try {
      result = await requestGeneratedPlan({
        replaceActivePlan,
        historyMode,
      });
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not generate and save the training plan.",
      );
      return;
    }

    setGenerationHistorySummary(result.historySummary);

    if (result.needsConfirmation) {
      setStatus("ready");
      setMessage(result.message);
      setShowReplaceConfirmation(true);
      return;
    }

    if (!result.success) {
      setStatus("error");
      setMessage(result.message);
      return;
    }

    await loadPlans(result.message);
    setPlanNameInput("");
    setGenerationAssumptions(result.assumptions);
    setGenerationWarnings(result.warnings);
    setGenerationHistorySummary(result.historySummary);
  }

  async function handleActivatePlan(trainingPlanId: string) {
    if (
      !trainingPlanId ||
      trainingPlanId === plansState.activePlan?.id ||
      status === "generating" ||
      status === "deleting"
    ) {
      return;
    }

    const selectedPlan =
      plansState.plans.find((plan) => plan.id === trainingPlanId) ?? null;

    if (!selectedPlan) {
      setStatus("error");
      setMessage("Could not find the selected training plan.");
      return;
    }

    setStatus("activating");
    setMessage(`Activating ${selectedPlan.name}...`);
    setShowReplaceConfirmation(false);
    setIsPlanPickerOpen(false);
    setPendingDeletePlanId(null);

    try {
      await activateTrainingPlan(trainingPlanId);
      await loadPlans(`${selectedPlan.name} is now active. Other plans are paused.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not activate plan: ${error.message}`
          : "Could not activate plan.",
      );
      setStatus("error");
    }
  }

  async function handleStartDeletePlan(trainingPlan: TrainingPlan) {
    if (status === "generating" || status === "activating" || deletingPlanId) {
      return;
    }

    setShowReplaceConfirmation(false);
    setPendingDeletePlanId(trainingPlan.id);

    if (deletePreviews[trainingPlan.id]) {
      return;
    }

    try {
      const preview = await fetchTrainingPlanDeletePreview(trainingPlan.id);
      setDeletePreviews((currentPreviews) => ({
        ...currentPreviews,
        [trainingPlan.id]: preview,
      }));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not check related plan data: ${error.message}`
          : "Could not check related plan data.",
      );
      setStatus("error");
    }
  }

  async function handleDeletePlan(
    trainingPlan: TrainingPlan,
    garminCleanupMode: GarminPlanDeleteCleanupMode,
  ) {
    setDeletingPlanId(trainingPlan.id);
    setStatus("deleting");
    setMessage(null);

    try {
      const response = await fetch("/api/training-plans/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trainingPlanId: trainingPlan.id,
          garminCleanupMode,
        }),
      });
      const deleteResponse =
        (await response.json()) as DeleteTrainingPlanResponse;

      if (!response.ok || !deleteResponse.ok || !deleteResponse.result) {
        throw new Error(
          deleteResponse.message || "Could not delete training plan.",
        );
      }

      setDeletePreviews((currentPreviews) => {
        const nextPreviews = { ...currentPreviews };
        delete nextPreviews[trainingPlan.id];
        return nextPreviews;
      });
      setIsPlanPickerOpen(false);
      await loadPlans(buildDeleteSuccessMessage(deleteResponse.result));
    } catch (error) {
      setDeletingPlanId(null);
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `Could not delete plan: ${error.message}`
          : "Could not delete plan.",
      );
    }
  }

  async function handlePreviewGarminBulkPublish(
    windowDays: GarminBulkPublishWindowDays,
  ) {
    if (!plansState.activePlan) {
      setStatus("error");
      setMessage("Select an active plan before previewing Garmin publish.");
      return;
    }

    setGarminBulkPreviewingWindowDays(windowDays);
    setGarminBulkPreview(null);
    setGarminBulkPublishResult(null);
    setGarminMaintenancePreview(null);
    setGarminMaintenanceResult(null);
    setSelectedGarminMaintenanceDeleteIds([]);
    setIncludeGarminRetryStatuses(false);
    setMessage(null);

    try {
      const response = await fetch("/api/garmin/bulk-preview-workouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trainingPlanId: plansState.activePlan.id,
          windowDays,
        }),
      });
      const result =
        (await response.json()) as GarminBulkPreviewWorkoutsResponse;

      setGarminBulkPreview(result);
      setMessage(result.message);
      setStatus(response.ok ? "ready" : "error");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not preview Garmin bulk publish.",
      );
    } finally {
      setGarminBulkPreviewingWindowDays(null);
    }
  }

  async function handlePublishGarminBulk() {
    if (!plansState.activePlan || !garminBulkPreview) {
      setStatus("error");
      setMessage("Preview a Garmin bulk publish window before publishing.");
      return;
    }

    const readyCount = includeGarminRetryStatuses
      ? garminBulkPreview.summary.readyCount +
        garminBulkPreview.summary.retryNeedsConfirmationCount
      : garminBulkPreview.summary.readyCount;

    if (readyCount === 0) {
      setStatus("error");
      setMessage("There are no Garmin workouts ready to publish from this preview.");
      return;
    }

    const confirmationMessages = [
      "This uses an unofficial local Garmin Connect bridge. It runs only on your laptop and may break if Garmin changes internal APIs.",
      `This will publish ${readyCount} workout${readyCount === 1 ? "" : "s"} sequentially and will not delete old Garmin workouts automatically.`,
    ];

    if (includeGarminRetryStatuses) {
      confirmationMessages.push(
        "Retrying failed exports should be used only when no Garmin workout was created by the previous attempt.",
      );
    }

    const confirmed = window.confirm(confirmationMessages.join("\n\n"));

    if (!confirmed) {
      return;
    }

    setGarminBulkPublishing(true);
    setGarminBulkPublishResult(null);
    setMessage(null);

    try {
      const response = await fetch("/api/garmin/bulk-publish-workouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trainingPlanId: plansState.activePlan.id,
          windowDays: garminBulkPreview.windowDays,
          includeRetryStatuses: includeGarminRetryStatuses,
          stopOnError: stopGarminBulkOnError,
        }),
      });
      const result =
        (await response.json()) as GarminBulkPublishWorkoutsResponse;

      setGarminBulkPublishResult(result);
      setMessage(result.message);
      setStatus(result.ok ? "ready" : "error");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not publish Garmin workouts.",
      );
    } finally {
      setGarminBulkPublishing(false);
    }
  }

  async function handlePreviewGarminBulkMaintenance(
    mode: GarminBulkMaintenanceMode,
    windowDays: GarminBulkPublishWindowDays,
  ) {
    if (!plansState.activePlan) {
      setStatus("error");
      setMessage("Select an active plan before previewing Garmin maintenance.");
      return;
    }

    setGarminMaintenancePreviewing({ mode, windowDays });
    setGarminMaintenancePreview(null);
    setGarminMaintenanceResult(null);
    setSelectedGarminMaintenanceDeleteIds([]);
    setGarminBulkPreview(null);
    setGarminBulkPublishResult(null);
    setMessage(null);

    try {
      const response = await fetch("/api/garmin/bulk-maintenance-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trainingPlanId: plansState.activePlan.id,
          mode,
          windowDays,
        }),
      });
      const result =
        (await response.json()) as GarminBulkMaintenancePreviewResponse;

      setGarminMaintenancePreview(result);
      setMessage(result.message);
      setStatus(response.ok ? "ready" : "error");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not preview Garmin bulk maintenance.",
      );
    } finally {
      setGarminMaintenancePreviewing(null);
    }
  }

  function handleToggleGarminMaintenanceDeleteSelection(
    plannedWorkoutId: string,
  ) {
    setSelectedGarminMaintenanceDeleteIds((currentIds) =>
      currentIds.includes(plannedWorkoutId)
        ? currentIds.filter((currentId) => currentId !== plannedWorkoutId)
        : [...currentIds, plannedWorkoutId],
    );
  }

  async function handleExecuteGarminBulkMaintenance() {
    if (!plansState.activePlan || !garminMaintenancePreview) {
      setStatus("error");
      setMessage("Preview Garmin bulk maintenance before executing it.");
      return;
    }

    const isDeleteMode = garminMaintenancePreview.mode === "delete_selected";
    const executeCount = isDeleteMode
      ? selectedGarminMaintenanceDeleteIds.length
      : garminMaintenancePreview.summary.readyCount;

    if (executeCount === 0) {
      setStatus("error");
      setMessage(
        isDeleteMode
          ? "Select at least one Garmin export to delete."
          : "There are no stale Garmin exports ready to update.",
      );
      return;
    }

    const confirmationMessages = isDeleteMode
      ? [
          `This will ask the local Garmin bridge to delete ${executeCount} Garmin export${executeCount === 1 ? "" : "s"}.`,
          "This does not delete the planned workout from the app.",
          "Confirm the result in Garmin Connect and on the watch afterward.",
        ]
      : [
          `This will update ${executeCount} stale Garmin export${executeCount === 1 ? "" : "s"} sequentially.`,
          "For each workout, the app will try to remove the old Garmin workout, then publish the current app version.",
          "If Garmin removal fails, an older duplicate may remain in Garmin.",
        ];
    const confirmed = window.confirm(confirmationMessages.join("\n\n"));

    if (!confirmed) {
      return;
    }

    setGarminMaintenanceExecuting(true);
    setGarminMaintenanceResult(null);
    setMessage(null);

    try {
      const response = await fetch("/api/garmin/bulk-maintenance-execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trainingPlanId: plansState.activePlan.id,
          mode: garminMaintenancePreview.mode,
          windowDays: garminMaintenancePreview.windowDays,
          selectedPlannedWorkoutIds: isDeleteMode
            ? selectedGarminMaintenanceDeleteIds
            : [],
          stopOnError: stopGarminMaintenanceOnError,
        }),
      });
      const result =
        (await response.json()) as GarminBulkMaintenanceExecuteResponse;

      setGarminMaintenanceResult(result);
      setMessage(result.message);
      setStatus(result.ok ? "ready" : "error");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not execute Garmin bulk maintenance.",
      );
    } finally {
      setGarminMaintenanceExecuting(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Loading training plans...
      </div>
    );
  }

  const { profile, raceGoal, plans, activePlan, workouts, planAdjustments } =
    plansState;
  const isGenerating = status === "generating";
  const isActivating = status === "activating";
  const isDeleting = status === "deleting";
  const isGarminBulkBusy =
    garminBulkPreviewingWindowDays !== null || garminBulkPublishing;
  const isGarminMaintenanceBusy =
    garminMaintenancePreviewing !== null || garminMaintenanceExecuting;
  const isBusy =
    isGenerating ||
    isActivating ||
    isDeleting ||
    isGarminBulkBusy ||
    isGarminMaintenanceBusy;
  const isGarminBridgeConfigured = garminBridgeStatus?.enabled === true;
  const todayDateText = getLocalDateText();
  const latestAllowedPlanStartDate = raceGoal
    ? getLatestAllowedPlanStartDate(raceGoal.race_date, raceGoal.distance)
    : "";
  const planStartValidationMessage = raceGoal
    ? validatePlanStartDate({
        startDateText: planStartDateInput,
        raceDateText: raceGoal.race_date,
        raceDistance: raceGoal.distance,
        todayDateText,
      })
    : null;
  const canShowGenerationControls = Boolean(profile && raceGoal);
  const canGeneratePlan = Boolean(
    profile && raceGoal && !planStartValidationMessage,
  );
  const weeklyWorkoutGroups = groupWorkoutsByWeek(workouts);
  const plannedWorkoutById = buildPlannedWorkoutById(workouts);
  const planChangingAdjustments =
    filterPlanChangingAdjustments(planAdjustments).slice(0, 10);
  const garminBulkPreviewPublishCount = garminBulkPreview
    ? garminBulkPreview.summary.readyCount +
      (includeGarminRetryStatuses
        ? garminBulkPreview.summary.retryNeedsConfirmationCount
        : 0)
    : 0;
  const garminMaintenanceExecuteCount = garminMaintenancePreview
    ? garminMaintenancePreview.mode === "delete_selected"
      ? selectedGarminMaintenanceDeleteIds.length
      : garminMaintenancePreview.summary.readyCount
    : 0;

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

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-medium text-slate-950">
              Plan readiness
            </h2>
            <dl className="mt-4 grid gap-4 text-sm md:grid-cols-3">
              <div>
                <dt className="font-medium text-slate-700">Profile</dt>
                <dd className="mt-1 text-slate-600">
                  {profile ? profile.display_name : "Missing"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Race goal</dt>
                <dd className="mt-1 text-slate-600">
                  {raceGoal ? raceGoal.race_name : "Missing"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Active plan</dt>
                <dd className="mt-1 text-slate-600">
                  {activePlan ? activePlan.name : "None selected"}
                </dd>
              </div>
            </dl>
          </div>

          {canShowGenerationControls ? (
            <div className="w-full space-y-3 md:max-w-sm">
              <div>
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="new-plan-name"
                >
                  New plan name (optional)
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  disabled={isBusy}
                  id="new-plan-name"
                  maxLength={120}
                  onChange={(event) => setPlanNameInput(event.target.value)}
                  placeholder={
                    raceGoal
                      ? buildDefaultTrainingPlanName(raceGoal)
                      : "Race Distance Plan"
                  }
                  type="text"
                  value={planNameInput}
                />
              </div>

              <div>
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="new-plan-start-date"
                >
                  Plan start date
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  disabled={isBusy}
                  id="new-plan-start-date"
                  max={latestAllowedPlanStartDate}
                  min={todayDateText}
                  onChange={(event) =>
                    setPlanStartDateInput(event.target.value)
                  }
                  type="date"
                  value={planStartDateInput}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Leave this as today or choose a later start date.
                </p>
                {planStartValidationMessage ? (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {planStartValidationMessage}
                  </p>
                ) : null}
              </div>

              <button
                className={`w-full rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:bg-slate-300 ${
                  activePlan
                    ? "border border-slate-300 bg-white text-slate-900"
                    : "bg-slate-950 text-white"
                }`}
                disabled={isBusy || !canGeneratePlan}
                onClick={() => handleGeneratePlan(false)}
                type="button"
              >
                {isGenerating
                  ? "Generating..."
                  : activePlan
                    ? "Generate replacement plan"
                    : "Generate Plan"}
              </button>
            </div>
          ) : null}
        </div>

        {!profile ? (
          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Save a profile before generating a plan.{" "}
            <Link className="font-medium text-slate-950 underline" href="/profile">
              Go to Profile
            </Link>
          </div>
        ) : null}

        {profile && !raceGoal ? (
          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Save an active race goal before generating a plan.{" "}
            <Link className="font-medium text-slate-950 underline" href="/goal">
              Go to Goal
            </Link>
          </div>
        ) : null}

        {showReplaceConfirmation && activePlan ? (
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>
              This will save a new paused plan with its planned workouts, then
              activate it and pause the current active plan.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                className="rounded-md bg-amber-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-amber-300"
                disabled={isBusy || !canGeneratePlan}
                onClick={() =>
                  handleGeneratePlan(
                    true,
                    generationHistorySummary?.coverage === "manual"
                      ? "manual"
                      : "auto",
                  )
                }
                type="button"
              >
                Generate and activate replacement
              </button>
              <button
                className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isBusy}
                onClick={() => {
                  setShowReplaceConfirmation(false);
                  setMessage("Kept the current active training plan.");
                }}
                type="button"
              >
                Keep current plan
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {generationHistorySummary ? (
        <PlanGenerationHistorySummaryCard
          canGeneratePlan={canGeneratePlan}
          isBusy={isBusy}
          onUseManualHistory={() => handleGeneratePlan(false, "manual")}
          summary={generationHistorySummary}
        />
      ) : null}

      {profile ? (
        <section className="rounded-md border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">
                Plans management
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                The selected plan is used by Dashboard and Workouts.
              </p>
            </div>
            <button
              className="w-fit rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isBusy}
              onClick={() => loadPlans()}
              type="button"
            >
              Refresh
            </button>
          </div>

          {plans.length === 0 ? (
            <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              No saved plans yet. Generate a plan to start managing plans here.
            </div>
          ) : (
            <>
              <div className="mt-5">
                <p className="text-sm font-medium text-slate-800">
                  Active plan
                </p>
                <button
                  aria-controls="plan-picker"
                  aria-expanded={isPlanPickerOpen}
                  className="mt-1 flex w-full flex-col gap-2 rounded-md border border-slate-300 bg-white px-4 py-3 text-left text-sm text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100 md:flex-row md:items-center md:justify-between"
                  disabled={isBusy}
                  onClick={() => {
                    setShowReplaceConfirmation(false);
                    setIsPlanPickerOpen((currentValue) => !currentValue);
                  }}
                  type="button"
                >
                  <span>
                    {activePlan ? activePlan.name : "No active plan selected"}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {activePlan ? (
                      <span
                        className={`w-fit rounded-md border px-2 py-1 text-xs font-medium uppercase tracking-wide ${getStatusBadgeClass(
                          activePlan.status,
                        )}`}
                      >
                        {activePlan.status}
                      </span>
                    ) : null}
                    <span className="text-xs font-medium text-slate-600">
                      {isPlanPickerOpen ? "Close picker" : "Open picker"}
                    </span>
                  </span>
                </button>

                {isPlanPickerOpen ? (
                  <div
                    className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200"
                    id="plan-picker"
                  >
                    {plans.map((plan) => {
                      const isActive = plan.status === "active";
                      const isConfirmingDelete = pendingDeletePlanId === plan.id;
                      const isDeletingThisPlan = deletingPlanId === plan.id;
                      const preview = deletePreviews[plan.id];

                      return (
                        <article
                          className={`grid gap-4 p-4 text-sm md:grid-cols-[minmax(170px,220px)_1fr] ${
                            isDeletingThisPlan ? "opacity-60" : ""
                          }`}
                          key={plan.id}
                        >
                          <div className="flex flex-wrap gap-2 md:block md:space-y-2">
                            {isActive ? (
                              <span className="inline-flex w-fit rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                                Current active
                              </span>
                            ) : (
                              <button
                                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isBusy}
                                onClick={() => handleActivatePlan(plan.id)}
                                type="button"
                              >
                                Make active
                              </button>
                            )}

                            {isConfirmingDelete ? (
                              <>
                                <button
                                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={isDeletingThisPlan}
                                  onClick={() => setPendingDeletePlanId(null)}
                                  type="button"
                                >
                                  Cancel
                                </button>
                                {preview ? (
                                  preview.futureGarminExportCount > 0 ? (
                                    <>
                                      <button
                                        className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={isDeletingThisPlan}
                                        onClick={() =>
                                          handleDeletePlan(plan, "app_only")
                                        }
                                        type="button"
                                      >
                                        Delete app plan only
                                      </button>
                                      <button
                                        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={isDeletingThisPlan}
                                        onClick={() =>
                                          handleDeletePlan(
                                            plan,
                                            "attempt_future_delete",
                                          )
                                        }
                                        type="button"
                                      >
                                        {isDeletingThisPlan
                                          ? "Deleting..."
                                          : "Delete app plan and attempt Garmin cleanup"}
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                                      disabled={isDeletingThisPlan}
                                      onClick={() =>
                                        handleDeletePlan(plan, "app_only")
                                      }
                                      type="button"
                                    >
                                      {isDeletingThisPlan
                                        ? "Deleting..."
                                        : "Delete permanently"}
                                    </button>
                                  )
                                ) : (
                                  <button
                                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 opacity-60"
                                    disabled
                                    type="button"
                                  >
                                    Checking...
                                  </button>
                                )}
                              </>
                            ) : (
                              <button
                                className="rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isBusy}
                                onClick={() => handleStartDeletePlan(plan)}
                                type="button"
                              >
                                Delete
                              </button>
                            )}
                          </div>

                          <div>
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div>
                                <h3 className="font-medium text-slate-950">
                                  {plan.name}
                                </h3>
                                <p className="mt-1 text-slate-600">
                                  {formatPlanDateRange(plan)}
                                </p>
                              </div>
                              <span
                                className={`w-fit rounded-md border px-2 py-1 text-xs font-medium uppercase tracking-wide ${getStatusBadgeClass(
                                  plan.status,
                                )}`}
                              >
                                {plan.status}
                              </span>
                            </div>

                            <dl className="mt-3 grid gap-3 text-slate-600 md:grid-cols-3">
                              <div>
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Total weeks
                                </dt>
                                <dd className="mt-1">{plan.total_weeks}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Created
                                </dt>
                                <dd className="mt-1">
                                  {formatDate(plan.created_at.slice(0, 10))}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Updated
                                </dt>
                                <dd className="mt-1">
                                  {formatDate(plan.updated_at.slice(0, 10))}
                                </dd>
                              </div>
                            </dl>

                            {isConfirmingDelete ? (
                              <div className="mt-3 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-800">
                                {preview ? (
                                  <>
                                    <p>
                                      This will delete{" "}
                                      {preview.plannedWorkoutCount} planned
                                      workouts and{" "}
                                      {preview.workoutEvaluationCount} workout
                                      evaluations.{" "}
                                      {preview.linkedLoggedWorkoutCount} logged
                                      workouts will be kept but unlinked from
                                      this plan.
                                    </p>
                                    {preview.futureGarminExportCount > 0 ? (
                                      <div className="mt-3 border-t border-red-200 pt-3">
                                        <p className="font-medium">
                                          This plan has workouts already
                                          exported to Garmin.
                                        </p>
                                        <p className="mt-1">
                                          Choose whether to delete only the app
                                          plan or also attempt to remove future
                                          Garmin workouts. Garmin cleanup is
                                          never automatic.
                                        </p>
                                        <ul className="mt-2 list-disc space-y-1 pl-5">
                                          {preview.futureGarminExports.map(
                                            (garminExport) => (
                                              <li
                                                key={`${garminExport.plannedWorkoutId}-${garminExport.garminWorkoutId}`}
                                              >
                                                {formatDate(
                                                  garminExport.workoutDate,
                                                )}{" "}
                                                - {garminExport.title} (Garmin
                                                ID:{" "}
                                                {
                                                  garminExport.garminWorkoutId
                                                }
                                                )
                                              </li>
                                            ),
                                          )}
                                        </ul>
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <p>Checking related plan data...</p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      ) : null}

      {generationWarnings.length > 0 ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-base font-medium text-amber-950">
            Plan warnings
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-900">
            {generationWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {generationAssumptions.length > 0 ? (
        <section className="rounded-md border border-slate-200 bg-white p-6">
          <h2 className="text-base font-medium text-slate-950">
            Generation assumptions
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
            {generationAssumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {activePlan ? (
        <section className="rounded-md border border-slate-200 bg-white p-6">
          <h2 className="text-base font-medium text-slate-950">
            Recent plan adjustments
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Recent changes made by workout logging and scoring.
          </p>

          {planChangingAdjustments.length === 0 ? (
            <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              No plan-changing adjustments have been saved yet.
            </div>
          ) : (
            <div className="mt-5 divide-y divide-slate-100 rounded-md border border-slate-200">
              {planChangingAdjustments.map((adjustment) => {
                const affectedWorkoutLabels = formatAffectedWorkoutLabels(
                  adjustment,
                  plannedWorkoutById,
                );

                return (
                  <article className="p-4 text-sm" key={adjustment.id}>
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-medium text-slate-950">
                          {formatAdjustmentTypeLabel(
                            adjustment.adjustment_type,
                          )}
                        </p>
                        <p className="mt-1 text-slate-600">
                          {formatTimestampDate(adjustment.created_at)}
                        </p>
                      </div>
                      <span className="w-fit rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">
                        Plan changed
                      </span>
                    </div>

                    <dl className="mt-4 grid gap-3 text-slate-700 md:grid-cols-2">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Reason
                        </dt>
                        <dd className="mt-1">{adjustment.reason}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Explanation
                        </dt>
                        <dd className="mt-1">
                          {adjustment.explanation ?? "No explanation saved."}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Affected future workouts
                      </p>
                      {affectedWorkoutLabels.length === 0 ? (
                        <p className="mt-1 text-slate-700">
                          No affected workouts were saved for this adjustment.
                        </p>
                      ) : (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
                          {affectedWorkoutLabels.map((label, index) => (
                            <li key={`${adjustment.id}-${index}`}>{label}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {activePlan ? (
        <section className="rounded-md border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">
                {activePlan.name}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Active plan workout schedule
              </p>
            </div>
            <span
              className={`w-fit rounded-md border px-2 py-1 text-xs font-medium uppercase tracking-wide ${getStatusBadgeClass(
                activePlan.status,
              )}`}
            >
              {activePlan.status}
            </span>
          </div>

          <dl className="mt-4 grid gap-4 text-sm md:grid-cols-3">
            <div>
              <dt className="font-medium text-slate-700">Start date</dt>
              <dd className="mt-1 text-slate-600">
                {formatDate(activePlan.start_date)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Race/end date</dt>
              <dd className="mt-1 text-slate-600">
                {formatDate(activePlan.end_date)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Total weeks</dt>
              <dd className="mt-1 text-slate-600">{activePlan.total_weeks}</dd>
            </div>
          </dl>

          {isGarminBridgeConfigured ? (
            <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-medium text-amber-950">
                    Direct Garmin bulk publishing
                  </h3>
                  <p className="mt-1 text-amber-900">
                    This previews upcoming workouts first. Nothing is sent to
                    Garmin until you confirm the preview.
                  </p>
                  {garminBridgeStatus ? (
                    <p className="mt-2 text-amber-900">
                      Bridge status: {garminBridgeStatus.message}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    disabled={isBusy}
                    onClick={() => void handlePreviewGarminBulkPublish(7)}
                    type="button"
                  >
                    {garminBulkPreviewingWindowDays === 7
                      ? "Previewing..."
                      : "Publish next 7 days to Garmin"}
                  </button>
                  <button
                    className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    disabled={isBusy}
                    onClick={() => void handlePreviewGarminBulkPublish(14)}
                    type="button"
                  >
                    {garminBulkPreviewingWindowDays === 14
                      ? "Previewing..."
                      : "Publish next 14 days to Garmin"}
                  </button>
                </div>
              </div>

              {garminBulkPreview ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-white p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-medium text-slate-950">
                        Garmin preview: next {garminBulkPreview.windowDays} days
                      </p>
                      <p className="mt-1 text-slate-700">
                        {garminBulkPreview.message}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                      <div>
                        <p className="font-medium uppercase tracking-wide text-slate-500">
                          Ready
                        </p>
                        <p
                          className={`mt-1 ${getBulkSummaryCountClass(
                            garminBulkPreview.summary.readyCount,
                          )}`}
                        >
                          {garminBulkPreview.summary.readyCount}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium uppercase tracking-wide text-slate-500">
                          Skipped
                        </p>
                        <p
                          className={`mt-1 ${getBulkSummaryCountClass(
                            garminBulkPreview.summary.skippedCount,
                          )}`}
                        >
                          {garminBulkPreview.summary.skippedCount}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium uppercase tracking-wide text-slate-500">
                          Confirm
                        </p>
                        <p
                          className={`mt-1 ${getBulkSummaryCountClass(
                            garminBulkPreview.summary
                              .retryNeedsConfirmationCount,
                          )}`}
                        >
                          {
                            garminBulkPreview.summary
                              .retryNeedsConfirmationCount
                          }
                        </p>
                      </div>
                      <div>
                        <p className="font-medium uppercase tracking-wide text-slate-500">
                          Invalid
                        </p>
                        <p
                          className={`mt-1 ${getBulkSummaryCountClass(
                            garminBulkPreview.summary.invalidCount,
                          )}`}
                        >
                          {garminBulkPreview.summary.invalidCount}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label className="flex items-start gap-2 text-slate-700">
                      <input
                        checked={includeGarminRetryStatuses}
                        className="mt-1"
                        disabled={isBusy}
                        onChange={(event) =>
                          setIncludeGarminRetryStatuses(event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        Include failed retries
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-slate-700">
                      <input
                        checked={stopGarminBulkOnError}
                        className="mt-1"
                        disabled={isBusy}
                        onChange={(event) =>
                          setStopGarminBulkOnError(event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>Stop on first Garmin publish error</span>
                    </label>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="py-2 pr-3 font-medium">Date</th>
                          <th className="py-2 pr-3 font-medium">Workout</th>
                          <th className="py-2 pr-3 font-medium">Type</th>
                          <th className="py-2 pr-3 font-medium">Pace</th>
                          <th className="py-2 pr-3 font-medium">Export</th>
                          <th className="py-2 pr-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {garminBulkPreview.workouts.map((workout) => (
                          <tr key={workout.plannedWorkoutId}>
                            <td className="py-2 pr-3">
                              {formatDate(workout.workoutDate)}
                            </td>
                            <td className="py-2 pr-3">
                              <p className="font-medium text-slate-950">
                                {workout.title}
                              </p>
                              {workout.warnings.length > 0 ? (
                                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">
                                  {workout.warnings.map((warning) => (
                                    <li key={warning}>{warning}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3">
                              {formatLabel(workout.workoutType)}
                            </td>
                            <td className="py-2 pr-3">
                              {workout.paceTargetCount}
                            </td>
                            <td className="py-2 pr-3">
                              {getGarminBulkExportStatusLabel(
                                workout.exportStatus,
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <span
                                className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-medium ${getGarminBulkActionBadgeClass(
                                  workout.action,
                                )}`}
                              >
                                {getGarminBulkActionLabel(workout.action)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4">
                    <button
                      className="rounded-md bg-amber-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-amber-300"
                      disabled={isBusy || garminBulkPreviewPublishCount === 0}
                      onClick={() => void handlePublishGarminBulk()}
                      type="button"
                    >
                      {garminBulkPublishing
                        ? "Publishing..."
                        : `Confirm Garmin publish (${garminBulkPreviewPublishCount})`}
                    </button>
                  </div>
                </div>
              ) : null}

              {garminBulkPublishResult ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-white p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-medium text-slate-950">
                        Garmin publish summary
                      </p>
                      <p className="mt-1 text-slate-700">
                        {garminBulkPublishResult.message}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                      <div>
                        <p className="font-medium uppercase tracking-wide text-slate-500">
                          Published
                        </p>
                        <p className="mt-1 text-slate-950">
                          {garminBulkPublishResult.summary.publishedCount}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium uppercase tracking-wide text-slate-500">
                          Skipped
                        </p>
                        <p className="mt-1 text-slate-950">
                          {garminBulkPublishResult.summary.skippedCount}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium uppercase tracking-wide text-slate-500">
                          Failed
                        </p>
                        <p className="mt-1 text-slate-950">
                          {garminBulkPublishResult.summary.failedCount}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium uppercase tracking-wide text-slate-500">
                          Partial
                        </p>
                        <p className="mt-1 text-slate-950">
                          {garminBulkPublishResult.summary.partialCount}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {garminBulkPublishResult.results.map((result) => (
                      <div
                        className="rounded-md border border-slate-100 p-3"
                        key={result.plannedWorkoutId}
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="font-medium text-slate-950">
                              {formatDate(result.workoutDate)} - {result.title}
                            </p>
                            <p className="mt-1 text-slate-700">
                              {result.message}
                            </p>
                            {result.garminWorkoutId ? (
                              <p className="mt-1 text-slate-700">
                                Garmin workout ID: {result.garminWorkoutId}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-medium ${getGarminBulkResultBadgeClass(
                              result.status,
                            )}`}
                          >
                            {formatLabel(result.status)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 border-t border-amber-200 pt-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h4 className="font-medium text-amber-950">
                      Bulk maintenance
                    </h4>
                    <p className="mt-1 text-amber-900">
                      Use this for existing Direct Garmin exports only. Preview
                      first, then confirm the maintenance action.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      disabled={isBusy}
                      onClick={() =>
                        void handlePreviewGarminBulkMaintenance(
                          "update_stale",
                          7,
                        )
                      }
                      type="button"
                    >
                      {garminMaintenancePreviewing?.mode === "update_stale" &&
                      garminMaintenancePreviewing.windowDays === 7
                        ? "Previewing..."
                        : "Update stale Garmin exports in next 7 days"}
                    </button>
                    <button
                      className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      disabled={isBusy}
                      onClick={() =>
                        void handlePreviewGarminBulkMaintenance(
                          "update_stale",
                          14,
                        )
                      }
                      type="button"
                    >
                      {garminMaintenancePreviewing?.mode === "update_stale" &&
                      garminMaintenancePreviewing.windowDays === 14
                        ? "Previewing..."
                        : "Update stale Garmin exports in next 14 days"}
                    </button>
                    <button
                      className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      disabled={isBusy}
                      onClick={() =>
                        void handlePreviewGarminBulkMaintenance(
                          "delete_selected",
                          7,
                        )
                      }
                      type="button"
                    >
                      {garminMaintenancePreviewing?.mode ===
                        "delete_selected" &&
                      garminMaintenancePreviewing.windowDays === 7
                        ? "Previewing..."
                        : "Delete Garmin exports in next 7 days"}
                    </button>
                    <button
                      className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      disabled={isBusy}
                      onClick={() =>
                        void handlePreviewGarminBulkMaintenance(
                          "delete_selected",
                          14,
                        )
                      }
                      type="button"
                    >
                      {garminMaintenancePreviewing?.mode ===
                        "delete_selected" &&
                      garminMaintenancePreviewing.windowDays === 14
                        ? "Previewing..."
                        : "Delete Garmin exports in next 14 days"}
                    </button>
                  </div>
                </div>

                {garminMaintenancePreview ? (
                  <div className="mt-4 rounded-md border border-amber-200 bg-white p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-medium text-slate-950">
                          {getGarminMaintenanceModeLabel(
                            garminMaintenancePreview.mode,
                          )}
                          : next {garminMaintenancePreview.windowDays} days
                        </p>
                        <p className="mt-1 text-slate-700">
                          {garminMaintenancePreview.message}
                        </p>
                      </div>
                      <div className="text-xs">
                        <p className="font-medium uppercase tracking-wide text-slate-500">
                          Ready
                        </p>
                        <p
                          className={`mt-1 ${getBulkSummaryCountClass(
                            garminMaintenancePreview.summary.readyCount,
                          )}`}
                        >
                          {garminMaintenancePreview.summary.readyCount}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="flex items-start gap-2 text-slate-700">
                        <input
                          checked={stopGarminMaintenanceOnError}
                          className="mt-1"
                          disabled={isBusy}
                          onChange={(event) =>
                            setStopGarminMaintenanceOnError(
                              event.target.checked,
                            )
                          }
                          type="checkbox"
                        />
                        <span>Stop on first Garmin maintenance error</span>
                      </label>
                    </div>

                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            {garminMaintenancePreview.mode ===
                            "delete_selected" ? (
                              <th className="py-2 pr-3 font-medium">Select</th>
                            ) : null}
                            <th className="py-2 pr-3 font-medium">Date</th>
                            <th className="py-2 pr-3 font-medium">Workout</th>
                            <th className="py-2 pr-3 font-medium">Status</th>
                            <th className="py-2 pr-3 font-medium">
                              Garmin ID
                            </th>
                            <th className="py-2 pr-3 font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {garminMaintenancePreview.workouts.map((workout) => (
                            <tr key={workout.plannedWorkoutId}>
                              {garminMaintenancePreview.mode ===
                              "delete_selected" ? (
                                <td className="py-2 pr-3">
                                  <input
                                    checked={selectedGarminMaintenanceDeleteIds.includes(
                                      workout.plannedWorkoutId,
                                    )}
                                    disabled={isBusy}
                                    onChange={() =>
                                      handleToggleGarminMaintenanceDeleteSelection(
                                        workout.plannedWorkoutId,
                                      )
                                    }
                                    type="checkbox"
                                  />
                                </td>
                              ) : null}
                              <td className="py-2 pr-3">
                                {formatDate(workout.workoutDate)}
                              </td>
                              <td className="py-2 pr-3">
                                <p className="font-medium text-slate-950">
                                  {workout.title}
                                </p>
                                {workout.warnings.length > 0 ? (
                                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">
                                    {workout.warnings.map((warning) => (
                                      <li key={warning}>{warning}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </td>
                              <td className="py-2 pr-3">
                                {getGarminBulkExportStatusLabel(
                                  workout.currentStatus,
                                )}
                              </td>
                              <td className="py-2 pr-3">
                                {workout.garminWorkoutId}
                              </td>
                              <td className="py-2 pr-3">
                                <span
                                  className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-medium ${getGarminMaintenanceActionBadgeClass(
                                    workout.plannedAction,
                                  )}`}
                                >
                                  {getGarminMaintenanceActionLabel(
                                    workout.plannedAction,
                                  )}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4">
                      <button
                        className="rounded-md bg-amber-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-amber-300"
                        disabled={
                          isBusy || garminMaintenanceExecuteCount === 0
                        }
                        onClick={() =>
                          void handleExecuteGarminBulkMaintenance()
                        }
                        type="button"
                      >
                        {garminMaintenanceExecuting
                          ? "Running maintenance..."
                          : `Confirm Garmin maintenance (${garminMaintenanceExecuteCount})`}
                      </button>
                    </div>
                  </div>
                ) : null}

                {garminMaintenanceResult ? (
                  <div className="mt-4 rounded-md border border-amber-200 bg-white p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-medium text-slate-950">
                          Garmin maintenance summary
                        </p>
                        <p className="mt-1 text-slate-700">
                          {garminMaintenanceResult.message}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                        <div>
                          <p className="font-medium uppercase tracking-wide text-slate-500">
                            Updated
                          </p>
                          <p className="mt-1 text-slate-950">
                            {garminMaintenanceResult.summary.updatedCount}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium uppercase tracking-wide text-slate-500">
                            Deleted
                          </p>
                          <p className="mt-1 text-slate-950">
                            {garminMaintenanceResult.summary.deletedCount}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium uppercase tracking-wide text-slate-500">
                            Failed
                          </p>
                          <p className="mt-1 text-slate-950">
                            {garminMaintenanceResult.summary.failedCount}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium uppercase tracking-wide text-slate-500">
                            Partial
                          </p>
                          <p className="mt-1 text-slate-950">
                            {garminMaintenanceResult.summary.partialCount}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium uppercase tracking-wide text-slate-500">
                            Skipped
                          </p>
                          <p className="mt-1 text-slate-950">
                            {garminMaintenanceResult.summary.skippedCount}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {garminMaintenanceResult.results.map((result) => (
                        <div
                          className="rounded-md border border-slate-100 p-3"
                          key={result.plannedWorkoutId}
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-medium text-slate-950">
                                {formatDate(result.workoutDate)} -{" "}
                                {result.title}
                              </p>
                              <p className="mt-1 text-slate-700">
                                {result.message}
                              </p>
                              {result.resultGarminWorkoutId ? (
                                <p className="mt-1 text-slate-700">
                                  Garmin workout ID:{" "}
                                  {result.resultGarminWorkoutId}
                                </p>
                              ) : (
                                <p className="mt-1 text-slate-700">
                                  Garmin workout ID: {result.garminWorkoutId}
                                </p>
                              )}
                              {result.warnings.length > 0 ? (
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800">
                                  {result.warnings.map((warning) => (
                                    <li key={warning}>{warning}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                            <span
                              className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-medium ${getGarminMaintenanceResultBadgeClass(
                                result.status,
                              )}`}
                            >
                              {formatLabel(result.status)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-6 space-y-6">
            {weeklyWorkoutGroups.map((weekGroup) => (
              <section key={weekGroup.weekNumber}>
                <h3 className="text-sm font-medium text-slate-950">
                  Week {weekGroup.weekNumber}
                </h3>
                <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
                  {weekGroup.workouts.map((workout) => (
                    <div
                      className="grid gap-3 p-4 text-sm md:grid-cols-[minmax(110px,140px)_1fr]"
                      key={workout.id}
                    >
                      <div className="text-slate-600">
                        {formatDate(workout.workout_date)}
                      </div>
                      <div>
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium text-slate-950">
                              {workout.title}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                              {formatLabel(workout.workout_type)}
                            </p>
                          </div>
                          <span className="w-fit rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
                            {workout.status}
                          </span>
                        </div>

                        <dl className="mt-3 grid gap-3 text-slate-600 md:grid-cols-4">
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Load
                            </dt>
                            <dd className="mt-1">
                              {formatWorkoutLoad(workout)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Pace
                            </dt>
                            <dd className="mt-1">{formatPaceRange(workout)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Terrain
                            </dt>
                            <dd className="mt-1">
                              {formatTerrain(workout.terrain)}
                            </dd>
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

                        <StructuredWorkoutPreview workout={workout} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
