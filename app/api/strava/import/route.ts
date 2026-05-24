import { NextResponse } from "next/server";
import {
  fetchExistingStravaImportIds,
  saveStravaActivity,
} from "@/lib/db/stravaActivities";
import {
  fetchPrivateStravaConnectionForUser,
  updateStravaConnectionTokens,
} from "@/lib/db/stravaConnections";
import { fetchFirstProfile } from "@/lib/db/profiles";
import { fetchRaceGoalById } from "@/lib/db/raceGoals";
import { fetchActiveTrainingPlanWithWorkouts } from "@/lib/db/trainingPlans";
import {
  fetchLoggedWorkoutsForTrainingPlan,
  fetchWorkoutEvaluationsForTrainingPlan,
} from "@/lib/db/workouts";
import {
  fetchRecentStravaActivities,
  refreshStravaAccessToken,
  shouldRefreshStravaToken,
  type StravaSummaryActivity,
} from "@/lib/strava/client";
import {
  getSupabaseServiceRoleConfigMessage,
  isSupabaseServiceRoleConfigError,
} from "@/lib/integrationConfig";
import {
  buildEmptyStravaImportSummary,
  importStravaActivitiesForActivePlan,
} from "@/lib/strava/importRuns";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveLoggedWorkoutWithCompletion } from "@/lib/training/workoutLogging";
import type { StravaImportDays, StravaImportResponse } from "@/types/strava";

type StravaImportRequest = {
  days?: unknown;
};

export const dynamic = "force-dynamic";

function jsonResponse(
  response: StravaImportResponse,
  status: number,
): NextResponse<StravaImportResponse> {
  return NextResponse.json(response, { status });
}

function buildSummaryResponse(input: {
  ok: boolean;
  message: string;
  errors?: string[];
}): StravaImportResponse {
  return {
    ...buildEmptyStravaImportSummary(),
    ok: input.ok,
    message: input.message,
    errors: input.errors ?? [],
  };
}

async function readImportDays(request: Request): Promise<StravaImportDays> {
  const bodyText = await request.text();

  if (!bodyText.trim()) {
    return 7;
  }

  let body: StravaImportRequest;

  try {
    body = JSON.parse(bodyText) as StravaImportRequest;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }

  if (body.days === undefined) {
    return 7;
  }

  if (body.days === 7 || body.days === 14) {
    return body.days;
  }

  throw new Error("days must be either 7 or 14.");
}

function getAfterEpochSeconds(days: StravaImportDays): number {
  return Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
}

export async function POST(request: Request) {
  let days: StravaImportDays;

  try {
    days = await readImportDays(request);
  } catch (error) {
    return jsonResponse(
      buildSummaryResponse({
        ok: false,
        message: error instanceof Error ? error.message : "Invalid import request.",
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
        buildSummaryResponse({
          ok: false,
          message: "Could not check your sign-in session.",
        }),
        500,
      );
    }

    return jsonResponse(
      buildSummaryResponse({
        ok: false,
        message: "Sign in required to import Strava runs.",
      }),
      401,
    );
  }

  const dbOptions = {
    supabase,
    userId: user.id,
  };
  let serviceRoleSupabase: ReturnType<typeof createServiceRoleClient>;

  try {
    serviceRoleSupabase = createServiceRoleClient();
  } catch (error) {
    return jsonResponse(
      buildSummaryResponse({
        ok: false,
        message: isSupabaseServiceRoleConfigError(error)
          ? getSupabaseServiceRoleConfigMessage(error)
          : "Could not prepare secure Strava import access.",
      }),
      isSupabaseServiceRoleConfigError(error) ? 503 : 500,
    );
  }

  const connection = await fetchPrivateStravaConnectionForUser(
    serviceRoleSupabase,
    user.id,
  );

  if (!connection) {
    return jsonResponse(
      buildSummaryResponse({
        ok: false,
        message: "Connect Strava before importing runs.",
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
    return jsonResponse(
      buildSummaryResponse({
        ok: false,
        message: "Could not refresh the Strava connection. Reconnect Strava and try again.",
      }),
      502,
    );
  }

  const profile = await fetchFirstProfile(dbOptions);

  if (!profile) {
    return jsonResponse(
      buildSummaryResponse({
        ok: false,
        message: "Create and save a Profile before importing Strava runs.",
      }),
      400,
    );
  }

  const activePlan = await fetchActiveTrainingPlanWithWorkouts(
    profile.id,
    dbOptions,
  );

  if (!activePlan) {
    return jsonResponse(
      buildSummaryResponse({
        ok: false,
        message: "Generate or select an active training plan before importing Strava runs.",
      }),
      400,
    );
  }

  let activities: StravaSummaryActivity[];

  try {
    activities = await fetchRecentStravaActivities({
      accessToken,
      afterEpochSeconds: getAfterEpochSeconds(days),
    });
  } catch {
    return jsonResponse(
      buildSummaryResponse({
        ok: false,
        message: "Could not fetch recent Strava activities.",
      }),
      502,
    );
  }

  const [raceGoal, loggedWorkouts, workoutEvaluations] = await Promise.all([
    fetchRaceGoalById(activePlan.plan.race_goal_id, dbOptions),
    fetchLoggedWorkoutsForTrainingPlan(activePlan.plan.id, dbOptions),
    fetchWorkoutEvaluationsForTrainingPlan(activePlan.plan.id, dbOptions),
  ]);
  const existingActivityIds = await fetchExistingStravaImportIds(supabase, {
    userId: user.id,
    stravaActivityIds: activities.map((activity) => activity.id),
  });
  const summary = await importStravaActivitiesForActivePlan({
    userId: user.id,
    profile,
    raceGoal,
    plan: activePlan.plan,
    plannedWorkouts: activePlan.workouts,
    loggedWorkouts,
    workoutEvaluations,
    activities,
    dependencies: {
      isDuplicate: async (stravaActivityId) =>
        existingActivityIds.has(stravaActivityId),
      saveLoggedWorkoutWithCompletion: (input) =>
        saveLoggedWorkoutWithCompletion({
          profile,
          raceGoal,
          plan: activePlan.plan,
          ...input,
          db: dbOptions,
        }),
      saveStravaActivity: async (input) => {
        await saveStravaActivity(supabase, input);
        existingActivityIds.add(input.strava_activity_id);
      },
    },
  });

  return jsonResponse(summary, 200);
}
