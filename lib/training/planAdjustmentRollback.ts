import type { PlanAdjustment, PlannedWorkout, WorkoutType } from "@/types/training";

export type PlannedWorkoutRollbackUpdate = Pick<PlannedWorkout, "id"> &
  Partial<
    Pick<
      PlannedWorkout,
      | "workout_type"
      | "title"
      | "description"
      | "distance_km"
      | "duration_min"
      | "target_pace_min_sec_per_km"
      | "target_pace_max_sec_per_km"
      | "target_hr_zone"
      | "purpose"
      | "instructions"
    >
  > & {
    source_adjustment_id: string;
    source_adjustment_created_at: string;
  };

export type PlanAdjustmentRollbackBuildResult = {
  rollbackUpdates: PlannedWorkoutRollbackUpdate[];
  needsRegenerationWarning: boolean;
};

export type PlanAdjustmentRollbackFilterResult = {
  rollbackUpdates: PlannedWorkoutRollbackUpdate[];
  skippedWorkoutIds: string[];
};

const validWorkoutTypes: WorkoutType[] = [
  "easy",
  "long_run",
  "tempo",
  "interval",
  "marathon_pace",
  "recovery",
  "rest",
  "strength_optional",
  "calibration",
  "cross_training",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isNumberOrNull(value: unknown): value is number | null {
  return typeof value === "number" || value === null;
}

function isWorkoutType(value: unknown): value is WorkoutType {
  return (
    typeof value === "string" &&
    validWorkoutTypes.includes(value as WorkoutType)
  );
}

function hasRestorableField(update: PlannedWorkoutRollbackUpdate): boolean {
  return (
    update.workout_type !== undefined ||
    update.title !== undefined ||
    update.description !== undefined ||
    update.distance_km !== undefined ||
    update.duration_min !== undefined ||
    update.target_pace_min_sec_per_km !== undefined ||
    update.target_pace_max_sec_per_km !== undefined ||
    update.target_hr_zone !== undefined ||
    update.purpose !== undefined ||
    update.instructions !== undefined
  );
}

export function extractRollbackUpdatesFromAdjustment(
  adjustment: PlanAdjustment,
): PlanAdjustmentRollbackBuildResult {
  if (adjustment.adjustment_type === "none") {
    return {
      rollbackUpdates: [],
      needsRegenerationWarning: false,
    };
  }

  if (adjustment.affected_workout_ids.length === 0) {
    return {
      rollbackUpdates: [],
      needsRegenerationWarning: false,
    };
  }

  if (!isObject(adjustment.before_snapshot)) {
    return {
      rollbackUpdates: [],
      needsRegenerationWarning: true,
    };
  }

  const snapshotWorkouts = adjustment.before_snapshot.workouts;

  if (!Array.isArray(snapshotWorkouts)) {
    return {
      rollbackUpdates: [],
      needsRegenerationWarning: true,
    };
  }

  const affectedWorkoutIds = new Set(adjustment.affected_workout_ids);
  const rollbackUpdates: PlannedWorkoutRollbackUpdate[] = [];

  for (const snapshotWorkout of snapshotWorkouts) {
    if (!isObject(snapshotWorkout) || typeof snapshotWorkout.id !== "string") {
      continue;
    }

    if (!affectedWorkoutIds.has(snapshotWorkout.id)) {
      continue;
    }

    const update: PlannedWorkoutRollbackUpdate = {
      id: snapshotWorkout.id,
      source_adjustment_id: adjustment.id,
      source_adjustment_created_at: adjustment.created_at,
    };

    if (isWorkoutType(snapshotWorkout.workout_type)) {
      update.workout_type = snapshotWorkout.workout_type;
    }

    if (typeof snapshotWorkout.title === "string") {
      update.title = snapshotWorkout.title;
    }

    if (
      "description" in snapshotWorkout &&
      isStringOrNull(snapshotWorkout.description)
    ) {
      update.description = snapshotWorkout.description;
    }

    if (isNumberOrNull(snapshotWorkout.distance_km)) {
      update.distance_km = snapshotWorkout.distance_km;
    }

    if (isNumberOrNull(snapshotWorkout.duration_min)) {
      update.duration_min = snapshotWorkout.duration_min;
    }

    if (isNumberOrNull(snapshotWorkout.target_pace_min_sec_per_km)) {
      update.target_pace_min_sec_per_km =
        snapshotWorkout.target_pace_min_sec_per_km;
    }

    if (isNumberOrNull(snapshotWorkout.target_pace_max_sec_per_km)) {
      update.target_pace_max_sec_per_km =
        snapshotWorkout.target_pace_max_sec_per_km;
    }

    if (isStringOrNull(snapshotWorkout.target_hr_zone)) {
      update.target_hr_zone = snapshotWorkout.target_hr_zone;
    }

    if (isStringOrNull(snapshotWorkout.purpose)) {
      update.purpose = snapshotWorkout.purpose;
    }

    if (isStringOrNull(snapshotWorkout.instructions)) {
      update.instructions = snapshotWorkout.instructions;
    }

    if (hasRestorableField(update)) {
      rollbackUpdates.push(update);
    }
  }

  return {
    rollbackUpdates,
    needsRegenerationWarning:
      rollbackUpdates.length < adjustment.affected_workout_ids.length,
  };
}

export function buildRollbackUpdatesFromAdjustments(
  adjustments: PlanAdjustment[],
): PlanAdjustmentRollbackBuildResult {
  const rollbackUpdateByWorkoutId = new Map<
    string,
    PlannedWorkoutRollbackUpdate
  >();
  let needsRegenerationWarning = false;

  const oldestAdjustmentsFirst = [...adjustments].sort((first, second) =>
    first.created_at.localeCompare(second.created_at),
  );

  for (const adjustment of oldestAdjustmentsFirst) {
    const result = extractRollbackUpdatesFromAdjustment(adjustment);
    needsRegenerationWarning =
      needsRegenerationWarning || result.needsRegenerationWarning;

    for (const rollbackUpdate of result.rollbackUpdates) {
      if (!rollbackUpdateByWorkoutId.has(rollbackUpdate.id)) {
        rollbackUpdateByWorkoutId.set(rollbackUpdate.id, rollbackUpdate);
      }
    }
  }

  return {
    rollbackUpdates: Array.from(rollbackUpdateByWorkoutId.values()),
    needsRegenerationWarning,
  };
}

export function filterRollbackUpdatesBlockedByNewerAdjustments(
  rollbackUpdates: PlannedWorkoutRollbackUpdate[],
  newerRemainingAdjustments: PlanAdjustment[],
): PlanAdjustmentRollbackFilterResult {
  const skippedWorkoutIds = new Set<string>();

  const safeRollbackUpdates = rollbackUpdates.filter((rollbackUpdate) => {
    const newerAdjustmentTouchesWorkout = newerRemainingAdjustments.some(
      (adjustment) =>
        adjustment.created_at > rollbackUpdate.source_adjustment_created_at &&
        adjustment.affected_workout_ids.includes(rollbackUpdate.id),
    );

    if (newerAdjustmentTouchesWorkout) {
      skippedWorkoutIds.add(rollbackUpdate.id);
      return false;
    }

    return true;
  });

  return {
    rollbackUpdates: safeRollbackUpdates,
    skippedWorkoutIds: Array.from(skippedWorkoutIds),
  };
}

export function buildPlannedWorkoutRollbackUpdate(
  rollbackUpdate: PlannedWorkoutRollbackUpdate,
): Partial<PlannedWorkout> {
  const {
    id: _id,
    source_adjustment_id: _sourceAdjustmentId,
    source_adjustment_created_at: _sourceAdjustmentCreatedAt,
    ...plannedWorkoutUpdate
  } = rollbackUpdate;

  return plannedWorkoutUpdate;
}
