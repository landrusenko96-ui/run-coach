import { fetchFirstProfile } from "@/lib/db/profiles";
import { fetchActiveRaceGoal } from "@/lib/db/raceGoals";
import {
  activateTrainingPlan,
  fetchActiveTrainingPlan,
  savePlannedWorkouts,
  saveTrainingPlan,
} from "@/lib/db/trainingPlans";
import { generateTrainingPlan } from "@/lib/training/planGenerator";
import type { PlannedWorkout, TrainingPlan } from "@/types/training";

type GenerateAndSaveTrainingPlanOptions = {
  planName?: string;
  replaceActivePlan?: boolean;
  startDate?: string;
};

type GenerateAndSaveTrainingPlanResult = {
  success: boolean;
  message: string;
  needsConfirmation: boolean;
  plan: TrainingPlan | null;
  workouts: PlannedWorkout[];
  assumptions: string[];
  warnings: string[];
};

export async function generateAndSaveTrainingPlan(
  options: GenerateAndSaveTrainingPlanOptions = {},
): Promise<GenerateAndSaveTrainingPlanResult> {
  try {
    const profile = await fetchFirstProfile();

    if (!profile) {
      return buildFailureResult(
        "Create and save a Profile before generating a training plan.",
      );
    }

    const raceGoal = await fetchActiveRaceGoal(profile.id);

    if (!raceGoal) {
      return buildFailureResult(
        "Create and save an active Race Goal before generating a training plan.",
      );
    }

    const existingActivePlan = await fetchActiveTrainingPlan(profile.id);

    if (existingActivePlan && !options.replaceActivePlan) {
      return {
        success: false,
        message:
          "An active training plan already exists. Confirm that you want to pause it before generating and activating a replacement.",
        needsConfirmation: true,
        plan: existingActivePlan,
        workouts: [],
        assumptions: [],
        warnings: [],
      };
    }

    const generatedPlan = generateTrainingPlan(profile, raceGoal, {
      startDate: options.startDate,
    });
    const customPlanName = normalizePlanName(options.planName);
    const trainingPlanInput = {
      profile_id: generatedPlan.trainingPlan.profile_id,
      race_goal_id: generatedPlan.trainingPlan.race_goal_id,
      name: customPlanName ?? generatedPlan.trainingPlan.name,
      status: generatedPlan.trainingPlan.status,
      start_date: generatedPlan.trainingPlan.start_date,
      end_date: generatedPlan.trainingPlan.end_date,
      total_weeks: generatedPlan.trainingPlan.total_weeks,
      generator_version: generatedPlan.trainingPlan.generator_version,
      feasibility_rating: generatedPlan.trainingPlan.feasibility_rating,
      fitness_confidence: generatedPlan.trainingPlan.fitness_confidence,
      generation_assumptions: generatedPlan.trainingPlan.generation_assumptions,
      generation_warnings: generatedPlan.trainingPlan.generation_warnings,
      phase_summaries: generatedPlan.trainingPlan.phase_summaries,
      weekly_summaries: generatedPlan.trainingPlan.weekly_summaries,
      peak_summary: generatedPlan.trainingPlan.peak_summary,
      taper_summary: generatedPlan.trainingPlan.taper_summary,
    };

    // Database write 1: insert the new training_plans row.
    const savedPlan = await saveTrainingPlan(trainingPlanInput);

    const plannedWorkoutInputs = generatedPlan.plannedWorkouts.map(
      (workout) => ({
        ...workout,
        training_plan_id: savedPlan.id,
      }),
    );

    // Database write 2: insert all generated planned_workouts rows.
    const savedWorkouts = await savePlannedWorkouts(plannedWorkoutInputs);

    // Database write 3: activate the new plan only after its workouts exist.
    // The database function pauses any other active plan for this profile.
    const activatedPlan = await activateTrainingPlan(savedPlan.id);

    return {
      success: true,
      message: buildSuccessMessage(
        savedWorkouts.length,
        generatedPlan.trainingPlan.assumptions.length,
        generatedPlan.trainingPlan.warnings.length,
        existingActivePlan?.name,
      ),
      needsConfirmation: false,
      plan: activatedPlan,
      workouts: savedWorkouts,
      assumptions: generatedPlan.trainingPlan.assumptions,
      warnings: generatedPlan.trainingPlan.warnings,
    };
  } catch (error) {
    return buildFailureResult(
      error instanceof Error
        ? error.message
        : "Could not generate and save the training plan.",
    );
  }
}

function normalizePlanName(planName: string | undefined): string | null {
  const trimmedPlanName = planName?.trim();

  return trimmedPlanName ? trimmedPlanName : null;
}

function buildFailureResult(message: string): GenerateAndSaveTrainingPlanResult {
  return {
    success: false,
    message,
    needsConfirmation: false,
    plan: null,
    workouts: [],
    assumptions: [],
    warnings: [],
  };
}

function buildSuccessMessage(
  workoutCount: number,
  assumptionCount: number,
  warningCount: number,
  pausedPlanName?: string,
): string {
  const pausedMessage = pausedPlanName
    ? ` Paused previous active plan: ${pausedPlanName}.`
    : "";
  const assumptionMessage =
    assumptionCount > 0
      ? ` ${assumptionCount} conservative assumption${
          assumptionCount === 1 ? " was" : "s were"
        } used.`
      : "";
  const warningMessage =
    warningCount > 0
      ? ` ${warningCount} warning${warningCount === 1 ? " was" : "s were"} added.`
      : "";

  return `Generated, saved, and activated ${workoutCount} planned workouts.${pausedMessage}${assumptionMessage}${warningMessage}`;
}
