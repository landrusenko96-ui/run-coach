import { fetchFirstProfile } from "@/lib/db/profiles";
import { fetchActiveRaceGoal } from "@/lib/db/raceGoals";
import {
  archiveTrainingPlan,
  fetchActiveTrainingPlan,
  savePlannedWorkouts,
  saveTrainingPlan,
} from "@/lib/db/trainingPlans";
import { generateTrainingPlan } from "@/lib/training/planGenerator";
import type { PlannedWorkout, TrainingPlan } from "@/types/training";

type GenerateAndSaveTrainingPlanOptions = {
  archiveExistingPlan?: boolean;
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

    if (existingActivePlan && !options.archiveExistingPlan) {
      return {
        success: false,
        message:
          "An active training plan already exists. Confirm that you want to archive it before generating a replacement.",
        needsConfirmation: true,
        plan: existingActivePlan,
        workouts: [],
        assumptions: [],
        warnings: [],
      };
    }

    const generatedPlan = generateTrainingPlan(profile, raceGoal);
    const trainingPlanInput = {
      profile_id: generatedPlan.trainingPlan.profile_id,
      race_goal_id: generatedPlan.trainingPlan.race_goal_id,
      name: generatedPlan.trainingPlan.name,
      status: generatedPlan.trainingPlan.status,
      start_date: generatedPlan.trainingPlan.start_date,
      end_date: generatedPlan.trainingPlan.end_date,
      total_weeks: generatedPlan.trainingPlan.total_weeks,
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

    if (existingActivePlan) {
      // Database write 3: keep history by archiving the old active plan.
      await archiveTrainingPlan(existingActivePlan.id);
    }

    return {
      success: true,
      message: buildSuccessMessage(
        savedWorkouts.length,
        generatedPlan.trainingPlan.assumptions.length,
        generatedPlan.trainingPlan.warnings.length,
        existingActivePlan?.name,
      ),
      needsConfirmation: false,
      plan: savedPlan,
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
  archivedPlanName?: string,
): string {
  const archivedMessage = archivedPlanName
    ? ` Archived previous plan: ${archivedPlanName}.`
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

  return `Generated and saved ${workoutCount} planned workouts.${archivedMessage}${assumptionMessage}${warningMessage}`;
}
