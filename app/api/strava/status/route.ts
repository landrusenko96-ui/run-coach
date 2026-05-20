import { NextResponse } from "next/server";
import { fetchSafeStravaConnectionForUser } from "@/lib/db/stravaConnections";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StravaStatusResponse } from "@/types/strava";

export const dynamic = "force-dynamic";

function jsonResponse(
  response: StravaStatusResponse,
  status: number,
): NextResponse<StravaStatusResponse> {
  return NextResponse.json(response, { status });
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonResponse(
      {
        ok: true,
        connected: false,
        authenticated: false,
        message: "Sign in required to connect Strava.",
        athlete: null,
        scope: null,
        tokenExpiresAt: null,
      },
      200,
    );
  }

  try {
    const connection = await fetchSafeStravaConnectionForUser(supabase, user.id);

    if (!connection) {
      return jsonResponse(
        {
          ok: true,
          connected: false,
          authenticated: true,
          message: "Strava is not connected.",
          athlete: null,
          scope: null,
          tokenExpiresAt: null,
        },
        200,
      );
    }

    return jsonResponse(
      {
        ok: true,
        connected: true,
        authenticated: true,
        message: "Strava is connected.",
        athlete: connection.athlete,
        scope: connection.scope,
        tokenExpiresAt: connection.tokenExpiresAt,
      },
      200,
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        connected: false,
        authenticated: true,
        message: "Could not check Strava connection status.",
        athlete: null,
        scope: null,
        tokenExpiresAt: null,
      },
      500,
    );
  }
}
