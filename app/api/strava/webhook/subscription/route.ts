import { NextResponse } from "next/server";
import {
  createStravaWebhookSubscription,
  deleteStravaWebhookSubscription,
  getStravaWebhookSubscription,
  type StravaWebhookSubscriptionResult,
} from "@/lib/strava/webhookSubscriptions";
import { readDeleteStravaWebhookSubscriptionRequest } from "@/lib/strava/webhookSubscriptionRoute";
import { requireServerUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StravaWebhookSubscriptionResponse } from "@/types/strava";

export const dynamic = "force-dynamic";

function jsonResponse(
  response: StravaWebhookSubscriptionResponse,
  status: number,
): NextResponse<StravaWebhookSubscriptionResponse> {
  return NextResponse.json(response, { status });
}

function buildUnauthenticatedResponse(): StravaWebhookSubscriptionResponse {
  return {
    ok: false,
    authenticated: false,
    exists: false,
    subscriptionId: null,
    callbackUrl: null,
    message: "Sign in required to manage Strava webhook subscriptions.",
  };
}

function buildResponse(
  result: StravaWebhookSubscriptionResult,
): StravaWebhookSubscriptionResponse {
  return {
    ...result,
    authenticated: true,
  };
}

function getResultStatus(result: StravaWebhookSubscriptionResult): number {
  return result.ok ? 200 : 502;
}

async function requireSignedInUser(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireServerUser(supabase);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  if (!(await requireSignedInUser())) {
    return jsonResponse(buildUnauthenticatedResponse(), 401);
  }

  try {
    const result = await getStravaWebhookSubscription();

    return jsonResponse(buildResponse(result), getResultStatus(result));
  } catch {
    return jsonResponse(
      {
        ok: false,
        authenticated: true,
        exists: false,
        subscriptionId: null,
        callbackUrl: null,
        message: "Could not check Strava webhook subscription.",
      },
      500,
    );
  }
}

export async function POST() {
  if (!(await requireSignedInUser())) {
    return jsonResponse(buildUnauthenticatedResponse(), 401);
  }

  try {
    const result = await createStravaWebhookSubscription();

    return jsonResponse(buildResponse(result), getResultStatus(result));
  } catch {
    return jsonResponse(
      {
        ok: false,
        authenticated: true,
        exists: false,
        subscriptionId: null,
        callbackUrl: null,
        message: "Could not create Strava webhook subscription.",
      },
      500,
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await requireSignedInUser())) {
    return jsonResponse(buildUnauthenticatedResponse(), 401);
  }

  let deleteRequest;

  try {
    deleteRequest = await readDeleteStravaWebhookSubscriptionRequest(request);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        authenticated: true,
        exists: false,
        subscriptionId: null,
        callbackUrl: null,
        message:
          error instanceof Error
            ? error.message
            : "Invalid Strava webhook subscription delete request.",
      },
      400,
    );
  }

  try {
    const result = await deleteStravaWebhookSubscription(
      deleteRequest.subscriptionId,
    );

    return jsonResponse(buildResponse(result), getResultStatus(result));
  } catch {
    return jsonResponse(
      {
        ok: false,
        authenticated: true,
        exists: false,
        subscriptionId: null,
        callbackUrl: null,
        message: "Could not delete Strava webhook subscription.",
      },
      500,
    );
  }
}
