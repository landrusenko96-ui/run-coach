import { NextRequest, NextResponse } from "next/server";
import { buildStravaAuthorizationUrl } from "@/lib/strava/client";
import {
  createStravaOAuthState,
  STRAVA_OAUTH_STATE_COOKIE_NAME,
  STRAVA_OAUTH_STATE_MAX_AGE_SECONDS,
} from "@/lib/strava/oauthState";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function redirectToSettings(request: NextRequest, status: string): NextResponse {
  const url = new URL("/settings", request.url);
  url.searchParams.set("strava", status);

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  try {
    await requireServerUser(supabase);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return redirectToSettings(request, "sign_in_required");
    }

    return redirectToSettings(request, "sign_in_required");
  }

  const state = createStravaOAuthState();
  let authorizationUrl: string;

  try {
    authorizationUrl = buildStravaAuthorizationUrl(state);
  } catch {
    return redirectToSettings(request, "config_error");
  }

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(STRAVA_OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: STRAVA_OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
