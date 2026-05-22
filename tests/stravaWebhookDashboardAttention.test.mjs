import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDisconnectedWebhookDashboardAttentionResponse,
  buildStravaWebhookDashboardAttentionItems,
  buildUnauthenticatedWebhookDashboardAttentionResponse,
  buildWebhookDashboardAttentionResponse,
  fetchStravaWebhookDashboardAttentionData,
} from "../lib/strava/webhookDashboardAttention.ts";

function attentionEvent(overrides = {}) {
  return {
    id: overrides.id ?? "event-1",
    received_at: overrides.received_at ?? "2026-05-20T12:00:00.000Z",
    object_type: overrides.object_type ?? "activity",
    object_id: overrides.object_id ?? 123456789,
    aspect_type: overrides.aspect_type ?? "delete",
    action_taken:
      overrides.action_taken ?? "marked_deleted_attention_needed",
  };
}

function createThenableQuery(result, calls) {
  const query = {
    select(columns, options) {
      calls.push({ method: "select", columns, options });
      return query;
    },
    eq(column, value) {
      calls.push({ method: "eq", column, value });
      return query;
    },
    in(column, values) {
      calls.push({ method: "in", column, values });
      return query;
    },
    order(column, options) {
      calls.push({ method: "order", column, options });
      return query;
    },
    limit(value) {
      calls.push({ method: "limit", value });
      return query;
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };

  return query;
}

function createMockSupabase(results) {
  const calls = [];
  const queuedResults = [...results];

  return {
    calls,
    supabase: {
      from(table) {
        calls.push({ method: "from", table });

        const result = queuedResults.shift();

        if (!result) {
          throw new Error("No mock Supabase result was queued.");
        }

        return createThenableQuery(result, calls);
      },
    },
  };
}

describe("Strava webhook dashboard attention helpers", () => {
  it("returns no warnings when Strava is not connected", () => {
    const items = buildStravaWebhookDashboardAttentionItems({
      stravaConnected: false,
      subscriptionExists: false,
      pendingEvents: 3,
      failedEvents: 2,
      attentionEvents: [attentionEvent()],
      todayDateText: "2026-05-20",
    });

    assert.deepEqual(items, []);
  });

  it("warns when a connected Strava account has no webhook subscription", () => {
    const items = buildStravaWebhookDashboardAttentionItems({
      stravaConnected: true,
      subscriptionExists: false,
      pendingEvents: 0,
      failedEvents: 0,
      attentionEvents: [],
      todayDateText: "2026-05-20",
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].type, "strava_webhook");
    assert.equal(items[0].href, "/settings");
    assert.equal(
      items[0].message,
      "Go to Settings to create webhook subscription.",
    );
  });

  it("warns when pending and failed webhook events exist", () => {
    const items = buildStravaWebhookDashboardAttentionItems({
      stravaConnected: true,
      subscriptionExists: true,
      pendingEvents: 2,
      failedEvents: 1,
      attentionEvents: [],
      todayDateText: "2026-05-20",
    });

    assert.deepEqual(
      items.map((item) => item.id),
      ["strava-webhook-pending-events", "strava-webhook-failed-events"],
    );
    assert.match(items[0].message, /Process pending webhook events/);
    assert.match(items[1].message, /Review failed webhook event/);
  });

  it("warns for Strava delete and deauthorization attention events", () => {
    const items = buildStravaWebhookDashboardAttentionItems({
      stravaConnected: true,
      subscriptionExists: true,
      pendingEvents: 0,
      failedEvents: 0,
      attentionEvents: [
        attentionEvent({
          id: "delete-event",
          object_id: 123456789,
          action_taken: "marked_deleted_attention_needed",
        }),
        attentionEvent({
          id: "deauth-event",
          object_type: "athlete",
          object_id: 987654321,
          aspect_type: "update",
          action_taken: "marked_connection_revoked",
        }),
      ],
      todayDateText: "2026-05-20",
    });

    assert.equal(items.length, 2);
    assert.match(items[0].message, /Review deleted Strava activity manually/);
    assert.equal(items[1].message, "Reconnect Strava.");
  });

  it("stays quiet when webhook state is healthy", () => {
    const items = buildStravaWebhookDashboardAttentionItems({
      stravaConnected: true,
      subscriptionExists: true,
      pendingEvents: 0,
      failedEvents: 0,
      attentionEvents: [],
      todayDateText: "2026-05-20",
    });

    assert.deepEqual(items, []);
  });

  it("stays quiet when subscription status is unknown and there are no action items", () => {
    const items = buildStravaWebhookDashboardAttentionItems({
      stravaConnected: true,
      subscriptionExists: null,
      pendingEvents: 0,
      failedEvents: 0,
      attentionEvents: [],
      todayDateText: "2026-05-20",
    });

    assert.deepEqual(items, []);
  });

  it("builds safe disconnected and unauthenticated responses", () => {
    assert.deepEqual(buildDisconnectedWebhookDashboardAttentionResponse(), {
      ok: true,
      authenticated: true,
      connected: false,
      message: "Strava is not connected.",
      attentionItems: [],
    });
    assert.deepEqual(buildUnauthenticatedWebhookDashboardAttentionResponse(), {
      ok: false,
      authenticated: false,
      connected: false,
      message: "Sign in required to view Strava webhook attention warnings.",
      attentionItems: [],
    });
  });

  it("builds a safe connected response from attention data", () => {
    const response = buildWebhookDashboardAttentionResponse({
      subscriptionExists: false,
      attentionData: {
        pendingEvents: 1,
        failedEvents: 0,
        attentionEvents: [],
      },
      todayDateText: "2026-05-20",
    });
    const serialized = JSON.stringify(response);

    assert.equal(response.ok, true);
    assert.equal(response.connected, true);
    assert.deepEqual(
      response.attentionItems.map((item) => item.id),
      [
        "strava-webhook-subscription-missing",
        "strava-webhook-pending-events",
      ],
    );
    assert.doesNotMatch(serialized, /raw_event/);
    assert.doesNotMatch(serialized, /updates/);
    assert.doesNotMatch(serialized, /import_summary/);
  });

  it("queries warning-worthy webhook rows for the current user and owner", async () => {
    const mock = createMockSupabase([
      {
        count: 2,
        error: null,
      },
      {
        count: 1,
        error: null,
      },
      {
        data: [attentionEvent()],
        error: null,
      },
    ]);

    const result = await fetchStravaWebhookDashboardAttentionData({
      supabase: mock.supabase,
      userId: "user-1",
      ownerId: "987654321",
    });
    const eqCalls = mock.calls.filter((call) => call.method === "eq");
    const inCall = mock.calls.find((call) => call.method === "in");

    assert.equal(result.pendingEvents, 2);
    assert.equal(result.failedEvents, 1);
    assert.equal(result.attentionEvents.length, 1);
    assert.equal(
      eqCalls.filter(
        (call) => call.column === "user_id" && call.value === "user-1",
      ).length,
      3,
    );
    assert.equal(
      eqCalls.filter(
        (call) => call.column === "owner_id" && call.value === "987654321",
      ).length,
      3,
    );
    assert.deepEqual(inCall.values, [
      "marked_deleted_attention_needed",
      "marked_connection_revoked",
    ]);
  });
});
