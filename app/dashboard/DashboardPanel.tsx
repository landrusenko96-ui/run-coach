"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchPlanAdjustmentDashboardSummary,
  fetchRecentPlanAdjustmentsForTrainingPlan,
} from "@/lib/db/planAdjustments";
import { fetchIntervalsWorkoutSyncsForTrainingPlan } from "@/lib/db/intervalsWorkoutSyncs";
import { fetchFirstProfile } from "@/lib/db/profiles";
import { fetchActiveTrainingPlanWithWorkouts } from "@/lib/db/trainingPlans";
import {
  fetchLoggedWorkoutsForTrainingPlan,
  fetchWorkoutEvaluationsForTrainingPlan,
} from "@/lib/db/workouts";
import { fetchWorkoutExportsForTrainingPlan } from "@/lib/db/workoutExports";
import {
  buildDashboardWeekSummary,
  buildRunProgressSummary,
  type DashboardGarminStatus,
  type DashboardIntervalsStatus,
  type DashboardWeekSummary,
  type DashboardWeekWorkout,
} from "@/lib/training/dashboardWeek";
import { deriveCurrentPlanStatus, type CurrentPlanStatus } from "@/lib/training/dashboardStatus";
import { formatAdjustmentTypeLabel } from "@/lib/training/planAdjustmentDisplay";
import type {
  IntervalsWorkoutSync,
  LoggedWorkout,
  PlanAdjustment,
  PlannedWorkout,
  Profile,
  TrainingPlan,
  WorkoutEvaluation,
  WorkoutExport,
} from "@/types";

type LoadStatus = "loading" | "ready" | "error";

type DashboardState = {
  profile: Profile | null;
  plan: TrainingPlan | null;
  plannedWorkouts: PlannedWorkout[];
  loggedWorkouts: LoggedWorkout[];
  workoutEvaluations: WorkoutEvaluation[];
  intervalsWorkoutSyncs: IntervalsWorkoutSync[];
  workoutExports: WorkoutExport[];
  planAdjustments: PlanAdjustment[];
  latestPlanAdjustment: PlanAdjustment | null;
  adjustmentCount: number;
};

const emptyState: DashboardState = {
  profile: null,
  plan: null,
  plannedWorkouts: [],
  loggedWorkouts: [],
  workoutEvaluations: [],
  intervalsWorkoutSyncs: [],
  workoutExports: [],
  planAdjustments: [],
  latestPlanAdjustment: null,
  adjustmentCount: 0,
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

function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm === null || secondsPerKm <= 0) {
    return "No pace";
  }

  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = secondsPerKm % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function formatDistance(distanceKm: number | null): string {
  return distanceKm !== null ? `${distanceKm} km` : "No distance";
}

function formatDuration(durationSec: number | null): string {
  if (durationSec === null) {
    return "No duration";
  }

  const hours = Math.floor(durationSec / 3600);
  const minutes = Math.floor((durationSec % 3600) / 60);
  const seconds = durationSec % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

function buildPlannedWorkoutById(
  plannedWorkouts: PlannedWorkout[],
): Map<string, PlannedWorkout> {
  return new Map(plannedWorkouts.map((workout) => [workout.id, workout]));
}

function buildLoggedWorkoutById(
  loggedWorkouts: LoggedWorkout[],
): Map<string, LoggedWorkout> {
  return new Map(loggedWorkouts.map((workout) => [workout.id, workout]));
}

function formatCurrentPlanStatus(status: CurrentPlanStatus): string {
  if (status === "needs_recovery") {
    return "Needs recovery";
  }

  if (status === "caution") {
    return "Caution";
  }

  return "On track";
}

function getCurrentPlanStatusBadgeClass(status: CurrentPlanStatus): string {
  if (status === "needs_recovery") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (status === "caution") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function getCurrentPlanStatusDescription(status: CurrentPlanStatus): string {
  if (status === "needs_recovery") {
    return "Recent scores show high-risk fatigue signals. Prioritize recovery before adding stress.";
  }

  if (status === "caution") {
    return "Recent scores or plan changes suggest watching fatigue closely.";
  }

  return "Recent scores do not show major risk signals.";
}

function formatPaceRange(workout: PlannedWorkout): string {
  if (
    workout.target_pace_min_sec_per_km !== null &&
    workout.target_pace_max_sec_per_km !== null
  ) {
    return `${formatPace(workout.target_pace_min_sec_per_km)} - ${formatPace(
      workout.target_pace_max_sec_per_km,
    )}`;
  }

  if (workout.target_pace_min_sec_per_km !== null) {
    return `From ${formatPace(workout.target_pace_min_sec_per_km)}`;
  }

  if (workout.target_pace_max_sec_per_km !== null) {
    return `Up to ${formatPace(workout.target_pace_max_sec_per_km)}`;
  }

  return "No pace target";
}

function getTodayCardTitle(todayWorkout: DashboardWeekWorkout | null): string {
  if (!todayWorkout) {
    return "No planned workout today";
  }

  if (todayWorkout.loggedWorkout) {
    return "Today is done";
  }

  if (!todayWorkout.isRunWorkout) {
    return todayWorkout.workout.workout_type === "rest"
      ? "Rest day today"
      : "Non-run workout today";
  }

  return "Today's workout";
}

function getTodayCardDescription(
  todayWorkout: DashboardWeekWorkout | null,
): string {
  if (!todayWorkout) {
    return "No workout is planned for today in the active plan.";
  }

  if (todayWorkout.loggedWorkout) {
    return "A logged workout already covers today.";
  }

  if (!todayWorkout.isRunWorkout) {
    return "No run log is needed for this planned day unless you choose to add one.";
  }

  return todayWorkout.workout.purpose ?? "Complete this planned run when ready.";
}

function formatIntervalsStatusLabel(
  syncStatus: DashboardIntervalsStatus,
): string {
  if (syncStatus === "not_synced") {
    return "Not synced";
  }

  if (syncStatus === "needs_resync") {
    return "Needs republish";
  }

  return formatLabel(syncStatus);
}

function getIntervalsStatusBadgeClass(
  syncStatus: DashboardIntervalsStatus,
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

  return "border-slate-200 bg-white text-slate-600";
}

function formatGarminStatusLabel(syncStatus: DashboardGarminStatus): string {
  if (syncStatus === "not_synced") {
    return "Not exported";
  }

  if (syncStatus === "stale") {
    return "Stale";
  }

  return formatLabel(syncStatus);
}

function getGarminStatusBadgeClass(syncStatus: DashboardGarminStatus): string {
  if (syncStatus === "synced") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (syncStatus === "partial" || syncStatus === "stale") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (syncStatus === "failed") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-slate-200 bg-white text-slate-600";
}

function getPlannedStatusBadgeClass(statusValue: PlannedWorkout["status"]): string {
  if (statusValue === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (statusValue === "missed" || statusValue === "skipped") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-white text-slate-600";
}

function getRiskBadgeClass(
  riskLevel: WorkoutEvaluation["risk_level"],
): string {
  if (riskLevel === "high") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (riskLevel === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function getAttentionBadgeClass(
  attentionType: DashboardWeekSummary["exportHealth"]["attentionItems"][number]["type"],
): string {
  if (attentionType === "intervals") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  if (attentionType === "garmin") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (attentionType === "high_risk_score") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-slate-200 bg-white text-slate-700";
}

function formatAttentionTypeLabel(
  attentionType: DashboardWeekSummary["exportHealth"]["attentionItems"][number]["type"],
): string {
  if (attentionType === "intervals") {
    return "Intervals";
  }

  if (attentionType === "garmin") {
    return "Garmin";
  }

  if (attentionType === "high_risk_score") {
    return "High risk";
  }

  return "Missing score";
}

export function DashboardPanel() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [dashboardState, setDashboardState] =
    useState<DashboardState>(emptyState);

  const loadDashboard = useCallback(async () => {
    try {
      const profile = await fetchFirstProfile();

      if (!profile) {
        setDashboardState(emptyState);
        setMessage("Create and save a Profile first.");
        setStatus("ready");
        return;
      }

      const activePlan = await fetchActiveTrainingPlanWithWorkouts(profile.id);

      if (!activePlan) {
        setDashboardState({
          ...emptyState,
          profile,
        });
        setMessage(
          "Generate or select an active training plan on the Plan page to see dashboard metrics.",
        );
        setStatus("ready");
        return;
      }

      const [
        loggedWorkouts,
        workoutEvaluations,
        planAdjustmentSummary,
        recentPlanAdjustments,
        intervalsWorkoutSyncs,
        workoutExports,
      ] = await Promise.all([
        fetchLoggedWorkoutsForTrainingPlan(activePlan.plan.id),
        fetchWorkoutEvaluationsForTrainingPlan(activePlan.plan.id),
        fetchPlanAdjustmentDashboardSummary(activePlan.plan.id),
        fetchRecentPlanAdjustmentsForTrainingPlan(activePlan.plan.id, 10),
        fetchIntervalsWorkoutSyncsForTrainingPlan(activePlan.plan.id),
        fetchWorkoutExportsForTrainingPlan(activePlan.plan.id),
      ]);

      setDashboardState({
        profile,
        plan: activePlan.plan,
        plannedWorkouts: activePlan.workouts,
        loggedWorkouts,
        workoutEvaluations,
        intervalsWorkoutSyncs,
        workoutExports,
        planAdjustments: recentPlanAdjustments,
        latestPlanAdjustment: planAdjustmentSummary.latestPlanAdjustment,
        adjustmentCount: planAdjustmentSummary.adjustmentCount,
      });
      setMessage(null);
      setStatus("ready");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load dashboard data.",
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadDashboard());
  }, [loadDashboard]);

  const {
    profile,
    plan,
    plannedWorkouts,
    loggedWorkouts,
    workoutEvaluations,
    intervalsWorkoutSyncs,
    workoutExports,
    planAdjustments,
    latestPlanAdjustment,
    adjustmentCount,
  } = dashboardState;
  const plannedWorkoutById = useMemo(
    () => buildPlannedWorkoutById(plannedWorkouts),
    [plannedWorkouts],
  );
  const loggedWorkoutById = useMemo(
    () => buildLoggedWorkoutById(loggedWorkouts),
    [loggedWorkouts],
  );
  const dashboardWeek = useMemo<DashboardWeekSummary>(
    () =>
      buildDashboardWeekSummary({
        plannedWorkouts,
        loggedWorkouts,
        workoutEvaluations,
        intervalsWorkoutSyncs,
        workoutExports,
        planAdjustments,
      }),
    [
      plannedWorkouts,
      loggedWorkouts,
      workoutEvaluations,
      intervalsWorkoutSyncs,
      workoutExports,
      planAdjustments,
    ],
  );
  const runProgress = useMemo(
    () => buildRunProgressSummary(plannedWorkouts, loggedWorkouts),
    [plannedWorkouts, loggedWorkouts],
  );
  const recentLoggedWorkouts = useMemo(
    () =>
      [...loggedWorkouts]
        .sort((firstWorkout, secondWorkout) =>
          secondWorkout.workout_date.localeCompare(firstWorkout.workout_date),
        )
        .slice(0, 5),
    [loggedWorkouts],
  );
  const recentWorkoutEvaluations = useMemo(
    () =>
      [...workoutEvaluations]
        .sort((firstEvaluation, secondEvaluation) =>
          secondEvaluation.created_at.localeCompare(firstEvaluation.created_at),
        )
        .slice(0, 5),
    [workoutEvaluations],
  );
  const recentHighRiskEvaluations = recentWorkoutEvaluations.filter(
    (evaluation) => evaluation.risk_level === "high",
  );
  const currentPlanStatus = deriveCurrentPlanStatus({
    recentWorkoutEvaluations,
    latestPlanAdjustment,
  });

  if (status === "loading") {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Loading dashboard...
      </div>
    );
  }

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
          Save a profile before using the dashboard. {" "}
          <Link className="font-medium text-slate-950 underline" href="/profile">
            Go to Profile
          </Link>
        </section>
      ) : null}

      {profile && !plan ? (
        <section className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-700">
          Generate or select an active training plan before using the dashboard.{" "}
          <Link className="font-medium text-slate-950 underline" href="/plan">
            Go to Plan
          </Link>
        </section>
      ) : null}

      {profile && plan ? (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Today
              </p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">
                {getTodayCardTitle(dashboardWeek.todayWorkout)}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {formatDate(dashboardWeek.todayDateText)}
              </p>
              {dashboardWeek.todayWorkout ? (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-950">
                    {dashboardWeek.todayWorkout.workout.title}
                  </p>
                  <p className="mt-1">
                    {formatLabel(
                      dashboardWeek.todayWorkout.workout.workout_type,
                    )}{" "}
                    - {formatWorkoutLoad(dashboardWeek.todayWorkout.workout)}
                  </p>
                  {dashboardWeek.todayWorkout.workoutEvaluation ? (
                    <p className="mt-1">
                      Score:{" "}
                      {dashboardWeek.todayWorkout.workoutEvaluation.overall_score}
                      /100
                    </p>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-4 text-sm text-slate-700">
                {getTodayCardDescription(dashboardWeek.todayWorkout)}
              </p>
              <Link
                className="mt-4 inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                href="/workouts"
              >
                Open Workouts
              </Link>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Next workout
              </p>
              {dashboardWeek.nextPlannedRun ? (
                <div>
                  <h2 className="mt-2 text-lg font-semibold text-slate-950">
                    {dashboardWeek.nextPlannedRun.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatDate(dashboardWeek.nextPlannedRun.workout_date)} -{" "}
                    {formatLabel(dashboardWeek.nextPlannedRun.workout_type)}
                  </p>
                  <dl className="mt-4 space-y-2 text-sm text-slate-700">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Load</dt>
                      <dd className="text-right">
                        {formatWorkoutLoad(dashboardWeek.nextPlannedRun)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Pace</dt>
                      <dd className="text-right">
                        {formatPaceRange(dashboardWeek.nextPlannedRun)}
                      </dd>
                    </div>
                  </dl>
                  {dashboardWeek.nextPlannedRun.purpose ? (
                    <p className="mt-4 text-sm text-slate-700">
                      {dashboardWeek.nextPlannedRun.purpose}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-700">
                  No future planned running workouts found.
                </p>
              )}
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Export health
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="font-medium text-slate-950">Intervals.icu</p>
                  <p className="mt-1 text-slate-600">
                    {dashboardWeek.exportHealth.intervals.synced} synced
                  </p>
                  <p className="text-slate-600">
                    {dashboardWeek.exportHealth.intervals.needsRepublish} needs
                    republish
                  </p>
                  <p className="text-slate-600">
                    {dashboardWeek.exportHealth.intervals.failed} failed
                  </p>
                  <p className="text-slate-600">
                    {dashboardWeek.exportHealth.intervals.notSynced} not synced
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="font-medium text-slate-950">Garmin</p>
                  <p className="mt-1 text-slate-600">
                    {dashboardWeek.exportHealth.garmin.synced} synced
                  </p>
                  <p className="text-slate-600">
                    {dashboardWeek.exportHealth.garmin.stale} stale
                  </p>
                  <p className="text-slate-600">
                    {dashboardWeek.exportHealth.garmin.partial} partial
                  </p>
                  <p className="text-slate-600">
                    {dashboardWeek.exportHealth.garmin.failed} failed
                  </p>
                  <p className="text-slate-600">
                    {dashboardWeek.exportHealth.garmin.notExported} not
                    exported
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-medium text-slate-950">
                  This week
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Today through the next 6 calendar days.
                </p>
              </div>
              <Link
                className="w-fit rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                href="/workouts"
              >
                Manage workouts
              </Link>
            </div>

            {dashboardWeek.thisWeekWorkouts.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                No planned workouts in the next 7 days.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
                {dashboardWeek.thisWeekWorkouts.map((weekWorkout) => (
                  <div
                    className="grid gap-3 p-4 text-sm lg:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)]"
                    key={weekWorkout.workout.id}
                  >
                    <div>
                      <p className="font-medium text-slate-950">
                        {weekWorkout.workout.title}
                      </p>
                      <p className="mt-1 text-slate-600">
                        {formatDate(weekWorkout.workout.workout_date)} -{" "}
                        {formatLabel(weekWorkout.workout.workout_type)}
                      </p>
                      <p className="mt-1 text-slate-600">
                        {formatWorkoutLoad(weekWorkout.workout)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md border px-2 py-1 text-xs font-medium ${getPlannedStatusBadgeClass(
                          weekWorkout.workout.status,
                        )}`}
                      >
                        {formatLabel(weekWorkout.workout.status)}
                      </span>
                      {weekWorkout.loggedWorkout ? (
                        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                          Logged
                        </span>
                      ) : null}
                      {weekWorkout.workoutEvaluation ? (
                        <span
                          className={`rounded-md border px-2 py-1 text-xs font-medium ${getRiskBadgeClass(
                            weekWorkout.workoutEvaluation.risk_level,
                          )}`}
                        >
                          Score {weekWorkout.workoutEvaluation.overall_score}
                          /100
                        </span>
                      ) : null}
                      {weekWorkout.isRunWorkout ? (
                        <>
                          <span
                            className={`rounded-md border px-2 py-1 text-xs font-medium ${getIntervalsStatusBadgeClass(
                              weekWorkout.intervalsStatus,
                            )}`}
                          >
                            Intervals:{" "}
                            {formatIntervalsStatusLabel(
                              weekWorkout.intervalsStatus,
                            )}
                          </span>
                          <span
                            className={`rounded-md border px-2 py-1 text-xs font-medium ${getGarminStatusBadgeClass(
                              weekWorkout.garminStatus,
                            )}`}
                          >
                            Garmin:{" "}
                            {formatGarminStatusLabel(weekWorkout.garminStatus)}
                          </span>
                        </>
                      ) : (
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
                          No run export needed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-medium text-slate-950">
                  Attention needed
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Export issues, missing scores, and high-risk recent scores.
                </p>
              </div>
              <Link
                className="w-fit rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                href="/workouts"
              >
                Review in Workouts
              </Link>
            </div>

            {dashboardWeek.exportHealth.attentionItems.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                No attention-needed items found for the active plan.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
                {dashboardWeek.exportHealth.attentionItems
                  .slice(0, 8)
                  .map((attentionItem) => (
                    <div
                      className="flex flex-col gap-2 p-4 text-sm md:flex-row md:items-start md:justify-between"
                      key={attentionItem.id}
                    >
                      <div>
                        <p className="font-medium text-slate-950">
                          {attentionItem.title}
                        </p>
                        <p className="mt-1 text-slate-600">
                          {formatDate(attentionItem.workoutDate)} -{" "}
                          {attentionItem.message}
                        </p>
                      </div>
                      <span
                        className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getAttentionBadgeClass(
                          attentionItem.type,
                        )}`}
                      >
                        {formatAttentionTypeLabel(attentionItem.type)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-medium text-slate-950">
                  Plan changes
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Latest saved adaptive plan change for this active plan.
                </p>
              </div>
              <Link
                className="w-fit rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                href="/plan"
              >
                Review Plan
              </Link>
            </div>

            {dashboardWeek.planChangeSummary.latestAdjustment ? (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-medium text-slate-950">
                  {formatAdjustmentTypeLabel(
                    dashboardWeek.planChangeSummary.latestAdjustment
                      .adjustment_type,
                  )}
                </p>
                <p className="mt-1 text-slate-600">
                  {formatTimestampDate(
                    dashboardWeek.planChangeSummary.latestAdjustment.created_at,
                  )}
                </p>
                <p className="mt-3">
                  {dashboardWeek.planChangeSummary.latestAdjustment.reason}
                </p>
                {dashboardWeek.planChangeSummary.latestAdjustment.explanation ? (
                  <p className="mt-1">
                    {
                      dashboardWeek.planChangeSummary.latestAdjustment
                        .explanation
                    }
                  </p>
                ) : null}
                {dashboardWeek.planChangeSummary.latestAffectedWorkoutLabels
                  .length > 0 ? (
                  <div className="mt-3">
                    <p className="font-medium text-slate-950">
                      Affected workouts
                    </p>
                    <ul className="mt-1 list-inside list-disc space-y-1">
                      {dashboardWeek.planChangeSummary.latestAffectedWorkoutLabels.map(
                        (label) => (
                          <li key={label}>{label}</li>
                        ),
                      )}
                    </ul>
                  </div>
                ) : null}
                <p className="mt-3 text-slate-600">
                  {dashboardWeek.planChangeSummary.recentPlanChangingCount}{" "}
                  plan-changing adjustment
                  {dashboardWeek.planChangeSummary.recentPlanChangingCount === 1
                    ? ""
                    : "s"}{" "}
                  in the latest dashboard records.
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">
                No plan-changing adjustments have been saved yet.
              </p>
            )}
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-medium text-slate-950">
                  Current plan
                </h2>
                <p className="mt-1 text-sm text-slate-600">{plan.name}</p>
              </div>
              <Link
                className="w-fit rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                href="/workouts"
              >
                Open workouts
              </Link>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Completed runs
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {runProgress.completedRuns}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Remaining planned runs
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {runProgress.remainingPlannedRuns}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Run completion
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {runProgress.runCompletionPercentage}%
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-medium text-slate-950">
                  Adaptive plan status
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Milestone 5 summary from workout scores and saved plan
                  adjustments.
                </p>
              </div>
              <span
                className={`w-fit rounded-md border px-3 py-2 text-sm font-medium ${getCurrentPlanStatusBadgeClass(
                  currentPlanStatus,
                )}`}
              >
                {formatCurrentPlanStatus(currentPlanStatus)}
              </span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Adjustments made
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {adjustmentCount}
                </p>
                <p className="mt-2">
                  {getCurrentPlanStatusDescription(currentPlanStatus)}
                </p>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Latest plan adjustment
                </p>
                {latestPlanAdjustment ? (
                  <div className="mt-2">
                    <p className="font-medium text-slate-950">
                      {formatAdjustmentTypeLabel(
                        latestPlanAdjustment.adjustment_type,
                      )}
                    </p>
                    <p className="mt-1 text-slate-600">
                      {formatTimestampDate(latestPlanAdjustment.created_at)}
                    </p>
                    <p className="mt-2">{latestPlanAdjustment.reason}</p>
                    {latestPlanAdjustment.explanation ? (
                      <p className="mt-1">
                        {latestPlanAdjustment.explanation}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2">
                    No plan-changing adjustments have been saved yet.
                  </p>
                )}
              </div>
            </div>

            {recentHighRiskEvaluations.length > 0 ? (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {recentHighRiskEvaluations.length} recent high-risk workout{" "}
                {recentHighRiskEvaluations.length === 1 ? "score" : "scores"}{" "}
                found. Keep the next workouts conservative and consider extra
                recovery if fatigue is still high.
              </div>
            ) : null}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-md border border-slate-200 bg-white p-6">
              <h2 className="text-base font-medium text-slate-950">
                Recent logged workouts
              </h2>
              {recentLoggedWorkouts.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">
                  No logged workouts yet.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
                  {recentLoggedWorkouts.map((loggedWorkout) => {
                    const plannedWorkout = loggedWorkout.planned_workout_id
                      ? plannedWorkoutById.get(loggedWorkout.planned_workout_id) ??
                        null
                      : null;

                    return (
                      <div className="p-4 text-sm" key={loggedWorkout.id}>
                        <p className="font-medium text-slate-950">
                          {plannedWorkout?.title ?? formatLabel(loggedWorkout.workout_type)}
                        </p>
                        <p className="mt-1 text-slate-600">
                          {formatDate(loggedWorkout.workout_date)} - {formatDistance(loggedWorkout.distance_km)} - {formatDuration(loggedWorkout.duration_sec)}
                        </p>
                        <p className="mt-1 text-slate-600">
                          Pace: {formatPace(loggedWorkout.avg_pace_sec_per_km)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-md border border-slate-200 bg-white p-6">
              <h2 className="text-base font-medium text-slate-950">
                Recent workout scores
              </h2>
              {recentWorkoutEvaluations.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">
                  No workout scores yet.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
                  {recentWorkoutEvaluations.map((evaluation) => {
                    const plannedWorkout = evaluation.planned_workout_id
                      ? plannedWorkoutById.get(evaluation.planned_workout_id) ??
                        null
                      : null;
                    const loggedWorkout = loggedWorkoutById.get(
                      evaluation.logged_workout_id,
                    );

                    return (
                      <div className="p-4 text-sm" key={evaluation.id}>
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="font-medium text-slate-950">
                              {plannedWorkout?.title ?? "Logged workout"}
                            </p>
                            <p className="mt-1 text-slate-600">
                              {loggedWorkout ? formatDate(loggedWorkout.workout_date) : formatDate(evaluation.created_at.slice(0, 10))}
                            </p>
                          </div>
                          <span className="w-fit rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
                            {evaluation.overall_score}/100
                          </span>
                        </div>
                        <p className="mt-2 text-slate-600">
                          {formatLabel(evaluation.risk_level)} risk
                        </p>
                        {evaluation.summary ? (
                          <p className="mt-1 text-slate-700">
                            {evaluation.summary}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
