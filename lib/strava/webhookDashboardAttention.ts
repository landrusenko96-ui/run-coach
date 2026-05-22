import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DashboardAttentionItem } from "../training/dashboardWeek.ts";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;
type WebhookDashboardAttentionSupabaseClient = Pick<SupabaseServerClient, "from">;

export type StravaWebhookDashboardAttentionEventRow = {
  id: string;
  received_at: string;
  object_type: string;
  object_id: string | number;
  aspect_type: string;
  action_taken: string | null;
};

export type StravaWebhookDashboardAttentionData = {
  pendingEvents: number;
  failedEvents: number;
  attentionEvents: StravaWebhookDashboardAttentionEventRow[];
};

export type StravaWebhookDashboardAttentionResponse = {
  ok: boolean;
  authenticated: boolean;
  connected: boolean;
  message: string;
  attentionItems: DashboardAttentionItem[];
};

const WEBHOOK_DASHBOARD_ATTENTION_COLUMNS =
  "id,received_at,object_type,object_id,aspect_type,action_taken";
const ATTENTION_ACTIONS = [
  "marked_deleted_attention_needed",
  "marked_connection_revoked",
];

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function getEventDateText(
  event: StravaWebhookDashboardAttentionEventRow,
  fallbackDateText: string,
): string {
  const dateText = event.received_at.slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? dateText : fallbackDateText;
}

function buildWebhookAttentionItem(input: {
  id: string;
  title: string;
  message: string;
  dateText: string;
  todayDateText: string;
}): DashboardAttentionItem {
  return {
    id: input.id,
    type: "strava_webhook",
    workoutDate: input.dateText,
    title: input.title,
    message: input.message,
    href: "/settings",
    isTodayOrFuture: input.dateText >= input.todayDateText,
  };
}

export function buildStravaWebhookDashboardAttentionItems(input: {
  stravaConnected: boolean;
  subscriptionExists: boolean | null;
  pendingEvents: number;
  failedEvents: number;
  attentionEvents: StravaWebhookDashboardAttentionEventRow[];
  todayDateText: string;
}): DashboardAttentionItem[] {
  if (!input.stravaConnected) {
    return [];
  }

  const attentionItems: DashboardAttentionItem[] = [];

  if (input.subscriptionExists === false) {
    attentionItems.push(
      buildWebhookAttentionItem({
        id: "strava-webhook-subscription-missing",
        title: "Strava webhook subscription missing",
        message: "Go to Settings to create webhook subscription.",
        dateText: input.todayDateText,
        todayDateText: input.todayDateText,
      }),
    );
  }

  if (input.pendingEvents > 0) {
    attentionItems.push(
      buildWebhookAttentionItem({
        id: "strava-webhook-pending-events",
        title: "Strava webhook events pending",
        message: `${input.pendingEvents} ${pluralize(
          input.pendingEvents,
          "event is",
          "events are",
        )} waiting. Process pending webhook events.`,
        dateText: input.todayDateText,
        todayDateText: input.todayDateText,
      }),
    );
  }

  if (input.failedEvents > 0) {
    attentionItems.push(
      buildWebhookAttentionItem({
        id: "strava-webhook-failed-events",
        title: "Strava webhook event failed",
        message: `${input.failedEvents} ${pluralize(
          input.failedEvents,
          "event needs",
          "events need",
        )} review. Review failed webhook event.`,
        dateText: input.todayDateText,
        todayDateText: input.todayDateText,
      }),
    );
  }

  for (const event of input.attentionEvents) {
    const dateText = getEventDateText(event, input.todayDateText);

    if (event.action_taken === "marked_deleted_attention_needed") {
      attentionItems.push(
        buildWebhookAttentionItem({
          id: `strava-webhook-deleted-${event.id}`,
          title: "Deleted Strava activity needs review",
          message: `Activity ${event.object_id}: Review deleted Strava activity manually.`,
          dateText,
          todayDateText: input.todayDateText,
        }),
      );
      continue;
    }

    if (event.action_taken === "marked_connection_revoked") {
      attentionItems.push(
        buildWebhookAttentionItem({
          id: `strava-webhook-revoked-${event.id}`,
          title: "Strava connection was revoked",
          message: "Reconnect Strava.",
          dateText,
          todayDateText: input.todayDateText,
        }),
      );
    }
  }

  return attentionItems;
}

export function buildUnauthenticatedWebhookDashboardAttentionResponse(): StravaWebhookDashboardAttentionResponse {
  return {
    ok: false,
    authenticated: false,
    connected: false,
    message: "Sign in required to view Strava webhook attention warnings.",
    attentionItems: [],
  };
}

export function buildDisconnectedWebhookDashboardAttentionResponse(): StravaWebhookDashboardAttentionResponse {
  return {
    ok: true,
    authenticated: true,
    connected: false,
    message: "Strava is not connected.",
    attentionItems: [],
  };
}

export function buildWebhookDashboardAttentionResponse(input: {
  subscriptionExists: boolean | null;
  attentionData: StravaWebhookDashboardAttentionData;
  todayDateText: string;
}): StravaWebhookDashboardAttentionResponse {
  return {
    ok: true,
    authenticated: true,
    connected: true,
    message: "Strava webhook dashboard attention loaded.",
    attentionItems: buildStravaWebhookDashboardAttentionItems({
      stravaConnected: true,
      subscriptionExists: input.subscriptionExists,
      pendingEvents: input.attentionData.pendingEvents,
      failedEvents: input.attentionData.failedEvents,
      attentionEvents: input.attentionData.attentionEvents,
      todayDateText: input.todayDateText,
    }),
  };
}

export async function fetchStravaWebhookDashboardAttentionData(input: {
  supabase: WebhookDashboardAttentionSupabaseClient;
  userId: string;
  ownerId: string;
}): Promise<StravaWebhookDashboardAttentionData> {
  const ownerId = input.ownerId.trim();

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
  const attentionEventsQuery = input.supabase
    .from("strava_webhook_events")
    .select(WEBHOOK_DASHBOARD_ATTENTION_COLUMNS)
    .eq("user_id", input.userId)
    .eq("owner_id", ownerId)
    .in("action_taken", ATTENTION_ACTIONS)
    .order("received_at", { ascending: false })
    .limit(5);

  const [pendingCountResult, failedCountResult, attentionEventsResult] =
    await Promise.all([
      pendingCountQuery,
      failedCountQuery,
      attentionEventsQuery,
    ]);

  if (pendingCountResult.error) {
    throw new Error(pendingCountResult.error.message);
  }

  if (failedCountResult.error) {
    throw new Error(failedCountResult.error.message);
  }

  if (attentionEventsResult.error) {
    throw new Error(attentionEventsResult.error.message);
  }

  return {
    pendingEvents: pendingCountResult.count ?? 0,
    failedEvents: failedCountResult.count ?? 0,
    attentionEvents:
      (attentionEventsResult.data ?? []) as StravaWebhookDashboardAttentionEventRow[],
  };
}
