import { NextResponse } from "next/server";
import { deleteStravaConnectionForUser } from "@/lib/db/stravaConnections";
import {
  getSupabaseServiceRoleConfigMessage,
  isSupabaseServiceRoleConfigError,
} from "@/lib/integrationConfig";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DisconnectResponse = {
  ok: boolean;
  connected: false;
  authenticated: boolean;
  message: string;
};

export const dynamic = "force-dynamic";

function jsonResponse(
  response: DisconnectResponse,
  status: number,
): NextResponse<DisconnectResponse> {
  return NextResponse.json(response, { status });
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  let user: Awaited<ReturnType<typeof requireServerUser>>;

  try {
    user = await requireServerUser(supabase);
  } catch (error) {
    if (!(error instanceof AuthRequiredError)) {
      return jsonResponse(
        {
          ok: false,
          connected: false,
          authenticated: false,
          message: "Could not check your sign-in session.",
        },
        500,
      );
    }

    return jsonResponse(
      {
        ok: false,
        connected: false,
        authenticated: false,
        message: "Sign in required to disconnect Strava.",
      },
      401,
    );
  }

  let serviceRoleSupabase: ReturnType<typeof createServiceRoleClient>;

  try {
    serviceRoleSupabase = createServiceRoleClient();
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        connected: false,
        authenticated: true,
        message: isSupabaseServiceRoleConfigError(error)
          ? getSupabaseServiceRoleConfigMessage(error)
          : "Could not prepare secure Strava disconnect access.",
      },
      isSupabaseServiceRoleConfigError(error) ? 503 : 500,
    );
  }

  try {
    await deleteStravaConnectionForUser(serviceRoleSupabase, user.id);

    return jsonResponse(
      {
        ok: true,
        connected: false,
        authenticated: true,
        message: "Strava disconnected locally.",
      },
      200,
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        connected: false,
        authenticated: true,
        message: "Could not disconnect Strava.",
      },
      500,
    );
  }
}
