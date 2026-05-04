"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchFirstProfile } from "@/lib/db/profiles";
import { fetchActiveRaceGoal } from "@/lib/db/raceGoals";
import { fetchActiveTrainingPlanWithWorkouts } from "@/lib/db/trainingPlans";
import { generateAndSaveTrainingPlan } from "@/lib/training/generateAndSaveTrainingPlan";
import type {
  PlannedWorkout,
  Profile,
  RaceGoal,
  TrainingPlan,
} from "@/types";

type LoadStatus = "loading" | "ready" | "generating" | "error";

type ActivePlanState = {
  profile: Profile | null;
  raceGoal: RaceGoal | null;
  plan: TrainingPlan | null;
  workouts: PlannedWorkout[];
};

type WeeklyWorkoutGroup = {
  weekNumber: number;
  workouts: PlannedWorkout[];
};

const emptyState: ActivePlanState = {
  profile: null,
  raceGoal: null,
  plan: null,
  workouts: [],
};

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

function formatTerrain(terrain: string | null): string {
  return terrain ? formatLabel(terrain) : "No terrain target";
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

export function TrainingPlanPanel() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [activePlanState, setActivePlanState] =
    useState<ActivePlanState>(emptyState);
  const [showReplaceConfirmation, setShowReplaceConfirmation] =
    useState(false);
  const [generationAssumptions, setGenerationAssumptions] = useState<string[]>(
    [],
  );
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);

  const loadTrainingPlan = useCallback(async (successMessage?: string) => {
    try {
      const profile = await fetchFirstProfile();

      if (!profile) {
        setActivePlanState(emptyState);
        setMessage(successMessage ?? "Create and save a Profile first.");
        setStatus("ready");
        return;
      }

      const raceGoal = await fetchActiveRaceGoal(profile.id);

      if (!raceGoal) {
        setActivePlanState({
          ...emptyState,
          profile,
        });
        setMessage(
          successMessage ??
            "Create and save a Race Goal before generating a plan.",
        );
        setStatus("ready");
        return;
      }

      const activePlan = await fetchActiveTrainingPlanWithWorkouts(profile.id);

      setActivePlanState({
        profile,
        raceGoal,
        plan: activePlan?.plan ?? null,
        workouts: activePlan?.workouts ?? [],
      });
      setMessage(
        successMessage ??
          (activePlan
            ? "Loaded your active training plan."
            : "No training plan has been generated yet."),
      );
      setStatus("ready");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load your training plan.",
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadTrainingPlan());
  }, [loadTrainingPlan]);

  async function handleGeneratePlan(archiveExistingPlan: boolean) {
    setStatus("generating");
    setMessage("Generating and saving your training plan...");
    setShowReplaceConfirmation(false);
    setGenerationAssumptions([]);
    setGenerationWarnings([]);

    const result = await generateAndSaveTrainingPlan({ archiveExistingPlan });

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

    await loadTrainingPlan(result.message);
    setGenerationAssumptions(result.assumptions);
    setGenerationWarnings(result.warnings);
  }

  if (status === "loading") {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Loading training plan...
      </div>
    );
  }

  const { profile, raceGoal, plan, workouts } = activePlanState;
  const isGenerating = status === "generating";
  const canGeneratePlan = Boolean(profile && raceGoal);
  const weeklyWorkoutGroups = groupWorkoutsByWeek(workouts);

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
                  {plan ? plan.name : "Not generated yet"}
                </dd>
              </div>
            </dl>
          </div>

          {canGeneratePlan ? (
            <button
              className={`w-fit rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:bg-slate-300 ${
                plan
                  ? "border border-slate-300 bg-white text-slate-900"
                  : "bg-slate-950 text-white"
              }`}
              disabled={isGenerating}
              onClick={() => handleGeneratePlan(false)}
              type="button"
            >
              {isGenerating
                ? "Generating..."
                : plan
                  ? "Generate replacement plan"
                  : "Generate Plan"}
            </button>
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

        {showReplaceConfirmation && plan ? (
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>
              This will archive the current active plan, then save a new active
              plan and its planned workouts.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                className="rounded-md bg-amber-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-amber-300"
                disabled={isGenerating}
                onClick={() => handleGeneratePlan(true)}
                type="button"
              >
                Archive current plan and generate new one
              </button>
              <button
                className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900"
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

      {plan ? (
        <section className="rounded-md border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">
                {plan.name}
              </h2>
            </div>
            <span className="w-fit rounded-md border border-slate-200 px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
              {plan.status}
            </span>
          </div>

          <dl className="mt-4 grid gap-4 text-sm md:grid-cols-3">
            <div>
              <dt className="font-medium text-slate-700">Start date</dt>
              <dd className="mt-1 text-slate-600">
                {formatDate(plan.start_date)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Race/end date</dt>
              <dd className="mt-1 text-slate-600">
                {formatDate(plan.end_date)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Total weeks</dt>
              <dd className="mt-1 text-slate-600">{plan.total_weeks}</dd>
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
                      key={workout.id}
                      className="grid gap-3 p-4 text-sm md:grid-cols-[minmax(110px,140px)_1fr]"
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
