"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchPlanAdjustmentDashboardSummary } from "@/lib/db/planAdjustments";
import { fetchFirstProfile } from "@/lib/db/profiles";
import { fetchActiveTrainingPlanWithWorkouts } from "@/lib/db/trainingPlans";
import {
  fetchLoggedWorkoutsForTrainingPlan,
  fetchWorkoutEvaluationsForTrainingPlan,
} from "@/lib/db/workouts";
import { deriveCurrentPlanStatus, type CurrentPlanStatus } from "@/lib/training/dashboardStatus";
import { formatAdjustmentTypeLabel } from "@/lib/training/planAdjustmentDisplay";
import type {
  LoggedWorkout,
  PlanAdjustment,
  PlannedWorkout,
  Profile,
  TrainingPlan,
  WorkoutEvaluation,
  WorkoutType,
} from "@/types";

type LoadStatus = "loading" | "ready" | "error";

type DashboardState = {
  profile: Profile | null;
  plan: TrainingPlan | null;
  plannedWorkouts: PlannedWorkout[];
  loggedWorkouts: LoggedWorkout[];
  workoutEvaluations: WorkoutEvaluation[];
  latestPlanAdjustment: PlanAdjustment | null;
  adjustmentCount: number;
};

const emptyState: DashboardState = {
  profile: null,
  plan: null,
  plannedWorkouts: [],
  loggedWorkouts: [],
  workoutEvaluations: [],
  latestPlanAdjustment: null,
  adjustmentCount: 0,
};

const runningWorkoutTypes: WorkoutType[] = [
  "easy",
  "long_run",
  "tempo",
  "interval",
  "marathon_pace",
  "recovery",
  "calibration",
];

function isRunningWorkout(workout: PlannedWorkout): boolean {
  return runningWorkoutTypes.includes(workout.workout_type);
}

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

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getNextPlannedWorkout(workouts: PlannedWorkout[]): PlannedWorkout | null {
  const today = getTodayDate();
  const plannedWorkouts = workouts
    .filter(
      (workout) => workout.status === "planned" && isRunningWorkout(workout),
    )
    .sort((firstWorkout, secondWorkout) =>
      firstWorkout.workout_date.localeCompare(secondWorkout.workout_date),
    );

  return (
    plannedWorkouts.find((workout) => workout.workout_date >= today) ??
    plannedWorkouts[0] ??
    null
  );
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

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
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
      ] = await Promise.all([
        fetchLoggedWorkoutsForTrainingPlan(activePlan.plan.id),
        fetchWorkoutEvaluationsForTrainingPlan(activePlan.plan.id),
        fetchPlanAdjustmentDashboardSummary(activePlan.plan.id),
      ]);

      setDashboardState({
        profile,
        plan: activePlan.plan,
        plannedWorkouts: activePlan.workouts,
        loggedWorkouts,
        workoutEvaluations,
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
  const nextPlannedWorkout = useMemo(
    () => getNextPlannedWorkout(plannedWorkouts),
    [plannedWorkouts],
  );
  const completedWorkoutCount = loggedWorkouts.length;
  const remainingPlannedWorkoutCount = plannedWorkouts.filter(
    (workout) => workout.status === "planned",
  ).length;
  const completedPlannedWorkoutCount = plannedWorkouts.filter(
    (workout) => workout.status === "completed",
  ).length;
  const planCompletionPercentage = plannedWorkouts.length
    ? clampPercentage((completedPlannedWorkoutCount / plannedWorkouts.length) * 100)
    : 0;
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
                  Completed workouts
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {completedWorkoutCount}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Remaining planned
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {remainingPlannedWorkoutCount}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Plan completion
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {planCompletionPercentage}%
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

          <section className="rounded-md border border-slate-200 bg-white p-6">
            <h2 className="text-base font-medium text-slate-950">
              Next planned workout
            </h2>
            {nextPlannedWorkout ? (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-medium text-slate-950">
                  {nextPlannedWorkout.title}
                </p>
                <p className="mt-1">
                  {formatDate(nextPlannedWorkout.workout_date)} - {formatLabel(nextPlannedWorkout.workout_type)}
                </p>
                <p className="mt-1">{formatWorkoutLoad(nextPlannedWorkout)}</p>
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                No remaining planned running workouts.
              </div>
            )}
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
