import { randomUUID } from "node:crypto";
import type { createServiceRoleClient } from "@/lib/supabase/serviceRole";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

export type StravaWebhookObjectType = "activity" | "athlete";
export type StravaWebhookAspectType = "create" | "update" | "delete";
export type StravaWebhookProcessingStatus = "pending" | "ignored";

export type ParsedStravaWebhookEvent = {
  objectType: StravaWebhookObjectType;
  objectId: number;
  aspectType: StravaWebhookAspectType;
  ownerId: number;
  eventTime: number;
  subscriptionId: number | null;
  updates: Record<string, unknown> | null;
  rawEvent: Record<string, unknown>;
};

export type StravaWebhookIntakeResult = {
  duplicate: boolean;
  eventId: string | null;
  processingStatus: StravaWebhookProcessingStatus;
  actionTaken: string | null;
  userId: string | null;
};

export type StravaWebhookVerificationResult =
  | {
      ok: true;
      challenge: string;
    }
  | {
      ok: false;
      status: 400 | 403;
      message: string;
    };

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type StravaConnectionUserRow = {
  user_id: string | null;
};

const acceptedObjectTypes = new Set<StravaWebhookObjectType>([
  "activity",
  "athlete",
]);
const acceptedAspectTypes = new Set<StravaWebhookAspectType>([
  "create",
  "update",
  "delete",
]);

export function verifyStravaWebhookSubscription(input: {
  mode: string | null;
  challenge: string | null;
  verifyToken: string | null;
  expectedVerifyToken: string;
}): StravaWebhookVerificationResult {
  if (!input.mode || !input.challenge || !input.verifyToken) {
    return {
      ok: false,
      status: 400,
      message:
        "Missing required query parameters: hub.mode, hub.challenge, and hub.verify_token.",
    };
  }

  if (
    input.mode !== "subscribe" ||
    input.verifyToken !== input.expectedVerifyToken
  ) {
    return {
      ok: false,
      status: 403,
      message: "Invalid Strava webhook verification request.",
    };
  }

  return {
    ok: true,
    challenge: input.challenge,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getRequiredText(
  payload: Record<string, unknown>,
  fieldName: string,
): string {
  const value = payload[fieldName];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required and must be a non-empty string.`);
  }

  return value.trim();
}

function getRequiredSafeInteger(
  payload: Record<string, unknown>,
  fieldName: string,
): number {
  const value = payload[fieldName];

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${fieldName} is required and must be a positive safe integer.`);
  }

  return value;
}

function getOptionalSafeInteger(
  payload: Record<string, unknown>,
  fieldName: string,
): number | null {
  const value = payload[fieldName];

  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${fieldName} must be a positive safe integer when provided.`);
  }

  return value;
}

function getOptionalUpdates(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  const value = payload.updates;

  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error("updates must be a JSON object when provided.");
  }

  return value;
}

function parseObjectType(value: string): StravaWebhookObjectType {
  if (!acceptedObjectTypes.has(value as StravaWebhookObjectType)) {
    throw new Error("object_type must be activity or athlete.");
  }

  return value as StravaWebhookObjectType;
}

function parseAspectType(value: string): StravaWebhookAspectType {
  if (!acceptedAspectTypes.has(value as StravaWebhookAspectType)) {
    throw new Error("aspect_type must be create, update, or delete.");
  }

  return value as StravaWebhookAspectType;
}

export function parseStravaWebhookEvent(
  payload: unknown,
): ParsedStravaWebhookEvent {
  if (!isRecord(payload)) {
    throw new Error("Strava webhook body must be a JSON object.");
  }

  return {
    objectType: parseObjectType(getRequiredText(payload, "object_type")),
    objectId: getRequiredSafeInteger(payload, "object_id"),
    aspectType: parseAspectType(getRequiredText(payload, "aspect_type")),
    ownerId: getRequiredSafeInteger(payload, "owner_id"),
    eventTime: getRequiredSafeInteger(payload, "event_time"),
    subscriptionId: getOptionalSafeInteger(payload, "subscription_id"),
    updates: getOptionalUpdates(payload),
    rawEvent: payload,
  };
}

export async function readStravaWebhookEventFromRequest(
  request: Pick<Request, "text">,
): Promise<ParsedStravaWebhookEvent> {
  let body: unknown;

  try {
    body = JSON.parse(await request.text()) as unknown;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }

  return parseStravaWebhookEvent(body);
}

export function getWebhookIntakeDecision(event: ParsedStravaWebhookEvent): {
  processingStatus: StravaWebhookProcessingStatus;
  actionTaken: string | null;
} {
  if (event.objectType === "activity" && event.aspectType === "create") {
    return {
      processingStatus: "pending",
      actionTaken: null,
    };
  }

  return {
    processingStatus: "ignored",
    actionTaken: `ignored_${event.objectType}_${event.aspectType}`,
  };
}

async function findUserIdForStravaOwner(
  supabase: Pick<ServiceRoleClient, "from">,
  ownerId: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("strava_connections")
    .select("user_id")
    .eq("strava_athlete_id", String(ownerId))
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const row = data as StravaConnectionUserRow | null;

  return row?.user_id ?? null;
}

function isDuplicateWebhookEventError(error: SupabaseErrorLike): boolean {
  return error.code === "23505";
}

export async function storeStravaWebhookEvent(input: {
  supabase: Pick<ServiceRoleClient, "from">;
  event: ParsedStravaWebhookEvent;
}): Promise<StravaWebhookIntakeResult> {
  const userId = await findUserIdForStravaOwner(
    input.supabase,
    input.event.ownerId,
  );
  const eventId = randomUUID();
  const decision = getWebhookIntakeDecision(input.event);
  const { error } = await input.supabase
    .from("strava_webhook_events")
    .insert({
      id: eventId,
      user_id: userId,
      owner_id: input.event.ownerId,
      object_type: input.event.objectType,
      object_id: input.event.objectId,
      aspect_type: input.event.aspectType,
      event_time: input.event.eventTime,
      subscription_id: input.event.subscriptionId,
      updates: input.event.updates,
      raw_event: input.event.rawEvent,
      processing_status: decision.processingStatus,
      action_taken: decision.actionTaken,
    });

  if (error) {
    if (isDuplicateWebhookEventError(error)) {
      return {
        duplicate: true,
        eventId: null,
        processingStatus: decision.processingStatus,
        actionTaken: decision.actionTaken,
        userId,
      };
    }

    throw new Error(error.message ?? "Could not store Strava webhook event.");
  }

  return {
    duplicate: false,
    eventId,
    processingStatus: decision.processingStatus,
    actionTaken: decision.actionTaken,
    userId,
  };
}
