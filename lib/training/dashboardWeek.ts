import {
  getEffectiveGarminExportStatus,
  getLatestGarminExportByPlannedWorkoutId,
} from "../garminBridge/publishSelection.ts";
import {
  filterPlanChangingAdjustments,
  formatAffectedWorkoutLabels,
} from "./planAdjustmentDisplay.ts";
import type {
  IntervalsWorkoutSync,
  IntervalsWorkoutSyncStatus,
  LoggedWorkout,
  PlanAdjustment,
  PlannedWorkout,
  WorkoutEvaluation,
  WorkoutExport,
  WorkoutExportSyncStatus,
  WorkoutType,
} from "../../types/training.ts";

export type DashboardIntervalsStatus =
  | IntervalsWorkoutSyncStatus
  | "not_synced";

export type DashboardGarminStatus = WorkoutExportSyncStatus | "not_synced";

export type DashboardWeekWorkout = {
  workout: PlannedWorkout;
  loggedWorkout: LoggedWorkout | null;
  workoutEvaluation: WorkoutEvaluation | null;
  isRunWorkout: boolean;
  intervalsStatus: DashboardIntervalsStatus;
  garminStatus: DashboardGarminStatus;
};

export type DashboardExportHealthSummary = {
  intervals: {
    synced: number;
    needsRepublish: number;
    failed: number;
    notSynced: number;
  };
  garmin: {
    synced: number;
    stale: number;
    partial: number;
    failed: number;
    notExported: number;
  };
  attentionItems: DashboardAttentionItem[];
};

export type DashboardAttentionType =
  | "intervals"
  | "garmin"
  | "missing_score"
  | "high_risk_score"
  | "strava_webhook";

export type DashboardAttentionItem = {
  id: string;
  type: DashboardAttentionType;
  workoutDate: string;
  title: string;
  message: string;
  href: "/workouts" | "/plan" | "/settings";
  isTodayOrFuture: boolean;
};

export type DashboardPlanChangeSummary = {
  latestAdjustment: PlanAdjustment | null;
  latestAffectedWorkoutLabels: string[];
  recentPlanChangingCount: number;
};

export type DashboardWeekSummary = {
  todayDateText: string;
  todayWorkout: DashboardWeekWorkout | null;
  nextPlannedRun: PlannedWorkout | null;
  thisWeekWorkouts: DashboardWeekWorkout[];
  exportHealth: DashboardExportHealthSummary;
  planChangeSummary: DashboardPlanChangeSummary;
};

export type DashboardRunProgressSummary = {
  completedRuns: number;
  remainingPlannedRuns: number;
  totalPlannedRuns: number;
  runCompletionPercentage: number;
};

type BuildDashboardWeekSummaryInput = {
  plannedWorkouts: PlannedWorkout[];
  loggedWorkouts: LoggedWorkout[];
  workoutEvaluations: WorkoutEvaluation[];
  intervalsWorkoutSyncs: IntervalsWorkoutSync[];
  workoutExports: WorkoutExport[];
  planAdjustments: PlanAdjustment[];
  todayDateText?: string;
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

export function getLocalTodayDateText(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return now.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

export function addDaysToDateText(dateText: string, days: number): string {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export function isRunWorkoutType(workoutType: WorkoutType): boolean {
  return runWorkoutTypes.includes(workoutType);
}

export function getTodayWorkout(
  plannedWorkouts: PlannedWorkout[],
  todayDateText: string,
): PlannedWorkout | null {
  const todayWorkouts = plannedWorkouts.filter(
    (workout) => workout.workout_date === todayDateText,
  );

  return sortWorkoutsByDateAndRunPriority(todayWorkouts)[0] ?? null;
}

export function getNextPlannedRun(
  plannedWorkouts: PlannedWorkout[],
  todayDateText: string,
): PlannedWorkout | null {
  return (
    sortWorkoutsByDateAndRunPriority(plannedWorkouts).find(
      (workout) =>
        workout.status === "planned" &&
        workout.workout_date > todayDateText &&
        isRunWorkoutType(workout.workout_type),
    ) ?? null
  );
}

export function getNextSevenCalendarDaysWorkouts(
  plannedWorkouts: PlannedWorkout[],
  todayDateText: string,
): PlannedWorkout[] {
  const endDateText = addDaysToDateText(todayDateText, 6);

  return sortWorkoutsByDateAndRunPriority(
    plannedWorkouts.filter(
      (workout) =>
        workout.workout_date >= todayDateText &&
        workout.workout_date <= endDateText,
    ),
  );
}

export function buildDashboardWeekSummary({
  plannedWorkouts,
  loggedWorkouts,
  workoutEvaluations,
  intervalsWorkoutSyncs,
  workoutExports,
  planAdjustments,
  todayDateText = getLocalTodayDateText(),
}: BuildDashboardWeekSummaryInput): DashboardWeekSummary {
  const plannedWorkoutById = buildPlannedWorkoutById(plannedWorkouts);
  const loggedWorkoutByPlannedWorkoutId =
    buildLoggedWorkoutByPlannedWorkoutId(loggedWorkouts);
  const evaluationByLoggedWorkoutId =
    buildEvaluationByLoggedWorkoutId(workoutEvaluations);
  const intervalsSyncByPlannedWorkoutId =
    buildIntervalsWorkoutSyncByPlannedWorkoutId(intervalsWorkoutSyncs);
  const garminExportByPlannedWorkoutId =
    getLatestGarminExportByPlannedWorkoutId(workoutExports);

  function buildWorkoutItem(workout: PlannedWorkout): DashboardWeekWorkout {
    const loggedWorkout = loggedWorkoutByPlannedWorkoutId.get(workout.id) ?? null;
    const workoutEvaluation = loggedWorkout
      ? evaluationByLoggedWorkoutId.get(loggedWorkout.id) ?? null
      : null;
    const intervalsSync = intervalsSyncByPlannedWorkoutId.get(workout.id) ?? null;
    const garminExport = garminExportByPlannedWorkoutId.get(workout.id) ?? null;

    return {
      workout,
      loggedWorkout,
      workoutEvaluation,
      isRunWorkout: isRunWorkoutType(workout.workout_type),
      intervalsStatus: getIntervalsDashboardStatus(intervalsSync),
      garminStatus: getEffectiveGarminExportStatus(garminExport),
    };
  }

  const todayPlannedWorkout = getTodayWorkout(plannedWorkouts, todayDateText);
  const thisWeekWorkouts = getNextSevenCalendarDaysWorkouts(
    plannedWorkouts,
    todayDateText,
  ).map(buildWorkoutItem);

  return {
    todayDateText,
    todayWorkout: todayPlannedWorkout ? buildWorkoutItem(todayPlannedWorkout) : null,
    nextPlannedRun: getNextPlannedRun(plannedWorkouts, todayDateText),
    thisWeekWorkouts,
    exportHealth: buildExportHealthSummary({
      plannedWorkouts,
      loggedWorkouts,
      workoutEvaluations,
      intervalsSyncByPlannedWorkoutId,
      garminExportByPlannedWorkoutId,
      evaluationByLoggedWorkoutId,
      plannedWorkoutById,
      todayDateText,
    }),
    planChangeSummary: buildPlanChangeSummary({
      planAdjustments,
      plannedWorkoutById,
    }),
  };
}

export function buildRunProgressSummary(
  plannedWorkouts: PlannedWorkout[],
  loggedWorkouts: LoggedWorkout[],
): DashboardRunProgressSummary {
  const plannedRunWorkouts = plannedWorkouts.filter((workout) =>
    isRunWorkoutType(workout.workout_type),
  );
  const plannedRunWorkoutIds = new Set(
    plannedRunWorkouts.map((workout) => workout.id),
  );
  const loggedRunWorkoutIds = new Set(
    loggedWorkouts
      .map((loggedWorkout) => loggedWorkout.planned_workout_id)
      .filter((plannedWorkoutId): plannedWorkoutId is string =>
        Boolean(plannedWorkoutId && plannedRunWorkoutIds.has(plannedWorkoutId)),
      ),
  );
  const completedRuns = plannedRunWorkouts.filter(
    (workout) =>
      workout.status === "completed" || loggedRunWorkoutIds.has(workout.id),
  ).length;
  const remainingPlannedRuns = plannedRunWorkouts.filter(
    (workout) =>
      workout.status === "planned" && !loggedRunWorkoutIds.has(workout.id),
  ).length;

  return {
    completedRuns,
    remainingPlannedRuns,
    totalPlannedRuns: plannedRunWorkouts.length,
    runCompletionPercentage: plannedRunWorkouts.length
      ? clampPercentage((completedRuns / plannedRunWorkouts.length) * 100)
      : 0,
  };
}

export function mergeDashboardAttentionItems(input: {
  baseItems: DashboardAttentionItem[];
  additionalItems: DashboardAttentionItem[];
}): DashboardAttentionItem[] {
  return [...input.additionalItems, ...input.baseItems];
}

function buildExportHealthSummary({
  plannedWorkouts,
  loggedWorkouts,
  workoutEvaluations,
  intervalsSyncByPlannedWorkoutId,
  garminExportByPlannedWorkoutId,
  evaluationByLoggedWorkoutId,
  plannedWorkoutById,
  todayDateText,
}: {
  plannedWorkouts: PlannedWorkout[];
  loggedWorkouts: LoggedWorkout[];
  workoutEvaluations: WorkoutEvaluation[];
  intervalsSyncByPlannedWorkoutId: Map<string, IntervalsWorkoutSync>;
  garminExportByPlannedWorkoutId: Map<string, WorkoutExport>;
  evaluationByLoggedWorkoutId: Map<string, WorkoutEvaluation>;
  plannedWorkoutById: Map<string, PlannedWorkout>;
  todayDateText: string;
}): DashboardExportHealthSummary {
  const summary: DashboardExportHealthSummary = {
    intervals: {
      synced: 0,
      needsRepublish: 0,
      failed: 0,
      notSynced: 0,
    },
    garmin: {
      synced: 0,
      stale: 0,
      partial: 0,
      failed: 0,
      notExported: 0,
    },
    attentionItems: [],
  };

  for (const workout of plannedWorkouts) {
    if (!isRunWorkoutType(workout.workout_type)) {
      continue;
    }

    const intervalsSync = intervalsSyncByPlannedWorkoutId.get(workout.id) ?? null;
    const intervalsStatus = getIntervalsDashboardStatus(intervalsSync);
    const garminExport = garminExportByPlannedWorkoutId.get(workout.id) ?? null;
    const garminStatus = getEffectiveGarminExportStatus(garminExport);

    countIntervalsStatus(summary, intervalsStatus);
    countGarminStatus(summary, garminStatus);

    if (intervalsStatus === "needs_resync" || intervalsStatus === "failed") {
      summary.attentionItems.push({
        id: `intervals-${workout.id}`,
        type: "intervals",
        workoutDate: workout.workout_date,
        title: workout.title,
        message:
          intervalsStatus === "needs_resync"
            ? "Intervals.icu needs republish."
            : "Intervals.icu export failed.",
        href: "/workouts",
        isTodayOrFuture: workout.workout_date >= todayDateText,
      });
    }

    if (
      garminStatus === "stale" ||
      garminStatus === "partial" ||
      garminStatus === "failed"
    ) {
      summary.attentionItems.push({
        id: `garmin-${workout.id}`,
        type: "garmin",
        workoutDate: workout.workout_date,
        title: workout.title,
        message: getGarminAttentionMessage(garminStatus),
        href: "/workouts",
        isTodayOrFuture: workout.workout_date >= todayDateText,
      });
    }
  }

  for (const loggedWorkout of loggedWorkouts) {
    const workoutEvaluation =
      evaluationByLoggedWorkoutId.get(loggedWorkout.id) ?? null;

    if (!workoutEvaluation) {
      const plannedWorkout = loggedWorkout.planned_workout_id
        ? plannedWorkoutById.get(loggedWorkout.planned_workout_id) ?? null
        : null;

      summary.attentionItems.push({
        id: `missing-score-${loggedWorkout.id}`,
        type: "missing_score",
        workoutDate: loggedWorkout.workout_date,
        title: plannedWorkout?.title ?? "Logged workout",
        message: "Logged workout is missing a workout score.",
        href: "/workouts",
        isTodayOrFuture: loggedWorkout.workout_date >= todayDateText,
      });
    }
  }

  const highRiskEvaluations = [...workoutEvaluations]
    .filter((evaluation) => evaluation.risk_level === "high")
    .sort((firstEvaluation, secondEvaluation) =>
      secondEvaluation.created_at.localeCompare(firstEvaluation.created_at),
    )
    .slice(0, 5);

  for (const evaluation of highRiskEvaluations) {
    const plannedWorkout = evaluation.planned_workout_id
      ? plannedWorkoutById.get(evaluation.planned_workout_id) ?? null
      : null;

    summary.attentionItems.push({
      id: `high-risk-${evaluation.id}`,
      type: "high_risk_score",
      workoutDate: plannedWorkout?.workout_date ?? evaluation.created_at.slice(0, 10),
      title: plannedWorkout?.title ?? "Workout score",
      message: "Recent workout score has high-risk fatigue signals.",
      href: "/workouts",
      isTodayOrFuture:
        (plannedWorkout?.workout_date ?? evaluation.created_at.slice(0, 10)) >=
        todayDateText,
    });
  }

  summary.attentionItems.sort(sortAttentionItems);

  return summary;
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildPlanChangeSummary({
  planAdjustments,
  plannedWorkoutById,
}: {
  planAdjustments: PlanAdjustment[];
  plannedWorkoutById: Map<string, PlannedWorkout>;
}): DashboardPlanChangeSummary {
  const planChangingAdjustments = filterPlanChangingAdjustments(planAdjustments)
    .sort((firstAdjustment, secondAdjustment) =>
      secondAdjustment.created_at.localeCompare(firstAdjustment.created_at),
    );
  const latestAdjustment = planChangingAdjustments[0] ?? null;

  return {
    latestAdjustment,
    latestAffectedWorkoutLabels: latestAdjustment
      ? formatAffectedWorkoutLabels(latestAdjustment, plannedWorkoutById)
      : [],
    recentPlanChangingCount: planChangingAdjustments.length,
  };
}

function getIntervalsDashboardStatus(
  sync: IntervalsWorkoutSync | null,
): DashboardIntervalsStatus {
  return sync?.sync_status ?? "not_synced";
}

function countIntervalsStatus(
  summary: DashboardExportHealthSummary,
  intervalsStatus: DashboardIntervalsStatus,
): void {
  if (intervalsStatus === "synced") {
    summary.intervals.synced += 1;
    return;
  }

  if (intervalsStatus === "needs_resync") {
    summary.intervals.needsRepublish += 1;
    return;
  }

  if (intervalsStatus === "failed") {
    summary.intervals.failed += 1;
    return;
  }

  summary.intervals.notSynced += 1;
}

function countGarminStatus(
  summary: DashboardExportHealthSummary,
  garminStatus: DashboardGarminStatus,
): void {
  if (garminStatus === "synced") {
    summary.garmin.synced += 1;
    return;
  }

  if (garminStatus === "stale") {
    summary.garmin.stale += 1;
    return;
  }

  if (garminStatus === "partial") {
    summary.garmin.partial += 1;
    return;
  }

  if (garminStatus === "failed") {
    summary.garmin.failed += 1;
    return;
  }

  summary.garmin.notExported += 1;
}

function getGarminAttentionMessage(
  garminStatus: DashboardGarminStatus,
): string {
  if (garminStatus === "stale") {
    return "Direct Garmin export is stale.";
  }

  if (garminStatus === "partial") {
    return "Direct Garmin export is partial and needs review.";
  }

  if (garminStatus === "failed") {
    return "Direct Garmin export failed.";
  }

  return "Direct Garmin export needs review.";
}

function buildPlannedWorkoutById(
  plannedWorkouts: PlannedWorkout[],
): Map<string, PlannedWorkout> {
  return new Map(plannedWorkouts.map((workout) => [workout.id, workout]));
}

function buildLoggedWorkoutByPlannedWorkoutId(
  loggedWorkouts: LoggedWorkout[],
): Map<string, LoggedWorkout> {
  const loggedWorkoutByPlannedWorkoutId = new Map<string, LoggedWorkout>();

  for (const loggedWorkout of loggedWorkouts) {
    if (!loggedWorkout.planned_workout_id) {
      continue;
    }

    const currentWorkout = loggedWorkoutByPlannedWorkoutId.get(
      loggedWorkout.planned_workout_id,
    );

    if (
      !currentWorkout ||
      loggedWorkout.created_at.localeCompare(currentWorkout.created_at) > 0
    ) {
      loggedWorkoutByPlannedWorkoutId.set(
        loggedWorkout.planned_workout_id,
        loggedWorkout,
      );
    }
  }

  return loggedWorkoutByPlannedWorkoutId;
}

function buildEvaluationByLoggedWorkoutId(
  evaluations: WorkoutEvaluation[],
): Map<string, WorkoutEvaluation> {
  const evaluationByLoggedWorkoutId = new Map<string, WorkoutEvaluation>();

  for (const evaluation of evaluations) {
    const currentEvaluation = evaluationByLoggedWorkoutId.get(
      evaluation.logged_workout_id,
    );

    if (
      !currentEvaluation ||
      evaluation.created_at.localeCompare(currentEvaluation.created_at) > 0
    ) {
      evaluationByLoggedWorkoutId.set(evaluation.logged_workout_id, evaluation);
    }
  }

  return evaluationByLoggedWorkoutId;
}

function buildIntervalsWorkoutSyncByPlannedWorkoutId(
  syncs: IntervalsWorkoutSync[],
): Map<string, IntervalsWorkoutSync> {
  const syncByPlannedWorkoutId = new Map<string, IntervalsWorkoutSync>();

  for (const sync of syncs) {
    const currentSync = syncByPlannedWorkoutId.get(sync.planned_workout_id);

    if (!currentSync || sync.updated_at.localeCompare(currentSync.updated_at) > 0) {
      syncByPlannedWorkoutId.set(sync.planned_workout_id, sync);
    }
  }

  return syncByPlannedWorkoutId;
}

function sortWorkoutsByDateAndRunPriority(
  plannedWorkouts: PlannedWorkout[],
): PlannedWorkout[] {
  return [...plannedWorkouts].sort((firstWorkout, secondWorkout) => {
    const dateComparison = firstWorkout.workout_date.localeCompare(
      secondWorkout.workout_date,
    );

    if (dateComparison !== 0) {
      return dateComparison;
    }

    const priorityComparison =
      getWorkoutPriority(firstWorkout) - getWorkoutPriority(secondWorkout);

    if (priorityComparison !== 0) {
      return priorityComparison;
    }

    return firstWorkout.title.localeCompare(secondWorkout.title);
  });
}

function getWorkoutPriority(workout: PlannedWorkout): number {
  if (isRunWorkoutType(workout.workout_type)) {
    return 0;
  }

  if (workout.workout_type === "rest") {
    return 2;
  }

  return 1;
}

function sortAttentionItems(
  firstItem: DashboardAttentionItem,
  secondItem: DashboardAttentionItem,
): number {
  if (firstItem.isTodayOrFuture !== secondItem.isTodayOrFuture) {
    return firstItem.isTodayOrFuture ? -1 : 1;
  }

  const dateComparison = firstItem.workoutDate.localeCompare(
    secondItem.workoutDate,
  );

  if (dateComparison !== 0) {
    return firstItem.isTodayOrFuture ? dateComparison : -dateComparison;
  }

  return firstItem.title.localeCompare(secondItem.title);
}
