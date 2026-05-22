import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  StravaWebhookProcessingStatus,
  StravaWebhookRecentEvent,
  StravaWebhookStatusResponse,
} from "@/types/strava";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;
type WebhookStatusSupabaseClient = Pick<SupabaseServerClient, "from">;

export type StravaWebhookStatusRow = {
  id: string;
  received_at: string;
  object_type: string;
  object_id: string | number;
  aspect_type: string;
  processing_status: StravaWebhookProcessingStatus;
  action_taken: string | null;
  last_error: string | null;
};

const WEBHOOK_STATUS_COLUMNS =
  "id,received_at,object_type,object_id,aspect_type,processing_status,action_taken,last_error";
const RECENT_EVENT_LIMIT = 10;
const MAX_ERROR_LENGTH = 120;

export function shortenWebhookError(error: string | null): string | null {
  if (!error?.trim()) {
    return null;
  }

  const normalized = error.trim().replace(/\s+/g, " ");

  if (normalized.length <= MAX_ERROR_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_ERROR_LENGTH - 3)}...`;
}

export function mapStravaWebhookStatusRow(
  row: StravaWebhookStatusRow,
): StravaWebhookRecentEvent {
  return {
    id: row.id,
    receivedAt: row.received_at,
    eventType: `${row.object_type}/${row.aspect_type}`,
    objectId: String(row.object_id),
    processingStatus: row.processing_status,
    actionTaken: row.action_taken,
    shortError:
      row.processing_status === "failed"
        ? shortenWebhookError(row.last_error)
        : null,
  };
}

export function buildUnauthenticatedWebhookStatusResponse(): StravaWebhookStatusResponse {
  return {
    ok: false,
    authenticated: false,
    connected: false,
    message: "Sign in required to view Strava webhook status.",
    pendingEvents: 0,
    failedEvents: 0,
    recentEvents: [],
  };
}

export function buildDisconnectedWebhookStatusResponse(): StravaWebhookStatusResponse {
  return {
    ok: true,
    authenticated: true,
    connected: false,
    message: "Connect Strava before viewing webhook events.",
    pendingEvents: 0,
    failedEvents: 0,
    recentEvents: [],
  };
}

export function buildWebhookStatusResponse(input: {
  pendingEvents: number | null;
  failedEvents: number | null;
  recentEventRows: StravaWebhookStatusRow[];
}): StravaWebhookStatusResponse {
  return {
    ok: true,
    authenticated: true,
    connected: true,
    message: "Strava webhook status loaded.",
    pendingEvents: input.pendingEvents ?? 0,
    failedEvents: input.failedEvents ?? 0,
    recentEvents: input.recentEventRows.map(mapStravaWebhookStatusRow),
  };
}

export async function fetchStravaWebhookStatusForUser(input: {
  supabase: WebhookStatusSupabaseClient;
  userId: string;
  ownerId: string;
}): Promise<StravaWebhookStatusResponse> {
  const ownerId = input.ownerId.trim();

  const recentEventsQuery = input.supabase
    .from("strava_webhook_events")
    .select(WEBHOOK_STATUS_COLUMNS)
    .eq("user_id", input.userId)
    .eq("owner_id", ownerId)
    .order("received_at", { ascending: false })
    .limit(RECENT_EVENT_LIMIT);
  const pendingCountQuery = input.supabase
    .from("strava_webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("owner_id", ownerId)
    .eq("processing_status", "pending");
  const failedCountQuery = input.supabase
    .from("strava_webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("owner_id", ownerId)
    .eq("processing_status", "failed");

  const [recentEventsResult, pendingCountResult, failedCountResult] =
    await Promise.all([
      recentEventsQuery,
      pendingCountQuery,
      failedCountQuery,
    ]);

  if (recentEventsResult.error) {
    throw new Error(recentEventsResult.error.message);
  }

  if (pendingCountResult.error) {
    throw new Error(pendingCountResult.error.message);
  }

  if (failedCountResult.error) {
    throw new Error(failedCountResult.error.message);
  }

  return buildWebhookStatusResponse({
    pendingEvents: pendingCountResult.count ?? 0,
    failedEvents: failedCountResult.count ?? 0,
    recentEventRows: (recentEventsResult.data ?? []) as StravaWebhookStatusRow[],
  });
}
