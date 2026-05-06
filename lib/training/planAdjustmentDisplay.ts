import type {
  AdjustmentType,
  PlanAdjustment,
  PlannedWorkout,
} from "@/types/training";

const adjustmentTypeLabels: Record<AdjustmentType, string> = {
  none: "No adjustment",
  reduce_next_intensity: "Reduce next intensity",
  add_recovery: "Add recovery",
  shift_workout: "Shift workout",
  update_training_paces: "Update training paces",
  reduce_weekly_volume: "Reduce weekly volume",
  protect_long_run_progression: "Protect long run progression",
};

export function formatAdjustmentTypeLabel(
  adjustmentType: AdjustmentType,
): string {
  return adjustmentTypeLabels[adjustmentType];
}

export function formatValueLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function filterPlanChangingAdjustments(
  adjustments: PlanAdjustment[],
): PlanAdjustment[] {
  return adjustments.filter(
    (adjustment) => adjustment.adjustment_type !== "none",
  );
}

export function buildPlanAdjustmentByLoggedWorkoutId(
  adjustments: PlanAdjustment[],
): Map<string, PlanAdjustment> {
  const adjustmentByLoggedWorkoutId = new Map<string, PlanAdjustment>();

  for (const adjustment of adjustments) {
    const currentAdjustment = adjustmentByLoggedWorkoutId.get(
      adjustment.logged_workout_id,
    );

    if (
      !currentAdjustment ||
      adjustment.created_at > currentAdjustment.created_at
    ) {
      adjustmentByLoggedWorkoutId.set(
        adjustment.logged_workout_id,
        adjustment,
      );
    }
  }

  return adjustmentByLoggedWorkoutId;
}

export function formatAffectedWorkoutLabels(
  adjustment: PlanAdjustment,
  plannedWorkoutById: Map<string, PlannedWorkout>,
): string[] {
  return adjustment.affected_workout_ids.map((workoutId) => {
    const workout = plannedWorkoutById.get(workoutId);

    if (!workout) {
      return `Workout ${workoutId.slice(0, 8)}`;
    }

    return `${workout.workout_date} - ${workout.title} (${formatValueLabel(
      workout.workout_type,
    )})`;
  });
}
