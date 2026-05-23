import { NextResponse } from "next/server";
import { fetchSafeStravaConnectionForUser } from "@/lib/db/stravaConnections";
import {
  buildDisconnectedWebhookStatusResponse,
  buildUnauthenticatedWebhookStatusResponse,
  fetchStravaWebhookStatusForUser,
} from "@/lib/strava/webhookStatus";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StravaWebhookStatusResponse } from "@/types/strava";

export const dynamic = "force-dynamic";

function jsonResponse(
  response: StravaWebhookStatusResponse,
  status: number,
): NextResponse<StravaWebhookStatusResponse> {
  return NextResponse.json(response, { status });
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
          pendingEvents: 0,
          failedEvents: 0,
          recentEvents: [],
        },
        500,
      );
    }

    return jsonResponse(buildUnauthenticatedWebhookStatusResponse(), 401);
  }

  try {
    const connection = await fetchSafeStravaConnectionForUser(supabase, user.id);

    if (!connection) {
      return jsonResponse(buildDisconnectedWebhookStatusResponse(), 200);
    }

    const status = await fetchStravaWebhookStatusForUser({
      supabase,
      userId: user.id,
      ownerId: connection.athlete.stravaAthleteId,
    });

    return jsonResponse(status, 200);
  } catch {
    return jsonResponse(
      {
        ok: false,
        authenticated: true,
        connected: true,
        message: "Could not load Strava webhook status.",
        pendingEvents: 0,
        failedEvents: 0,
        recentEvents: [],
      },
      500,
    );
  }
}
