"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchRecentPlanAdjustmentsForTrainingPlan } from "@/lib/db/planAdjustments";
import { fetchFirstProfile } from "@/lib/db/profiles";
import { fetchActiveRaceGoal } from "@/lib/db/raceGoals";
import {
  activateTrainingPlan,
  deleteTrainingPlanAndRelatedData,
  fetchPlannedWorkouts,
  fetchTrainingPlanDeletePreview,
  fetchTrainingPlans,
  type DeleteTrainingPlanResult,
  type TrainingPlanDeletePreview,
} from "@/lib/db/trainingPlans";
import { generateAndSaveTrainingPlan } from "@/lib/training/generateAndSaveTrainingPlan";
import {
  filterPlanChangingAdjustments,
  formatAdjustmentTypeLabel,
  formatAffectedWorkoutLabels,
} from "@/lib/training/planAdjustmentDisplay";
import { buildDefaultTrainingPlanName } from "@/lib/training/planGenerator";
import type {
  PlanAdjustment,
  PlannedWorkout,
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

function buildDeleteSuccessMessage(result: DeleteTrainingPlanResult): string {
  const activePlanMessage = result.was_active
    ? " It was the active plan, so select another plan before using Dashboard or Workouts."
    : "";

  return `Deleted ${result.deleted_plan_name}. Removed ${result.deleted_planned_workout_count} planned workouts and ${result.deleted_workout_evaluation_count} workout evaluations. Kept and unlinked ${result.unlinked_logged_workout_count} logged workouts.${activePlanMessage}`;
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
  const [planNameInput, setPlanNameInput] = useState("");
  const [isPlanPickerOpen, setIsPlanPickerOpen] = useState(false);
  const [pendingDeletePlanId, setPendingDeletePlanId] = useState<string | null>(
    null,
  );
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [deletePreviews, setDeletePreviews] = useState<DeletePreviewByPlanId>(
    {},
  );

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

  async function handleGeneratePlan(replaceActivePlan: boolean) {
    setStatus("generating");
    setMessage("Generating and saving your training plan...");
    setShowReplaceConfirmation(false);
    setIsPlanPickerOpen(false);
    setPendingDeletePlanId(null);
    setGenerationAssumptions([]);
    setGenerationWarnings([]);

    const result = await generateAndSaveTrainingPlan({
      planName: planNameInput,
      replaceActivePlan,
    });

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

  async function handleDeletePlan(trainingPlan: TrainingPlan) {
    setDeletingPlanId(trainingPlan.id);
    setStatus("deleting");
    setMessage(null);

    try {
      const result = await deleteTrainingPlanAndRelatedData(trainingPlan.id);
      setDeletePreviews((currentPreviews) => {
        const nextPreviews = { ...currentPreviews };
        delete nextPreviews[trainingPlan.id];
        return nextPreviews;
      });
      setIsPlanPickerOpen(false);
      await loadPlans(buildDeleteSuccessMessage(result));
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
  const isBusy = isGenerating || isActivating || isDeleting;
  const canGeneratePlan = Boolean(profile && raceGoal);
  const weeklyWorkoutGroups = groupWorkoutsByWeek(workouts);
  const plannedWorkoutById = buildPlannedWorkoutById(workouts);
  const planChangingAdjustments =
    filterPlanChangingAdjustments(planAdjustments).slice(0, 10);

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

          {canGeneratePlan ? (
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

              <button
                className={`w-full rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:bg-slate-300 ${
                  activePlan
                    ? "border border-slate-300 bg-white text-slate-900"
                    : "bg-slate-950 text-white"
                }`}
                disabled={isBusy}
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
                disabled={isBusy}
                onClick={() => handleGeneratePlan(true)}
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
                                <button
                                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={isDeletingThisPlan}
                                  onClick={() => handleDeletePlan(plan)}
                                  type="button"
                                >
                                  {isDeletingThisPlan
                                    ? "Deleting..."
                                    : "Delete permanently"}
                                </button>
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
                                  <p>
                                    This will delete{" "}
                                    {preview.plannedWorkoutCount} planned
                                    workouts and{" "}
                                    {preview.workoutEvaluationCount} workout
                                    evaluations.{" "}
                                    {preview.linkedLoggedWorkoutCount} logged
                                    workouts will be kept but unlinked from this
                                    plan.
                                  </p>
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
