"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { fetchFirstProfile } from "@/lib/db/profiles";
import { fetchActiveTrainingPlanWithWorkouts } from "@/lib/db/trainingPlans";
import {
  deleteLoggedWorkout,
  fetchLoggedWorkoutsForPlannedWorkout,
  fetchLoggedWorkoutsForTrainingPlan,
  fetchPlannedWorkoutById,
  fetchWorkoutEvaluationsForTrainingPlan,
  markPlannedWorkoutCompleted,
  markPlannedWorkoutPlanned,
  saveLoggedWorkout,
  saveWorkoutEvaluation,
  type SaveLoggedWorkoutInput,
} from "@/lib/db/workouts";
import { scoreWorkout } from "@/lib/training/workoutScoring";
import type {
  LoggedWorkout,
  LoggedWorkoutType,
  PlannedWorkout,
  WorkoutEvaluation,
  Profile,
  TrainingPlan,
  WorkoutType,
} from "@/types";

type LoadStatus = "loading" | "ready" | "saving" | "deleting" | "error" | "saved";

type WorkoutsState = {
  profile: Profile | null;
  plan: TrainingPlan | null;
  plannedWorkouts: PlannedWorkout[];
  loggedWorkouts: LoggedWorkout[];
  workoutEvaluations: WorkoutEvaluation[];
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
  plan: null,
  plannedWorkouts: [],
  loggedWorkouts: [],
  workoutEvaluations: [],
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

function addLoggedWorkoutIfMissing(
  loggedWorkouts: LoggedWorkout[],
  loggedWorkout: LoggedWorkout,
): LoggedWorkout[] {
  if (loggedWorkouts.some((currentLog) => currentLog.id === loggedWorkout.id)) {
    return loggedWorkouts;
  }

  return [...loggedWorkouts, loggedWorkout];
}

function addWorkoutEvaluationIfMissing(
  evaluations: WorkoutEvaluation[],
  evaluation: WorkoutEvaluation,
): WorkoutEvaluation[] {
  if (
    evaluations.some(
      (currentEvaluation) => currentEvaluation.id === evaluation.id,
    )
  ) {
    return evaluations;
  }

  return [evaluation, ...evaluations];
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

  const loadWorkouts = useCallback(async (successMessage?: string) => {
    try {
      const profile = await fetchFirstProfile();

      if (!profile) {
        setWorkoutsState(emptyState);
        setForm(emptyForm);
        setMessage(successMessage ?? "Create and save a Profile first.");
        setStatus("ready");
        return;
      }

      const activePlan = await fetchActiveTrainingPlanWithWorkouts(profile.id);

      if (!activePlan) {
        setWorkoutsState({
          profile,
          plan: null,
          plannedWorkouts: [],
          loggedWorkouts: [],
          workoutEvaluations: [],
        });
        setForm(emptyForm);
        setMessage(
          successMessage ??
            "Generate or select an active training plan on the Plan page before logging workouts.",
        );
        setStatus("ready");
        return;
      }

      const [loggedWorkouts, workoutEvaluations] = await Promise.all([
        fetchLoggedWorkoutsForTrainingPlan(activePlan.plan.id),
        fetchWorkoutEvaluationsForTrainingPlan(activePlan.plan.id),
      ]);
      const runWorkouts = activePlan.workouts.filter(isRunRelatedWorkout);
      const loggedWorkoutIds = buildLoggedWorkoutIdSet(loggedWorkouts);
      const firstLoggableWorkout = getFirstLoggableWorkout(
        runWorkouts,
        loggedWorkoutIds,
      );

      setWorkoutsState({
        profile,
        plan: activePlan.plan,
        plannedWorkouts: activePlan.workouts,
        loggedWorkouts,
        workoutEvaluations,
      });
      setPendingDeleteLogId(null);
      setDeletingLogId(null);
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
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadWorkouts());
  }, [loadWorkouts]);

  const runWorkouts = useMemo(
    () => workoutsState.plannedWorkouts.filter(isRunRelatedWorkout),
    [workoutsState.plannedWorkouts],
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
  const isBusy = isSaving || isDeleting;

  function handleSelectWorkout(workout: PlannedWorkout) {
    setForm({
      ...form,
      planned_workout_id: workout.id,
      workout_date: workout.workout_date,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingDeleteLogId(null);
    setStatus("saving");
    setMessage(null);

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

    let savedLoggedWorkout: LoggedWorkout;

    try {
      savedLoggedWorkout = await saveLoggedWorkout(loggedWorkoutInput);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `Could not save workout log: ${error.message}`
          : "Could not save workout log.",
      );
      return;
    }

    const plannedWorkoutId =
      savedLoggedWorkout.planned_workout_id ??
      loggedWorkoutInput.planned_workout_id;

    if (!plannedWorkoutId) {
      setWorkoutsState((currentState) => ({
        ...currentState,
        loggedWorkouts: addLoggedWorkoutIfMissing(
          currentState.loggedWorkouts,
          savedLoggedWorkout,
        ),
      }));
      setStatus("error");
      setMessage(
        "Workout log was saved, but scoring could not run because the log is not linked to a planned workout.",
      );
      return;
    }

    let linkedPlannedWorkout: PlannedWorkout;

    try {
      linkedPlannedWorkout = await fetchPlannedWorkoutById(plannedWorkoutId);
    } catch (error) {
      setWorkoutsState((currentState) => ({
        ...currentState,
        loggedWorkouts: addLoggedWorkoutIfMissing(
          currentState.loggedWorkouts,
          savedLoggedWorkout,
        ),
      }));
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `Workout log was saved, but the linked planned workout could not be loaded for scoring: ${error.message}`
          : "Workout log was saved, but the linked planned workout could not be loaded for scoring.",
      );
      return;
    }

    let savedEvaluation: WorkoutEvaluation;

    try {
      const evaluationInput = scoreWorkout(
        savedLoggedWorkout,
        linkedPlannedWorkout,
      );
      savedEvaluation = await saveWorkoutEvaluation(evaluationInput);
    } catch (error) {
      setWorkoutsState((currentState) => ({
        ...currentState,
        loggedWorkouts: addLoggedWorkoutIfMissing(
          currentState.loggedWorkouts,
          savedLoggedWorkout,
        ),
      }));
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `Workout log was saved, but the score could not be saved: ${error.message}`
          : "Workout log was saved, but the score could not be saved.",
      );
      return;
    }

    try {
      await markPlannedWorkoutCompleted(plannedWorkoutId);
      await loadWorkouts(
        "Workout logged, scored, and planned workout marked completed.",
      );
    } catch (error) {
      setWorkoutsState((currentState) => ({
        ...currentState,
        loggedWorkouts: addLoggedWorkoutIfMissing(
          currentState.loggedWorkouts,
          savedLoggedWorkout,
        ),
        workoutEvaluations: addWorkoutEvaluationIfMissing(
          currentState.workoutEvaluations,
          savedEvaluation,
        ),
      }));
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `Workout log and score were saved, but the planned workout status was not updated: ${error.message}`
          : "Workout log and score were saved, but the planned workout status was not updated.",
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

    try {
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
        "Workout log and score deleted. Planned workout reset when needed.",
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
