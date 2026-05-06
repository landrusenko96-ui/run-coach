import type { PlanAdjustment, WorkoutEvaluation } from "@/types/training";

export type CurrentPlanStatus = "on_track" | "caution" | "needs_recovery";

const cautionAdjustmentTypes = new Set([
  "reduce_next_intensity",
  "add_recovery",
  "reduce_weekly_volume",
  "protect_long_run_progression",
]);

export function deriveCurrentPlanStatus(input: {
  recentWorkoutEvaluations: WorkoutEvaluation[];
  latestPlanAdjustment: PlanAdjustment | null;
}): CurrentPlanStatus {
  const recentEvaluations = [...input.recentWorkoutEvaluations]
    .sort((firstEvaluation, secondEvaluation) =>
      secondEvaluation.created_at.localeCompare(firstEvaluation.created_at),
    )
    .slice(0, 5);
  const latestEvaluation = recentEvaluations[0] ?? null;
  const highRiskCount = recentEvaluations.filter(
    (evaluation) => evaluation.risk_level === "high",
  ).length;
  const mediumRiskCount = recentEvaluations.filter(
    (evaluation) => evaluation.risk_level === "medium",
  ).length;

  if (latestEvaluation?.risk_level === "high" || highRiskCount >= 2) {
    return "needs_recovery";
  }

  if (
    highRiskCount > 0 ||
    mediumRiskCount >= 2 ||
    (input.latestPlanAdjustment !== null &&
      cautionAdjustmentTypes.has(input.latestPlanAdjustment.adjustment_type))
  ) {
    return "caution";
  }

  return "on_track";
}
