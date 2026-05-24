import { NextRequest, NextResponse } from "next/server";
import { saveStravaConnection } from "@/lib/db/stravaConnections";
import {
  exchangeStravaCodeForToken,
  hasRequiredStravaScopes,
} from "@/lib/strava/client";
import {
  isStravaOAuthConfigError,
  isSupabaseServiceRoleConfigError,
} from "@/lib/integrationConfig";
import {
  isValidStravaOAuthState,
  STRAVA_OAUTH_STATE_COOKIE_NAME,
} from "@/lib/strava/oauthState";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function redirectToSettings(request: NextRequest, status: string): NextResponse {
  const url = new URL("/settings", request.url);
  url.searchParams.set("strava", status);

  const response = NextResponse.redirect(url);
  response.cookies.set(STRAVA_OAUTH_STATE_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });

  return response;
}

export async function GET(request: NextRequest) {
  const callbackUrl = new URL(request.url);
  const error = callbackUrl.searchParams.get("error");
  const code = callbackUrl.searchParams.get("code");
  const state = callbackUrl.searchParams.get("state");
  const scope = callbackUrl.searchParams.get("scope") ?? "";
  const expectedState = request.cookies.get(STRAVA_OAUTH_STATE_COOKIE_NAME)?.value ?? null;

  if (!isValidStravaOAuthState(state, expectedState)) {
    return redirectToSettings(request, "state_error");
  }

  if (error) {
    return redirectToSettings(request, "denied");
  }

  if (!code) {
    return redirectToSettings(request, "missing_code");
  }

  if (!hasRequiredStravaScopes(scope)) {
    return redirectToSettings(request, "missing_scope");
  }

  const supabase = await createSupabaseServerClient();
  let user: Awaited<ReturnType<typeof requireServerUser>>;

  try {
    user = await requireServerUser(supabase);
  } catch (authError) {
    if (authError instanceof AuthRequiredError) {
      return redirectToSettings(request, "sign_in_required");
    }

    return redirectToSettings(request, "sign_in_required");
  }

  try {
    const tokenExchange = await exchangeStravaCodeForToken(code);

    // Strava tokens are private. Token writes use the server-only service role
    // after this route has verified the signed-in app user.
    await saveStravaConnection(createServiceRoleClient(), {
      userId: user.id,
      scope,
      accessToken: tokenExchange.accessToken,
      refreshToken: tokenExchange.refreshToken,
      tokenExpiresAt: tokenExchange.tokenExpiresAt,
      athlete: tokenExchange.athlete,
    });

    return redirectToSettings(request, "connected");
  } catch (error) {
    if (
      isStravaOAuthConfigError(error) ||
      isSupabaseServiceRoleConfigError(error)
    ) {
      return redirectToSettings(request, "config_error");
    }

    return redirectToSettings(request, "error");
  }
}
