import type {
  PlannedWorkout,
  StructuredWorkout,
  WorkoutExport,
  WorkoutExportSyncStatus,
  WorkoutStep,
  WorkoutType,
} from "../../types/training.ts";

export type GarminBulkPublishWindowDays = 7 | 14;

export type GarminBulkExportStatus =
  | WorkoutExportSyncStatus
  | "not_synced";

export type GarminBulkWorkoutAction =
  | "publish"
  | "skip_synced"
  | "needs_confirmation"
  | "invalid";

export type GarminBulkWorkoutCandidate = {
  workout: PlannedWorkout;
  exportRecord: WorkoutExport | null;
  exportStatus: GarminBulkExportStatus;
  action: GarminBulkWorkoutAction;
  paceTargetCount: number;
  warnings: string[];
};

const garminRunWorkoutTypes: WorkoutType[] = [
  "easy",
  "long_run",
  "tempo",
  "interval",
  "marathon_pace",
  "recovery",
  "calibration",
];

export function getTodayDateText(): string {
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

export function addDaysToDateText(dateText: string, days: number): string {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export function isGarminRunWorkoutType(workoutType: WorkoutType): boolean {
  return garminRunWorkoutTypes.includes(workoutType);
}

export function isWorkoutInGarminBulkPublishWindow(
  workout: PlannedWorkout,
  todayDateText: string,
  windowDays: GarminBulkPublishWindowDays,
): boolean {
  const endDateText = addDaysToDateText(todayDateText, windowDays - 1);

  return (
    workout.workout_date >= todayDateText && workout.workout_date <= endDateText
  );
}

export function isGarminBulkPublishEligible(
  workout: PlannedWorkout,
  todayDateText: string,
): boolean {
  return Boolean(
    workout.status === "planned" &&
      workout.workout_date >= todayDateText &&
      isGarminRunWorkoutType(workout.workout_type) &&
      workout.structured_workout,
  );
}

export function getEffectiveGarminExportStatus(
  exportRecord: WorkoutExport | null,
): GarminBulkExportStatus {
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

export function getLatestGarminExportByPlannedWorkoutId(
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

export function countPaceTargetSteps(
  structuredWorkout: StructuredWorkout | null,
): number {
  if (!structuredWorkout) {
    return 0;
  }

  return countPaceTargetsInSteps(structuredWorkout.steps);
}

function countPaceTargetsInSteps(steps: WorkoutStep[]): number {
  return steps.reduce((count, step) => {
    const stepCount = step.targetType === "pace" ? 1 : 0;
    const repeatCount = step.repeat ? countPaceTargetsInSteps(step.repeat.steps) : 0;

    return count + stepCount + repeatCount;
  }, 0);
}

function buildExportWarnings(
  exportStatus: GarminBulkExportStatus,
): string[] {
  if (exportStatus === "synced") {
    return ["Already published to Garmin."];
  }

  if (exportStatus === "failed") {
    return ["Previous Garmin publish failed. Confirm before retrying."];
  }

  if (exportStatus === "stale") {
    return ["Changed after Garmin export — use bulk maintenance to update it."];
  }

  if (exportStatus === "partial") {
    return [
      "Workout may already exist in Garmin. Delete or update it instead of publishing a duplicate.",
    ];
  }

  return [];
}

function getCandidateAction(
  exportStatus: GarminBulkExportStatus,
  includeRetryStatuses: boolean,
  exportRecord: WorkoutExport | null,
): GarminBulkWorkoutAction {
  if (exportStatus === "synced") {
    return "skip_synced";
  }

  if (exportStatus === "stale" || exportStatus === "partial") {
    return "invalid";
  }

  if (exportStatus === "failed" && exportRecord?.provider_workout_id) {
    return "invalid";
  }

  if (!includeRetryStatuses && exportStatus === "failed") {
    return "needs_confirmation";
  }

  return "publish";
}

export function buildGarminBulkPublishCandidates(input: {
  workouts: PlannedWorkout[];
  workoutExports: WorkoutExport[];
  todayDateText: string;
  windowDays: GarminBulkPublishWindowDays;
  includeRetryStatuses?: boolean;
}): GarminBulkWorkoutCandidate[] {
  const exportByPlannedWorkoutId = getLatestGarminExportByPlannedWorkoutId(
    input.workoutExports,
  );
  const includeRetryStatuses = input.includeRetryStatuses === true;

  return input.workouts
    .filter((workout) =>
      isWorkoutInGarminBulkPublishWindow(
        workout,
        input.todayDateText,
        input.windowDays,
      ),
    )
    .filter((workout) =>
      isGarminBulkPublishEligible(workout, input.todayDateText),
    )
    .sort((firstWorkout, secondWorkout) => {
      const dateOrder = firstWorkout.workout_date.localeCompare(
        secondWorkout.workout_date,
      );

      if (dateOrder !== 0) {
        return dateOrder;
      }

      return firstWorkout.title.localeCompare(secondWorkout.title);
    })
    .map((workout) => {
      const exportRecord = exportByPlannedWorkoutId.get(workout.id) ?? null;
      const exportStatus = getEffectiveGarminExportStatus(exportRecord);

      return {
        workout,
        exportRecord,
        exportStatus,
        action: getCandidateAction(
          exportStatus,
          includeRetryStatuses,
          exportRecord,
        ),
        paceTargetCount: countPaceTargetSteps(workout.structured_workout),
        warnings: buildExportWarnings(exportStatus),
      };
    });
}
