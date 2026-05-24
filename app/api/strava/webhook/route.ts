import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import {
  getSupabaseServiceRoleConfigMessage,
  isSupabaseServiceRoleConfigError,
} from "@/lib/integrationConfig";
import {
  buildStravaWebhookErrorResponse,
  handleStravaWebhookGet,
  handleStravaWebhookPost,
} from "@/lib/strava/webhookRoute";

export const dynamic = "force-dynamic";

function getWebhookVerifyToken(): string {
  const token = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN?.trim();

  if (!token) {
    throw new Error("Missing STRAVA_WEBHOOK_VERIFY_TOKEN server environment variable.");
  }

  return token;
}

export async function GET(request: Request) {
  let expectedToken: string;

  try {
    expectedToken = getWebhookVerifyToken();
  } catch {
    return buildStravaWebhookErrorResponse(
      "Strava webhook verification is not configured.",
      503,
    );
  }

  return handleStravaWebhookGet(request, expectedToken);
}

export async function POST(request: Request) {
  // Strava webhook calls do not include this app's Supabase session cookie, so
  // intake and inline processing must use the server-only service role client.
  try {
    return handleStravaWebhookPost(request, createServiceRoleClient());
  } catch (error) {
    return buildStravaWebhookErrorResponse(
      isSupabaseServiceRoleConfigError(error)
        ? getSupabaseServiceRoleConfigMessage(error)
        : "Strava webhook intake is not available.",
      isSupabaseServiceRoleConfigError(error) ? 503 : 500,
    );
  }
}
