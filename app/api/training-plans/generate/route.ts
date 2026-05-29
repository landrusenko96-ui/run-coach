import { NextResponse } from "next/server";
import { fetchLoggedWorkoutsForProfileDateRange } from "@/lib/db/workouts";
import {
  fetchPrivateStravaConnectionForUser,
  updateStravaConnectionTokens,
} from "@/lib/db/stravaConnections";
import { fetchFirstProfile } from "@/lib/db/profiles";
import { fetchActiveRaceGoal } from "@/lib/db/raceGoals";
import {
  activateTrainingPlan,
  fetchActiveTrainingPlan,
  savePlannedWorkouts,
  saveTrainingPlan,
} from "@/lib/db/trainingPlans";
import {
  getSupabaseServiceRoleConfigMessage,
  isSupabaseServiceRoleConfigError,
} from "@/lib/integrationConfig";
import {
  fetchRecentStravaActivities,
  refreshStravaAccessToken,
  shouldRefreshStravaToken,
  type StravaSummaryActivity,
} from "@/lib/strava/client";
import {
  enrichStravaActivitiesForPlanHistory,
  type StravaActivityEvidence,
} from "@/lib/strava/activityEvidence";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildPlanGenerationHistorySummary,
  getPlanGenerationEvidenceWorkouts,
  getSixWeekHistoryWindow,
  hasCompleteSixWeekCoverage,
  importMissingStravaHistoryRuns,
} from "@/lib/training/planGenerationHistory";
import { generateTrainingPlan } from "@/lib/training/planGenerator";
import type {
  GenerateTrainingPlanApiResponse,
  PlanGenerationHistorySummary,
  PlannedWorkout,
  TrainingPlan,
} from "@/types/training";

type GenerateTrainingPlanRequest = {
  planName?: unknown;
  replaceActivePlan?: unknown;
  startDate?: unknown;
  historyMode?: unknown;
};

type HistoryMode = "auto" | "manual";

export const dynamic = "force-dynamic";

function jsonResponse(
  response: GenerateTrainingPlanApiResponse,
  status: number,
): NextResponse<GenerateTrainingPlanApiResponse> {
  return NextResponse.json(response, { status });
}

async function readGenerateRequest(
  request: Request,
): Promise<{
  planName?: string;
  replaceActivePlan: boolean;
  startDate?: string;
  historyMode: HistoryMode;
}> {
  const bodyText = await request.text();

  if (!bodyText.trim()) {
    return {
      replaceActivePlan: false,
      historyMode: "auto",
    };
  }

  let body: GenerateTrainingPlanRequest;

  try {
    body = JSON.parse(bodyText) as GenerateTrainingPlanRequest;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }

  const planName = typeof body.planName === "string" ? body.planName : undefined;
  const replaceActivePlan = body.replaceActivePlan === true;
  const startDate =
    typeof body.startDate === "string" && body.startDate.trim()
      ? body.startDate.trim()
      : undefined;
  const historyMode = body.historyMode === "manual" ? "manual" : "auto";

  return {
    planName,
    replaceActivePlan,
    startDate,
    historyMode,
  };
}

function buildFailureResult(input: {
  message: string;
  needsConfirmation?: boolean;
  needsStravaConnection?: boolean;
  needsManualHistory?: boolean;
  plan?: TrainingPlan | null;
  historySummary?: PlanGenerationHistorySummary | null;
}): GenerateTrainingPlanApiResponse {
  return {
    success: false,
    message: input.message,
    needsConfirmation: input.needsConfirmation ?? false,
    needsStravaConnection: input.needsStravaConnection ?? false,
    needsManualHistory: input.needsManualHistory ?? false,
    plan: input.plan ?? null,
    workouts: [],
    assumptions: [],
    warnings: [],
    historySummary: input.historySummary ?? null,
  };
}

function normalizePlanName(planName: string | undefined): string | null {
  const trimmedPlanName = planName?.trim();

  return trimmedPlanName ? trimmedPlanName : null;
}

function getAfterEpochSeconds(dateText: string): number {
  const [year, month, day] = dateText.split("-").map(Number);
  const timestamp = new Date(year, month - 1, day).getTime();

  return Math.floor(timestamp / 1000);
}

function withHistoryNeeds(
  historySummary: PlanGenerationHistorySummary,
  input: {
    needsStravaConnection?: boolean;
    needsManualHistory?: boolean;
    message?: string;
  },
): PlanGenerationHistorySummary {
  return {
    ...historySummary,
    needs_strava_connection: input.needsStravaConnection ?? false,
    needs_manual_history: input.needsManualHistory ?? false,
    message: input.message ?? historySummary.message,
  };
}

function buildSuccessMessage(input: {
  workoutCount: number;
  assumptionCount: number;
  warningCount: number;
  pausedPlanName?: string;
  historySummary: PlanGenerationHistorySummary;
}): string {
  const pausedMessage = input.pausedPlanName
    ? ` Paused previous active plan: ${input.pausedPlanName}.`
    : "";
  const assumptionMessage =
    input.assumptionCount > 0
      ? ` ${input.assumptionCount} assumption${
          input.assumptionCount === 1 ? " was" : "s were"
        } used.`
      : "";
  const warningMessage =
    input.warningCount > 0
      ? ` ${input.warningCount} warning${
          input.warningCount === 1 ? " was" : "s were"
        } added.`
      : "";

  return `Generated, saved, and activated ${input.workoutCount} planned workouts. ${input.historySummary.message}${pausedMessage}${assumptionMessage}${warningMessage}`;
}

export async function POST(request: Request) {
  let generateRequest: Awaited<ReturnType<typeof readGenerateRequest>>;

  try {
    generateRequest = await readGenerateRequest(request);
  } catch (error) {
    return jsonResponse(
      buildFailureResult({
        message:
          error instanceof Error ? error.message : "Invalid plan generation request.",
      }),
      400,
    );
  }

  const supabase = await createSupabaseServerClient();
  let user: Awaited<ReturnType<typeof requireServerUser>>;

  try {
    user = await requireServerUser(supabase);
  } catch (error) {
    if (!(error instanceof AuthRequiredError)) {
      return jsonResponse(
        buildFailureResult({
          message: "Could not check your sign-in session.",
        }),
        500,
      );
    }

    return jsonResponse(
      buildFailureResult({
        message: "Sign in required to generate a training plan.",
      }),
      401,
    );
  }

  const dbOptions = {
    supabase,
    userId: user.id,
  };

  try {
    const profile = await fetchFirstProfile(dbOptions);

    if (!profile) {
      return jsonResponse(
        buildFailureResult({
          message: "Create and save a Profile before generating a training plan.",
        }),
        400,
      );
    }

    const raceGoal = await fetchActiveRaceGoal(profile.id, dbOptions);

    if (!raceGoal) {
      return jsonResponse(
        buildFailureResult({
          message:
            "Create and save an active Race Goal before generating a training plan.",
        }),
        400,
      );
    }

    const historyWindow = getSixWeekHistoryWindow();
    const appLoggedWorkouts = await fetchLoggedWorkoutsForProfileDateRange(
      {
        profileId: profile.id,
        startDate: historyWindow.startDate,
        endDate: historyWindow.endDate,
      },
      dbOptions,
    );
    let historyWorkoutsForGeneration = getPlanGenerationEvidenceWorkouts({
      historyMode: generateRequest.historyMode,
      appLoggedWorkouts,
    });
    let stravaActivityEvidence: StravaActivityEvidence[] = [];
    let stravaEvidenceWarnings: string[] = [];
    let historySummary = buildPlanGenerationHistorySummary({
      profile,
      appLoggedWorkouts,
      windowEndDate: historyWindow.endDate,
      forceManual: generateRequest.historyMode === "manual",
    });

    if (
      generateRequest.historyMode === "manual" &&
      !hasCompleteSixWeekCoverage(historySummary.weeks)
    ) {
      historySummary = withHistoryNeeds(historySummary, {
        needsManualHistory: true,
      });

      return jsonResponse(
        buildFailureResult({
          message: historySummary.message,
          needsManualHistory: true,
          historySummary,
        }),
        400,
      );
    }

    const existingActivePlan = await fetchActiveTrainingPlan(profile.id, dbOptions);

    if (existingActivePlan && !generateRequest.replaceActivePlan) {
      return jsonResponse(
        buildFailureResult({
          message:
            "An active training plan already exists. Confirm that you want to pause it before generating and activating a replacement.",
          needsConfirmation: true,
          plan: existingActivePlan,
          historySummary,
        }),
        409,
      );
    }

    if (
      generateRequest.historyMode === "auto" &&
      !hasCompleteSixWeekCoverage(historySummary.weeks)
    ) {
      let serviceRoleSupabase: ReturnType<typeof createServiceRoleClient>;

      try {
        serviceRoleSupabase = createServiceRoleClient();
      } catch (error) {
        historySummary = withHistoryNeeds(historySummary, {
          needsManualHistory: true,
          message:
            "Six-week app history is incomplete and secure Strava import access is not configured. Fill manual six-week history to generate now.",
        });

        return jsonResponse(
          buildFailureResult({
            message: isSupabaseServiceRoleConfigError(error)
              ? getSupabaseServiceRoleConfigMessage(error)
              : historySummary.message,
            needsManualHistory: true,
            historySummary,
          }),
          isSupabaseServiceRoleConfigError(error) ? 503 : 500,
        );
      }

      const connection = await fetchPrivateStravaConnectionForUser(
        serviceRoleSupabase,
        user.id,
      );

      if (!connection) {
        historySummary = withHistoryNeeds(historySummary, {
          needsStravaConnection: true,
          needsManualHistory: true,
          message:
            "Six-week app history is incomplete. Connect Strava to import missing runs, or fill manual six-week history.",
        });

        return jsonResponse(
          buildFailureResult({
            message: historySummary.message,
            needsStravaConnection: true,
            needsManualHistory: true,
            historySummary,
          }),
          400,
        );
      }

      let accessToken = connection.accessToken;

      try {
        if (shouldRefreshStravaToken(connection.tokenExpiresAt)) {
          const refreshedToken = await refreshStravaAccessToken(
            connection.refreshToken,
          );

          await updateStravaConnectionTokens(serviceRoleSupabase, {
            userId: user.id,
            accessToken: refreshedToken.accessToken,
            refreshToken: refreshedToken.refreshToken,
            tokenExpiresAt: refreshedToken.tokenExpiresAt,
          });

          accessToken = refreshedToken.accessToken;
        }
      } catch {
        historySummary = withHistoryNeeds(historySummary, {
          needsStravaConnection: true,
          needsManualHistory: true,
          message:
            "Could not refresh the Strava connection. Reconnect Strava, or fill manual six-week history.",
        });

        return jsonResponse(
          buildFailureResult({
            message: historySummary.message,
            needsStravaConnection: true,
            needsManualHistory: true,
            historySummary,
          }),
          502,
        );
      }

      let activities: StravaSummaryActivity[];

      try {
        activities = await fetchRecentStravaActivities({
          accessToken,
          afterEpochSeconds: getAfterEpochSeconds(historyWindow.startDate),
        });
      } catch {
        historySummary = withHistoryNeeds(historySummary, {
          needsManualHistory: true,
          message:
            "Could not fetch six-week Strava history. Fill manual six-week history to generate now.",
        });

        return jsonResponse(
          buildFailureResult({
            message: historySummary.message,
            needsManualHistory: true,
            historySummary,
          }),
          502,
        );
      }

      const stravaHistoryEvidence = await enrichStravaActivitiesForPlanHistory({
        activities,
        accessToken,
        windowStartDate: historyWindow.startDate,
        windowEndDate: historyWindow.endDate,
      });

      activities = stravaHistoryEvidence.activities;
      stravaActivityEvidence = stravaHistoryEvidence.evidence;
      stravaEvidenceWarnings = stravaHistoryEvidence.warnings;

      const stravaHistoryImport = await importMissingStravaHistoryRuns({
        userId: user.id,
        profile,
        raceGoal,
        appLoggedWorkouts,
        stravaActivities: activities,
        windowStartDate: historyWindow.startDate,
        windowEndDate: historyWindow.endDate,
        supabase: serviceRoleSupabase,
      });

      historySummary = buildPlanGenerationHistorySummary({
        profile,
        appLoggedWorkouts,
        importedStravaWorkouts: stravaHistoryImport.importedWorkouts,
        skippedStravaActivities: stravaHistoryImport.skippedActivities,
        windowEndDate: historyWindow.endDate,
      });
      historyWorkoutsForGeneration = getPlanGenerationEvidenceWorkouts({
        historyMode: generateRequest.historyMode,
        appLoggedWorkouts,
        importedStravaWorkouts: stravaHistoryImport.importedWorkouts,
      });

      if (!hasCompleteSixWeekCoverage(historySummary.weeks)) {
        historySummary = withHistoryNeeds(historySummary, {
          needsManualHistory: true,
          message:
            "Six-week history is still incomplete after Strava import. Fill manual six-week history to confirm the missing weeks.",
        });

        return jsonResponse(
          buildFailureResult({
            message: historySummary.message,
            needsManualHistory: true,
            historySummary,
          }),
        400,
        );
      }
    }

    const generatedPlan = generateTrainingPlan(profile, raceGoal, {
      startDate: generateRequest.startDate,
      recentHistory: historySummary.weeks,
      recentHistoryWorkouts: historyWorkoutsForGeneration,
      stravaActivityEvidence,
      recentHistoryEvidenceWarnings: stravaEvidenceWarnings,
    });
    const customPlanName = normalizePlanName(generateRequest.planName);
    const savedPlan = await saveTrainingPlan(
      {
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
      },
      dbOptions,
    );
    const plannedWorkoutInputs = generatedPlan.plannedWorkouts.map((workout) => ({
      ...workout,
      training_plan_id: savedPlan.id,
    }));
    const savedWorkouts = await savePlannedWorkouts(
      plannedWorkoutInputs,
      dbOptions,
    );
    const activatedPlan = await activateTrainingPlan(savedPlan.id, dbOptions);

    return jsonResponse(
      {
        success: true,
        message: buildSuccessMessage({
          workoutCount: savedWorkouts.length,
          assumptionCount: generatedPlan.trainingPlan.assumptions.length,
          warningCount: generatedPlan.trainingPlan.warnings.length,
          pausedPlanName: existingActivePlan?.name,
          historySummary,
        }),
        needsConfirmation: false,
        needsStravaConnection: false,
        needsManualHistory: false,
        plan: activatedPlan,
        workouts: savedWorkouts as PlannedWorkout[],
        assumptions: generatedPlan.trainingPlan.assumptions,
        warnings: generatedPlan.trainingPlan.warnings,
        historySummary,
      },
      200,
    );
  } catch (error) {
    return jsonResponse(
      buildFailureResult({
        message:
          error instanceof Error
            ? error.message
            : "Could not generate and save the training plan.",
      }),
      500,
    );
  }
}
