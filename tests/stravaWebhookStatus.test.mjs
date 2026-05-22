import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDisconnectedWebhookStatusResponse,
  buildUnauthenticatedWebhookStatusResponse,
  buildWebhookStatusResponse,
  fetchStravaWebhookStatusForUser,
  mapStravaWebhookStatusRow,
  shortenWebhookError,
} from "../lib/strava/webhookStatus.ts";

function webhookStatusRow(overrides = {}) {
  return {
    id: "event-1",
    received_at: "2026-05-20T12:00:00.000Z",
    object_type: "activity",
    object_id: 123456789,
    aspect_type: "create",
    processing_status: "pending",
    action_taken: null,
    last_error: null,
    raw_event: {
      secret_like: "do-not-return",
    },
    updates: {
      title: "Do not return raw updates",
    },
    import_summary: {
      raw: "Do not return import summary",
    },
    ...overrides,
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

describe("Strava webhook status helpers", () => {
  it("maps database rows to safe recent event display rows", () => {
    const mapped = mapStravaWebhookStatusRow(
      webhookStatusRow({
        processing_status: "failed",
        action_taken: "failed_processing",
        last_error: "Database insert failed.",
      }),
    );
    const serialized = JSON.stringify(mapped);

    assert.deepEqual(mapped, {
      id: "event-1",
      receivedAt: "2026-05-20T12:00:00.000Z",
      eventType: "activity/create",
      objectId: "123456789",
      processingStatus: "failed",
      actionTaken: "failed_processing",
      shortError: "Database insert failed.",
    });
    assert.doesNotMatch(serialized, /raw_event/);
    assert.doesNotMatch(serialized, /updates/);
    assert.doesNotMatch(serialized, /import_summary/);
    assert.doesNotMatch(serialized, /do-not-return/);
  });

  it("counts pending and failed rows and shortens failed errors", () => {
    const longError = `Failed ${"because ".repeat(40)}`;
    const response = buildWebhookStatusResponse({
      pendingEvents: 2,
      failedEvents: 1,
      recentEventRows: [
        webhookStatusRow(),
        webhookStatusRow({
          id: "failed-event",
          processing_status: "failed",
          action_taken: "failed_processing",
          last_error: longError,
        }),
      ],
    });

    assert.equal(response.pendingEvents, 2);
    assert.equal(response.failedEvents, 1);
    assert.equal(response.recentEvents.length, 2);
    assert.ok(response.recentEvents[1].shortError.length <= 120);
    assert.match(response.recentEvents[1].shortError, /\.\.\.$/);
  });

  it("builds safe unauthenticated and disconnected responses", () => {
    assert.deepEqual(buildUnauthenticatedWebhookStatusResponse(), {
      ok: false,
      authenticated: false,
      connected: false,
      message: "Sign in required to view Strava webhook status.",
      pendingEvents: 0,
      failedEvents: 0,
      recentEvents: [],
    });
    assert.deepEqual(buildDisconnectedWebhookStatusResponse(), {
      ok: true,
      authenticated: true,
      connected: false,
      message: "Connect Strava before viewing webhook events.",
      pendingEvents: 0,
      failedEvents: 0,
      recentEvents: [],
    });
  });

  it("queries webhook events for the current user and Strava athlete only", async () => {
    const mock = createMockSupabase([
      {
        data: [webhookStatusRow()],
        error: null,
      },
      {
        count: 1,
        error: null,
      },
      {
        count: 0,
        error: null,
      },
    ]);

    const response = await fetchStravaWebhookStatusForUser({
      supabase: mock.supabase,
      userId: "user-1",
      ownerId: "987654321",
    });
    const eqCalls = mock.calls.filter((call) => call.method === "eq");

    assert.equal(response.connected, true);
    assert.equal(response.pendingEvents, 1);
    assert.equal(response.failedEvents, 0);
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
  });

  it("normalizes empty and short webhook errors", () => {
    assert.equal(shortenWebhookError(null), null);
    assert.equal(shortenWebhookError("   "), null);
    assert.equal(shortenWebhookError("Small error"), "Small error");
    assert.equal(
      shortenWebhookError("Line one\nline two"),
      "Line one line two",
    );
  });
});
