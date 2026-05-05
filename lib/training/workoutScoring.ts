import type {
  LoggedWorkout,
  PlannedWorkout,
  WorkoutEvaluation,
  WorkoutRiskLevel,
  WorkoutType,
} from "@/types/training";

export type WorkoutEvaluationInput = Omit<
  WorkoutEvaluation,
  "id" | "created_at" | "updated_at"
>;

type EffortTarget = {
  minRpe: number;
  maxRpe: number;
  veryHighRpe: number;
};

type ScoreContext = {
  distanceScore: number;
  paceScore: number;
  effortScore: number;
  completionScore: number;
  trainingValueScore: number;
  riskLevel: WorkoutRiskLevel;
  actualPaceSecPerKm: number | null;
  plannedPaceMinSecPerKm: number | null;
  plannedPaceMaxSecPerKm: number | null;
};

const neutralScore = 85;

const effortTargetsByWorkoutType: Record<WorkoutType, EffortTarget> = {
  easy: { minRpe: 2, maxRpe: 5, veryHighRpe: 8 },
  long_run: { minRpe: 3, maxRpe: 6, veryHighRpe: 8 },
  tempo: { minRpe: 5, maxRpe: 8, veryHighRpe: 10 },
  interval: { minRpe: 6, maxRpe: 9, veryHighRpe: 10 },
  marathon_pace: { minRpe: 4, maxRpe: 7, veryHighRpe: 9 },
  recovery: { minRpe: 1, maxRpe: 4, veryHighRpe: 7 },
  calibration: { minRpe: 6, maxRpe: 9, veryHighRpe: 10 },
  rest: { minRpe: 1, maxRpe: 2, veryHighRpe: 5 },
  strength_optional: { minRpe: 2, maxRpe: 6, veryHighRpe: 8 },
  cross_training: { minRpe: 2, maxRpe: 6, veryHighRpe: 8 },
};

export function scoreWorkout(
  loggedWorkout: LoggedWorkout,
  plannedWorkout?: PlannedWorkout,
): WorkoutEvaluationInput {
  const context = buildScoreContext(loggedWorkout, plannedWorkout);

  return {
    logged_workout_id: loggedWorkout.id,
    planned_workout_id: plannedWorkout?.id ?? loggedWorkout.planned_workout_id,
    profile_id: plannedWorkout?.profile_id ?? loggedWorkout.profile_id,
    training_plan_id:
      plannedWorkout?.training_plan_id ?? loggedWorkout.training_plan_id,
    overall_score: calculateOverallScore(context),
    completion_score: context.completionScore,
    pace_accuracy_score: context.paceScore,
    distance_completion_score: context.distanceScore,
    effort_control_score: context.effortScore,
    training_value_score: context.trainingValueScore,
    risk_level: context.riskLevel,
    summary: buildSummary(context, plannedWorkout),
  };
}

function buildScoreContext(
  loggedWorkout: LoggedWorkout,
  plannedWorkout?: PlannedWorkout,
): ScoreContext {
  const actualPaceSecPerKm = getActualPaceSecPerKm(loggedWorkout);
  const plannedPaceMinSecPerKm = plannedWorkout?.target_pace_min_sec_per_km ?? null;
  const plannedPaceMaxSecPerKm = plannedWorkout?.target_pace_max_sec_per_km ?? null;
  const distanceScore = calculateDistanceCompletionScore(
    loggedWorkout,
    plannedWorkout,
  );
  const paceScore = calculatePaceAccuracyScore({
    actualPaceSecPerKm,
    plannedPaceMinSecPerKm,
    plannedPaceMaxSecPerKm,
  });
  const effortScore = calculateEffortControlScore(loggedWorkout, plannedWorkout);
  const completionScore = calculateCompletionScore(loggedWorkout, distanceScore);
  const riskLevel = calculateRiskLevel({
    loggedWorkout,
    plannedWorkout,
    actualPaceSecPerKm,
    paceScore,
    effortScore,
  });
  const trainingValueScore = calculateTrainingValueScore({
    completionScore,
    distanceScore,
    paceScore,
    effortScore,
    riskLevel,
  });

  return {
    distanceScore,
    paceScore,
    effortScore,
    completionScore,
    trainingValueScore,
    riskLevel,
    actualPaceSecPerKm,
    plannedPaceMinSecPerKm,
    plannedPaceMaxSecPerKm,
  };
}

function calculateDistanceCompletionScore(
  loggedWorkout: LoggedWorkout,
  plannedWorkout?: PlannedWorkout,
): number {
  if (plannedWorkout?.distance_km && loggedWorkout.distance_km) {
    return scoreCloseness(loggedWorkout.distance_km, plannedWorkout.distance_km);
  }

  if (plannedWorkout?.duration_min && loggedWorkout.duration_sec) {
    const plannedDurationSec = plannedWorkout.duration_min * 60;
    return scoreCloseness(loggedWorkout.duration_sec, plannedDurationSec);
  }

  // A missing planned target should not punish the runner; this means the plan data was incomplete.
  if (loggedWorkout.distance_km || loggedWorkout.duration_sec) {
    return neutralScore;
  }

  return 50;
}

function calculatePaceAccuracyScore(input: {
  actualPaceSecPerKm: number | null;
  plannedPaceMinSecPerKm: number | null;
  plannedPaceMaxSecPerKm: number | null;
}): number {
  if (!input.actualPaceSecPerKm) {
    return 50;
  }

  if (!input.plannedPaceMinSecPerKm || !input.plannedPaceMaxSecPerKm) {
    return neutralScore;
  }

  if (
    input.actualPaceSecPerKm >= input.plannedPaceMinSecPerKm &&
    input.actualPaceSecPerKm <= input.plannedPaceMaxSecPerKm
  ) {
    return 100;
  }

  const nearestTargetEdge =
    input.actualPaceSecPerKm < input.plannedPaceMinSecPerKm
      ? input.plannedPaceMinSecPerKm
      : input.plannedPaceMaxSecPerKm;
  const percentOffTarget =
    Math.abs(input.actualPaceSecPerKm - nearestTargetEdge) / nearestTargetEdge;

  // Pace is noisy on hills and GPS, so each 1% outside the range costs 5 points.
  return clampScore(100 - percentOffTarget * 500);
}

function calculateEffortControlScore(
  loggedWorkout: LoggedWorkout,
  plannedWorkout?: PlannedWorkout,
): number {
  const workoutType = plannedWorkout?.workout_type ?? "easy";
  const effortTarget = effortTargetsByWorkoutType[workoutType];
  let score = neutralScore;

  if (loggedWorkout.rpe !== null) {
    if (
      loggedWorkout.rpe >= effortTarget.minRpe &&
      loggedWorkout.rpe <= effortTarget.maxRpe
    ) {
      score = 100;
    } else {
      const nearestRpeEdge =
        loggedWorkout.rpe < effortTarget.minRpe
          ? effortTarget.minRpe
          : effortTarget.maxRpe;
      // RPE is subjective, so each point outside the expected band costs 12 points.
      score = clampScore(100 - Math.abs(loggedWorkout.rpe - nearestRpeEdge) * 12);
    }
  }

  if (loggedWorkout.avg_heart_rate !== null && loggedWorkout.max_heart_rate !== null) {
    const heartRateSpread = loggedWorkout.max_heart_rate - loggedWorkout.avg_heart_rate;

    if (loggedWorkout.max_heart_rate >= 200) {
      score -= 20;
    } else if (loggedWorkout.avg_heart_rate >= 185) {
      score -= 12;
    }

    if (heartRateSpread < 5 && loggedWorkout.avg_heart_rate >= 170) {
      score -= 8;
    }
  } else if (loggedWorkout.max_heart_rate !== null && loggedWorkout.max_heart_rate >= 200) {
    score -= 20;
  } else if (loggedWorkout.avg_heart_rate !== null && loggedWorkout.avg_heart_rate >= 185) {
    score -= 12;
  }

  return clampScore(score);
}

function calculateCompletionScore(
  loggedWorkout: LoggedWorkout,
  distanceScore: number,
): number {
  const hasDistance = loggedWorkout.distance_km !== null && loggedWorkout.distance_km > 0;
  const hasDuration = loggedWorkout.duration_sec !== null && loggedWorkout.duration_sec > 0;
  let score = distanceScore;

  // Completion mostly follows the planned load, with small penalties for incomplete actual data.
  if (!hasDistance) {
    score -= 20;
  }

  if (!hasDuration) {
    score -= 20;
  }

  return clampScore(score);
}

function calculateTrainingValueScore(input: {
  completionScore: number;
  distanceScore: number;
  paceScore: number;
  effortScore: number;
  riskLevel: WorkoutRiskLevel;
}): number {
  const riskPenalty = input.riskLevel === "high" ? 18 : input.riskLevel === "medium" ? 8 : 0;

  // Training value rewards doing the work while avoiding a risky overreach.
  return clampScore(
    input.completionScore * 0.35 +
      input.distanceScore * 0.25 +
      input.paceScore * 0.2 +
      input.effortScore * 0.2 -
      riskPenalty,
  );
}

function calculateOverallScore(context: ScoreContext): number {
  // Fixed weights keep the score understandable and avoid hidden model behavior.
  return clampScore(
    context.completionScore * 0.3 +
      context.distanceScore * 0.25 +
      context.paceScore * 0.2 +
      context.effortScore * 0.15 +
      context.trainingValueScore * 0.1,
  );
}

function calculateRiskLevel(input: {
  loggedWorkout: LoggedWorkout;
  plannedWorkout?: PlannedWorkout;
  actualPaceSecPerKm: number | null;
  paceScore: number;
  effortScore: number;
}): WorkoutRiskLevel {
  const workoutType = input.plannedWorkout?.workout_type ?? "easy";
  const effortTarget = effortTargetsByWorkoutType[workoutType];
  const rpe = input.loggedWorkout.rpe;
  const maxHeartRate = input.loggedWorkout.max_heart_rate;
  const avgHeartRate = input.loggedWorkout.avg_heart_rate;
  const fasterThanTargetPercent = getFasterThanTargetPercent({
    actualPaceSecPerKm: input.actualPaceSecPerKm,
    plannedPaceMinSecPerKm: input.plannedWorkout?.target_pace_min_sec_per_km ?? null,
  });

  if (
    (rpe !== null && rpe >= effortTarget.veryHighRpe) ||
    (maxHeartRate !== null && maxHeartRate >= 200) ||
    fasterThanTargetPercent >= 0.15 ||
    (input.effortScore < 55 && input.paceScore < 70)
  ) {
    return "high";
  }

  if (
    (rpe !== null && rpe > effortTarget.maxRpe) ||
    (avgHeartRate !== null && avgHeartRate >= 185) ||
    fasterThanTargetPercent >= 0.07 ||
    input.effortScore < 70 ||
    input.paceScore < 70
  ) {
    return "medium";
  }

  return "low";
}

function buildSummary(
  context: ScoreContext,
  plannedWorkout?: PlannedWorkout,
): string {
  const workoutLabel = plannedWorkout
    ? plannedWorkout.workout_type.replaceAll("_", " ")
    : "workout";

  if (context.riskLevel === "high") {
    return `High risk: this ${workoutLabel} looks much harder or faster than planned.`;
  }

  if (context.distanceScore < 75) {
    return `Distance completion was the main limiter, with ${context.riskLevel} risk.`;
  }

  if (context.paceScore < 75) {
    return `Pace accuracy was the main limiter, with ${context.riskLevel} risk.`;
  }

  if (context.effortScore < 75) {
    return `Effort control was the main limiter, with ${context.riskLevel} risk.`;
  }

  return `Good ${workoutLabel} execution with ${context.riskLevel} risk.`;
}

function getActualPaceSecPerKm(loggedWorkout: LoggedWorkout): number | null {
  if (loggedWorkout.avg_pace_sec_per_km !== null && loggedWorkout.avg_pace_sec_per_km > 0) {
    return loggedWorkout.avg_pace_sec_per_km;
  }

  if (
    loggedWorkout.duration_sec !== null &&
    loggedWorkout.duration_sec > 0 &&
    loggedWorkout.distance_km !== null &&
    loggedWorkout.distance_km > 0
  ) {
    return Math.round(loggedWorkout.duration_sec / loggedWorkout.distance_km);
  }

  return null;
}

function getFasterThanTargetPercent(input: {
  actualPaceSecPerKm: number | null;
  plannedPaceMinSecPerKm: number | null;
}): number {
  if (!input.actualPaceSecPerKm || !input.plannedPaceMinSecPerKm) {
    return 0;
  }

  if (input.actualPaceSecPerKm >= input.plannedPaceMinSecPerKm) {
    return 0;
  }

  return (input.plannedPaceMinSecPerKm - input.actualPaceSecPerKm) / input.plannedPaceMinSecPerKm;
}

function scoreCloseness(actual: number, target: number): number {
  if (target <= 0) {
    return neutralScore;
  }

  const percentDifference = Math.abs(actual - target) / target;

  // Each 1% away from the target costs 1 point, so 90% completion scores about 90.
  return clampScore(100 - percentDifference * 100);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
