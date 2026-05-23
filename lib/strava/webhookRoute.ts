import {
  readStravaWebhookEventFromRequest,
  storeStravaWebhookEvent,
  verifyStravaWebhookSubscription,
  type StravaWebhookIntakeResult,
} from "./webhookEvents.ts";
import { processSingleStravaWebhookEvent } from "./webhookProcessing.ts";

type WebhookEventSupabaseClient = Parameters<
  typeof storeStravaWebhookEvent
>[0]["supabase"] &
  NonNullable<
    NonNullable<Parameters<typeof processSingleStravaWebhookEvent>[1]>["supabase"]
  >;

type WebhookErrorResponse = {
  ok: false;
  message: string;
};

type WebhookSuccessResponse = {
  ok: true;
  message: string;
  duplicate: boolean;
  processingStatus: StravaWebhookIntakeResult["processingStatus"];
};

type WebhookPostOptions = {
  processSingleEvent?: typeof processSingleStravaWebhookEvent;
};

function jsonResponse<T>(body: T, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function buildStravaWebhookErrorResponse(
  message: string,
  status: number,
): Response {
  return jsonResponse<WebhookErrorResponse>(
    {
      ok: false,
      message,
    },
    status,
  );
}

export function handleStravaWebhookGet(
  request: Request,
  expectedVerifyToken: string,
): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const verification = verifyStravaWebhookSubscription({
    mode,
    challenge,
    verifyToken,
    expectedVerifyToken,
  });

  if (!verification.ok) {
    return buildStravaWebhookErrorResponse(
      verification.message,
      verification.status,
    );
  }

  return jsonResponse({ "hub.challenge": verification.challenge }, 200);
}

export async function handleStravaWebhookPost(
  request: Request,
  supabase: WebhookEventSupabaseClient,
  options: WebhookPostOptions = {},
): Promise<Response> {
  let event;

  try {
    event = await readStravaWebhookEventFromRequest(request);
  } catch (error) {
    return buildStravaWebhookErrorResponse(
      error instanceof Error
        ? error.message
        : "Invalid Strava webhook event.",
      400,
    );
  }

  let result: StravaWebhookIntakeResult;

  try {
    result = await storeStravaWebhookEvent({
      supabase,
      event,
    });
  } catch {
    return buildStravaWebhookErrorResponse(
      "Could not store Strava webhook event.",
      500,
    );
  }

  if (!result.duplicate && result.eventId) {
    try {
      await (options.processSingleEvent ?? processSingleStravaWebhookEvent)(
        result.eventId,
        { supabase },
      );
    } catch {
      // The event has been safely stored. A processing crash should not make
      // Strava retry the webhook forever; the Settings recovery button can retry it.
    }
  }

  const response: WebhookSuccessResponse = {
    ok: true,
    message: result.duplicate
      ? "Strava webhook event was already received."
      : "Strava webhook event received.",
    duplicate: result.duplicate,
    processingStatus: result.processingStatus,
  };

  return jsonResponse(response, 200);
}
