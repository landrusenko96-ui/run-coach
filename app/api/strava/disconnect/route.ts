import { NextResponse } from "next/server";
import { deleteStravaConnectionForUser } from "@/lib/db/stravaConnections";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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

  try {
    await deleteStravaConnectionForUser(supabase, user.id);

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
