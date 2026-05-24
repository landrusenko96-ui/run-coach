import { NextResponse } from "next/server";
import { fetchSafeStravaConnectionForUser } from "@/lib/db/stravaConnections";
import {
  buildProcessPendingWebhookSummary,
  readProcessPendingWebhookRequest,
  type ProcessPendingWebhookSummary,
} from "@/lib/strava/webhookProcessPendingRoute";
import { processPendingStravaWebhookEvents } from "@/lib/strava/webhookProcessing";
import {
  getSupabaseServiceRoleConfigMessage,
  isSupabaseServiceRoleConfigError,
} from "@/lib/integrationConfig";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProcessPendingWebhookResponse = ProcessPendingWebhookSummary & {
  ok: boolean;
  authenticated: boolean;
  connected: boolean;
  message: string;
};

export const dynamic = "force-dynamic";

function buildEmptySummary(): ProcessPendingWebhookSummary {
  return {
    processed: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
}

function jsonResponse(
  response: ProcessPendingWebhookResponse,
  status: number,
): NextResponse<ProcessPendingWebhookResponse> {
  return NextResponse.json(response, { status });
}

export async function POST(request: Request) {
  let requestOptions;

  try {
    requestOptions = await readProcessPendingWebhookRequest(request);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        authenticated: false,
        connected: false,
        message:
          error instanceof Error ? error.message : "Invalid webhook processing request.",
        ...buildEmptySummary(),
      },
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
        {
          ok: false,
          authenticated: false,
          connected: false,
          message: "Could not check your sign-in session.",
          ...buildEmptySummary(),
        },
        500,
      );
    }

    return jsonResponse(
      {
        ok: false,
        authenticated: false,
        connected: false,
        message: "Sign in required to process Strava webhook events.",
        ...buildEmptySummary(),
      },
      401,
    );
  }

  let connection;

  try {
    connection = await fetchSafeStravaConnectionForUser(supabase, user.id);
  } catch {
    return jsonResponse(
      {
        ok: false,
        authenticated: true,
        connected: false,
        message: "Could not check Strava connection before processing webhook events.",
        ...buildEmptySummary(),
      },
      500,
    );
  }

  if (!connection) {
    return jsonResponse(
      {
        ok: false,
        authenticated: true,
        connected: false,
        message: "Connect Strava before processing webhook events.",
        ...buildEmptySummary(),
      },
      400,
    );
  }

  let serviceRoleSupabase: ReturnType<typeof createServiceRoleClient>;

  try {
    serviceRoleSupabase = createServiceRoleClient();
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        authenticated: true,
        connected: true,
        message: isSupabaseServiceRoleConfigError(error)
          ? getSupabaseServiceRoleConfigMessage(error)
          : "Could not prepare secure Strava webhook processing access.",
        ...buildEmptySummary(),
      },
      isSupabaseServiceRoleConfigError(error) ? 503 : 500,
    );
  }

  try {
    const results = await processPendingStravaWebhookEvents({
      ownerId: connection.athlete.stravaAthleteId,
      includeFailed: requestOptions.retryFailed,
      limit: requestOptions.limit,
      supabase: serviceRoleSupabase,
    });
    const summary = buildProcessPendingWebhookSummary(results);

    return jsonResponse(
      {
        ok: summary.failed === 0,
        authenticated: true,
        connected: true,
        message:
          summary.processed === 0
            ? "No pending Strava webhook events were found."
            : "Pending Strava webhook events processed.",
        ...summary,
      },
      200,
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        authenticated: true,
        connected: true,
        message: "Could not process pending Strava webhook events.",
        ...buildEmptySummary(),
        failed: 1,
        errors: ["Could not process pending Strava webhook events."],
      },
      500,
    );
  }
}
