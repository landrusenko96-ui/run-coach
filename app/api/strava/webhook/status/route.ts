import { NextResponse } from "next/server";
import { fetchSafeStravaConnectionForUser } from "@/lib/db/stravaConnections";
import {
  buildDisconnectedWebhookStatusResponse,
  buildUnauthenticatedWebhookStatusResponse,
  fetchStravaWebhookStatusForUser,
} from "@/lib/strava/webhookStatus";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
