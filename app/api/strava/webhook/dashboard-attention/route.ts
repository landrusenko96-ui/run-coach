import { NextResponse } from "next/server";
import { fetchSafeStravaConnectionForUser } from "@/lib/db/stravaConnections";
import { getStravaWebhookSubscription } from "@/lib/strava/webhookSubscriptions";
import {
  buildDisconnectedWebhookDashboardAttentionResponse,
  buildUnauthenticatedWebhookDashboardAttentionResponse,
  buildWebhookDashboardAttentionResponse,
  fetchStravaWebhookDashboardAttentionData,
  type StravaWebhookDashboardAttentionResponse,
} from "@/lib/strava/webhookDashboardAttention";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLocalTodayDateText } from "@/lib/training/dashboardWeek";

export const dynamic = "force-dynamic";

function jsonResponse(
  response: StravaWebhookDashboardAttentionResponse,
  status: number,
): NextResponse<StravaWebhookDashboardAttentionResponse> {
  return NextResponse.json(response, { status });
}

async function fetchSubscriptionExists(): Promise<boolean | null> {
  try {
    const subscription = await getStravaWebhookSubscription();

    return subscription.ok ? subscription.exists : null;
  } catch {
    return null;
  }
}

export async function GET() {
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
          attentionItems: [],
        },
        500,
      );
    }

    return jsonResponse(buildUnauthenticatedWebhookDashboardAttentionResponse(), 401);
  }

  try {
    const connection = await fetchSafeStravaConnectionForUser(supabase, user.id);

    if (!connection) {
      return jsonResponse(buildDisconnectedWebhookDashboardAttentionResponse(), 200);
    }

    const [subscriptionExists, attentionData] = await Promise.all([
      fetchSubscriptionExists(),
      fetchStravaWebhookDashboardAttentionData({
        supabase,
        userId: user.id,
        ownerId: connection.athlete.stravaAthleteId,
      }),
    ]);

    return jsonResponse(
      buildWebhookDashboardAttentionResponse({
        subscriptionExists,
        attentionData,
        todayDateText: getLocalTodayDateText(),
      }),
      200,
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        authenticated: true,
        connected: true,
        message: "Could not load Strava webhook dashboard attention.",
        attentionItems: [],
      },
      500,
    );
  }
}
