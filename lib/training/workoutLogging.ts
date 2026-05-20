import {
  buildSavePlanAdjustmentInput,
  fetchFuturePlannedWorkouts,
  savePlanAdjustment,
  updateFuturePlannedWorkoutsForAdjustment,
} from "../db/planAdjustments.ts";
import { markSyncedIntervalsWorkoutSyncsNeedsResync } from "../db/intervalsWorkoutSyncs.ts";
import {
  type SaveLoggedWorkoutInput,
  markPlannedWorkoutCompleted,
  saveLoggedWorkout,
  saveWorkoutEvaluation,
} from "../db/workouts.ts";
import { markSyncedGarminWorkoutExportsStale } from "../db/workoutExports.ts";
import { suggestPlanAdjustment } from "./planAdjustment.ts";
import { scoreWorkout } from "./workoutScoring.ts";
import type {
  LoggedWorkout,
  PlanAdjustmentDecision,
  PlannedWorkout,
  Profile,
  RaceGoal,
  TrainingPlan,
  WorkoutEvaluation,
} from "../../types/index.ts";

export type LoggedWorkoutCompletionResult = {
  ok: boolean;
  loggedWorkout: LoggedWorkout;
  workoutEvaluation: WorkoutEvaluation | null;
  scored: boolean;
  adjusted: boolean;
  message: string;
  followupError: string | null;
};

type PlanAdjustmentResult = {
  adjusted: boolean;
  message: string;
  followupError: string | null;
};

export type WorkoutLoggingDependencies = {
  saveLoggedWorkout: typeof saveLoggedWorkout;
  saveWorkoutEvaluation: typeof saveWorkoutEvaluation;
  markPlannedWorkoutCompleted: typeof markPlannedWorkoutCompleted;
  fetchFuturePlannedWorkouts: typeof fetchFuturePlannedWorkouts;
  updateFuturePlannedWorkoutsForAdjustment:
    typeof updateFuturePlannedWorkoutsForAdjustment;
  savePlanAdjustment: typeof savePlanAdjustment;
  markSyncedIntervalsWorkoutSyncsNeedsResync:
    typeof markSyncedIntervalsWorkoutSyncsNeedsResync;
  markSyncedGarminWorkoutExportsStale:
    typeof markSyncedGarminWorkoutExportsStale;
  scoreWorkout: typeof scoreWorkout;
  suggestPlanAdjustment: typeof suggestPlanAdjustment;
};

export type SaveLoggedWorkoutWithCompletionInput = {
  profile: Profile;
  raceGoal: RaceGoal;
  plan: TrainingPlan;
  loggedWorkoutInput: SaveLoggedWorkoutInput;
  plannedWorkout: PlannedWorkout | null;
  recentLoggedWorkouts: LoggedWorkout[];
  recentWorkoutEvaluations: WorkoutEvaluation[];
  dependencies?: Partial<WorkoutLoggingDependencies>;
};

const defaultWorkoutLoggingDependencies: WorkoutLoggingDependencies = {
  saveLoggedWorkout,
  saveWorkoutEvaluation,
  markPlannedWorkoutCompleted,
  fetchFuturePlannedWorkouts,
  updateFuturePlannedWorkoutsForAdjustment,
  savePlanAdjustment,
  markSyncedIntervalsWorkoutSyncsNeedsResync,
  markSyncedGarminWorkoutExportsStale,
  scoreWorkout,
  suggestPlanAdjustment,
};

function getWorkoutLoggingDependencies(
  overrides: Partial<WorkoutLoggingDependencies> | undefined,
): WorkoutLoggingDependencies {
  return {
    ...defaultWorkoutLoggingDependencies,
    ...overrides,
  };
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

function getRecentLoggedWorkouts(
  loggedWorkouts: LoggedWorkout[],
  savedLoggedWorkout: LoggedWorkout,
): LoggedWorkout[] {
  return addLoggedWorkoutIfMissing(loggedWorkouts, savedLoggedWorkout)
    .sort((firstWorkout, secondWorkout) =>
      secondWorkout.workout_date.localeCompare(firstWorkout.workout_date),
    )
    .slice(0, 5);
}

function getRecentWorkoutEvaluations(
  evaluations: WorkoutEvaluation[],
  savedEvaluation: WorkoutEvaluation,
): WorkoutEvaluation[] {
  return addWorkoutEvaluationIfMissing(evaluations, savedEvaluation)
    .sort((firstEvaluation, secondEvaluation) =>
      secondEvaluation.created_at.localeCompare(firstEvaluation.created_at),
    )
    .slice(0, 5);
}

function buildFallbackNoneDecision(
  error: unknown,
  failedDecision: PlanAdjustmentDecision | null,
): PlanAdjustmentDecision {
  const errorMessage =
    error instanceof Error ? error.message : "Unknown adjustment error.";

  return {
    adjustment_type: "none",
    reason: "Plan adjustment failed after workout logging.",
    explanation: `The workout and score were saved, but the planned workout updates or adjustment record failed: ${errorMessage}. The plan was left unchanged.`,
    affected_workout_ids: [],
    before_snapshot: failedDecision?.before_snapshot ?? null,
    after_snapshot: null,
    updatedFuturePlannedWorkouts:
      failedDecision?.updatedFuturePlannedWorkouts ?? [],
  };
}

async function markUpdatedIntervalsSyncsNeedsResync(
  updatedWorkouts: PlannedWorkout[],
  dependencies: WorkoutLoggingDependencies,
): Promise<string | null> {
  if (updatedWorkouts.length === 0) {
    return null;
  }

  try {
    await dependencies.markSyncedIntervalsWorkoutSyncsNeedsResync(
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
  dependencies: WorkoutLoggingDependencies,
): Promise<string | null> {
  if (updatedWorkouts.length === 0) {
    return null;
  }

  try {
    await dependencies.markSyncedGarminWorkoutExportsStale(
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

async function applyPlanAdjustmentAfterLogging(input: {
  profile: Profile;
  raceGoal: RaceGoal;
  plan: TrainingPlan;
  loggedWorkout: LoggedWorkout;
  plannedWorkout: PlannedWorkout;
  workoutEvaluation: WorkoutEvaluation;
  recentLoggedWorkouts: LoggedWorkout[];
  recentWorkoutEvaluations: WorkoutEvaluation[];
  dependencies: WorkoutLoggingDependencies;
}): Promise<PlanAdjustmentResult> {
  let decision: PlanAdjustmentDecision | null = null;
  let intervalsSyncWarning: string | null = null;
  let garminExportWarning: string | null = null;

  try {
    const futurePlannedWorkouts = await input.dependencies.fetchFuturePlannedWorkouts(
      input.plan.id,
      input.loggedWorkout.workout_date,
    );
    decision = input.dependencies.suggestPlanAdjustment({
      profile: input.profile,
      raceGoal: input.raceGoal,
      trainingPlan: input.plan,
      loggedWorkout: input.loggedWorkout,
      workoutEvaluation: input.workoutEvaluation,
      plannedWorkout: input.plannedWorkout,
      futurePlannedWorkouts,
      recentLoggedWorkouts: input.recentLoggedWorkouts,
      recentWorkoutEvaluations: input.recentWorkoutEvaluations,
    });

    if (decision.adjustment_type !== "none") {
      const updatedWorkouts =
        await input.dependencies.updateFuturePlannedWorkoutsForAdjustment({
          updatedFuturePlannedWorkouts: decision.updatedFuturePlannedWorkouts,
          affectedWorkoutIds: decision.affected_workout_ids,
          loggedWorkoutDate: input.loggedWorkout.workout_date,
        });
      intervalsSyncWarning =
        await markUpdatedIntervalsSyncsNeedsResync(
          updatedWorkouts,
          input.dependencies,
        );
      garminExportWarning = await markUpdatedGarminExportsStale(
        updatedWorkouts,
        input.dependencies,
      );
    }

    await input.dependencies.savePlanAdjustment(
      buildSavePlanAdjustmentInput({
        profileId: input.profile.id,
        raceGoalId: input.raceGoal.id,
        trainingPlanId: input.plan.id,
        loggedWorkoutId: input.loggedWorkout.id,
        workoutEvaluationId: input.workoutEvaluation.id,
        decision,
      }),
    );
  } catch (error) {
    const fallbackDecision = buildFallbackNoneDecision(error, decision);

    try {
      await input.dependencies.savePlanAdjustment(
        buildSavePlanAdjustmentInput({
          profileId: input.profile.id,
          raceGoalId: input.raceGoal.id,
          trainingPlanId: input.plan.id,
          loggedWorkoutId: input.loggedWorkout.id,
          workoutEvaluationId: input.workoutEvaluation.id,
          decision: fallbackDecision,
        }),
      );
    } catch {
      // The workout and score are already saved. If the audit row also fails,
      // leave the plan adjustment untouched and report partial success.
    }

    return {
      adjusted: false,
      message:
        "Workout saved and score generated, but plan adjustment failed. The plan was left unchanged.",
      followupError: fallbackDecision.explanation,
    };
  }

  if (decision.adjustment_type === "none") {
    return {
      adjusted: false,
      message: "Workout saved, score generated, and plan unchanged.",
      followupError: null,
    };
  }

  return {
    adjusted: true,
    message: `Workout saved, score generated, and plan adjusted.${combineSyncWarnings(
      intervalsSyncWarning,
      garminExportWarning,
    )}`,
    followupError: combineSyncWarnings(intervalsSyncWarning, garminExportWarning) || null,
  };
}

export async function saveLoggedWorkoutWithCompletion(
  input: SaveLoggedWorkoutWithCompletionInput,
): Promise<LoggedWorkoutCompletionResult> {
  const dependencies = getWorkoutLoggingDependencies(input.dependencies);
  const savedLoggedWorkout = await dependencies.saveLoggedWorkout(
    input.loggedWorkoutInput,
  );

  if (!input.plannedWorkout) {
    return {
      ok: true,
      loggedWorkout: savedLoggedWorkout,
      workoutEvaluation: null,
      scored: false,
      adjusted: false,
      message: "Workout saved without scoring because it is not linked to a planned workout.",
      followupError: null,
    };
  }

  let savedEvaluation: WorkoutEvaluation;

  try {
    const evaluationInput = dependencies.scoreWorkout(
      savedLoggedWorkout,
      input.plannedWorkout,
    );
    savedEvaluation = await dependencies.saveWorkoutEvaluation(evaluationInput);
  } catch (error) {
    const message =
      error instanceof Error
        ? `Workout log was saved, but the score could not be saved: ${error.message}`
        : "Workout log was saved, but the score could not be saved.";

    return {
      ok: false,
      loggedWorkout: savedLoggedWorkout,
      workoutEvaluation: null,
      scored: false,
      adjusted: false,
      message,
      followupError: message,
    };
  }

  try {
    await dependencies.markPlannedWorkoutCompleted(input.plannedWorkout.id);
  } catch (error) {
    const message =
      error instanceof Error
        ? `Workout log and score were saved, but the planned workout status was not updated: ${error.message}`
        : "Workout log and score were saved, but the planned workout status was not updated.";

    return {
      ok: false,
      loggedWorkout: savedLoggedWorkout,
      workoutEvaluation: savedEvaluation,
      scored: true,
      adjusted: false,
      message,
      followupError: message,
    };
  }

  const planAdjustmentResult = await applyPlanAdjustmentAfterLogging({
    profile: input.profile,
    raceGoal: input.raceGoal,
    plan: input.plan,
    loggedWorkout: savedLoggedWorkout,
    plannedWorkout: input.plannedWorkout,
    workoutEvaluation: savedEvaluation,
    recentLoggedWorkouts: getRecentLoggedWorkouts(
      input.recentLoggedWorkouts,
      savedLoggedWorkout,
    ),
    recentWorkoutEvaluations: getRecentWorkoutEvaluations(
      input.recentWorkoutEvaluations,
      savedEvaluation,
    ),
    dependencies,
  });

  return {
    ok: true,
    loggedWorkout: savedLoggedWorkout,
    workoutEvaluation: savedEvaluation,
    scored: true,
    adjusted: planAdjustmentResult.adjusted,
    message: planAdjustmentResult.message,
    followupError: planAdjustmentResult.followupError,
  };
}
