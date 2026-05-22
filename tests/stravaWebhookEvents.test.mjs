import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getWebhookIntakeDecision,
  parseStravaWebhookEvent,
  readStravaWebhookEventFromRequest,
  storeStravaWebhookEvent,
  verifyStravaWebhookSubscription,
} from "../lib/strava/webhookEvents.ts";
import {
  handleStravaWebhookGet,
  handleStravaWebhookPost,
} from "../lib/strava/webhookRoute.ts";

function jsonRequest(body) {
  return new Request("http://localhost:3000/api/strava/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function validWebhookPayload(overrides = {}) {
  return {
    object_type: "activity",
    object_id: 123456789,
    aspect_type: "create",
    owner_id: 987654321,
    event_time: 1770000000,
    subscription_id: 555,
    updates: {},
    ...overrides,
  };
}

function processedResult(eventId, overrides = {}) {
  return {
    eventId,
    ok: true,
    processingStatus: "processed",
    actionTaken: "imported",
    message: "Processed.",
    ...overrides,
  };
}

function webhookGetRequest(params) {
  const url = new URL("http://localhost:3000/api/strava/webhook");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return new Request(url);
}

function buildWebhookDedupeKey(row) {
  return [
    row.owner_id,
    row.object_type,
    row.object_id,
    row.aspect_type,
    row.event_time,
  ].join(":");
}

function createFakeSupabase({
  userId = "user-1",
  connectionError = null,
  insertError = null,
  enforceWebhookDedupe = false,
} = {}) {
  const calls = [];
  const webhookRows = [];
  const webhookDedupeKeys = new Set();
  const supabase = {
    from(table) {
      if (table === "strava_connections") {
        return {
          select(columns) {
            calls.push({ table, operation: "select", columns });

            return {
              eq(column, value) {
                calls.push({ table, operation: "eq", column, value });

                return {
                  maybeSingle: async () => {
                    if (connectionError) {
                      return { data: null, error: connectionError };
                    }

                    return {
                      data: userId ? { user_id: userId } : null,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "strava_webhook_events") {
        return {
          insert: async (row) => {
            calls.push({ table, operation: "insert", row });

            if (insertError) {
              return { error: insertError };
            }

            if (enforceWebhookDedupe) {
              const dedupeKey = buildWebhookDedupeKey(row);

              if (webhookDedupeKeys.has(dedupeKey)) {
                return {
                  error: {
                    code: "23505",
                    message: "duplicate key value violates unique constraint",
                  },
                };
              }

              webhookDedupeKeys.add(dedupeKey);
            }

            webhookRows.push(row);

            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table ${table}.`);
    },
  };

  return { calls, supabase, webhookRows };
}

describe("Strava webhook route verification", () => {
  it("route GET returns the Strava challenge for a valid verify token", async () => {
    const response = handleStravaWebhookGet(
      webhookGetRequest({
        "hub.mode": "subscribe",
        "hub.challenge": "challenge-123",
        "hub.verify_token": "verify-token",
      }),
      "verify-token",
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      "hub.challenge": "challenge-123",
    });
  });

  it("route GET returns 403 for an invalid verify token", async () => {
    const response = handleStravaWebhookGet(
      webhookGetRequest({
        "hub.mode": "subscribe",
        "hub.challenge": "challenge-123",
        "hub.verify_token": "wrong-token",
      }),
      "verify-token",
    );
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.ok, false);
    assert.match(body.message, /Invalid Strava webhook verification request/);
  });

  it("returns the Strava challenge for a valid subscription check", () => {
    const result = verifyStravaWebhookSubscription({
      mode: "subscribe",
      challenge: "challenge-123",
      verifyToken: "verify-token",
      expectedVerifyToken: "verify-token",
    });

    assert.deepEqual(result, {
      ok: true,
      challenge: "challenge-123",
    });
  });

  it("returns a clear error when verification params are missing", () => {
    const result = verifyStravaWebhookSubscription({
      mode: "subscribe",
      challenge: null,
      verifyToken: null,
      expectedVerifyToken: "verify-token",
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.message, /Missing required query parameters/);
  });

  it("rejects an incorrect verify token", () => {
    const result = verifyStravaWebhookSubscription({
      mode: "subscribe",
      challenge: "challenge-123",
      verifyToken: "wrong-token",
      expectedVerifyToken: "verify-token",
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
    assert.match(result.message, /Invalid Strava webhook verification request/);
  });
});

describe("Strava webhook POST route validation", () => {
  it("route POST rejects invalid object_type with a safe 400 response", async () => {
    const { supabase, webhookRows } = createFakeSupabase();
    const response = await handleStravaWebhookPost(
      jsonRequest(validWebhookPayload({ object_type: "route" })),
      supabase,
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.match(body.message, /object_type must be activity or athlete/);
    assert.equal(webhookRows.length, 0);
  });

  it("route POST rejects invalid aspect_type with a safe 400 response", async () => {
    const { supabase, webhookRows } = createFakeSupabase();
    const response = await handleStravaWebhookPost(
      jsonRequest(validWebhookPayload({ aspect_type: "sync" })),
      supabase,
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.match(body.message, /aspect_type must be create, update, or delete/);
    assert.equal(webhookRows.length, 0);
  });

  it("rejects invalid JSON before any database work", async () => {
    await assert.rejects(
      () =>
        readStravaWebhookEventFromRequest(
          new Request("http://localhost:3000/api/strava/webhook", {
            method: "POST",
            body: "not json",
          }),
        ),
      /Request body must be valid JSON/,
    );
  });

  it("rejects missing required webhook fields before any database work", async () => {
    await assert.rejects(
      () =>
        readStravaWebhookEventFromRequest(
          jsonRequest({ object_type: "activity" }),
        ),
      /object_id is required/,
    );
  });

  it("rejects unsupported webhook object or aspect types", () => {
    assert.throws(
      () => parseStravaWebhookEvent(validWebhookPayload({ object_type: "route" })),
      /object_type must be activity or athlete/,
    );
    assert.throws(
      () => parseStravaWebhookEvent(validWebhookPayload({ aspect_type: "sync" })),
      /aspect_type must be create, update, or delete/,
    );
  });
});

describe("Strava webhook event intake helpers", () => {
  it("route POST stores a valid activity create webhook event and triggers processing", async () => {
    const { supabase, webhookRows } = createFakeSupabase({
      userId: "matched-user",
    });
    const processingCalls = [];
    const response = await handleStravaWebhookPost(
      jsonRequest(validWebhookPayload()),
      supabase,
      {
        processSingleEvent: async (eventId, options) => {
          processingCalls.push({ eventId, options });

          return processedResult(eventId);
        },
      },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.duplicate, false);
    assert.equal(body.processingStatus, "pending");
    assert.equal(webhookRows.length, 1);
    assert.equal(webhookRows[0].user_id, "matched-user");
    assert.equal(webhookRows[0].processing_status, "pending");
    assert.equal(webhookRows[0].action_taken, null);
    assert.equal(processingCalls.length, 1);
    assert.equal(processingCalls[0].eventId, webhookRows[0].id);
    assert.equal(processingCalls[0].options.supabase, supabase);
  });

  it("route POST treats duplicate webhook delivery as success without a duplicate stored row or reprocessing", async () => {
    const { supabase, webhookRows } = createFakeSupabase({
      enforceWebhookDedupe: true,
    });
    const processingCalls = [];
    const options = {
      processSingleEvent: async (eventId) => {
        processingCalls.push(eventId);

        return processedResult(eventId);
      },
    };
    const firstResponse = await handleStravaWebhookPost(
      jsonRequest(validWebhookPayload()),
      supabase,
      options,
    );
    const secondResponse = await handleStravaWebhookPost(
      jsonRequest(validWebhookPayload()),
      supabase,
      options,
    );
    const firstBody = await firstResponse.json();
    const secondBody = await secondResponse.json();

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.equal(firstBody.duplicate, false);
    assert.equal(secondBody.duplicate, true);
    assert.equal(webhookRows.length, 1);
    assert.deepEqual(processingCalls, [webhookRows[0].id]);
  });

  it("route POST still returns 200 when automatic processing reports failure", async () => {
    const { supabase, webhookRows } = createFakeSupabase();
    const processingCalls = [];
    const response = await handleStravaWebhookPost(
      jsonRequest(validWebhookPayload()),
      supabase,
      {
        processSingleEvent: async (eventId) => {
          processingCalls.push(eventId);

          return processedResult(eventId, {
            ok: false,
            processingStatus: "failed",
            actionTaken: "failed_processing",
            message: "Database insert failed.",
          });
        },
      },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.duplicate, false);
    assert.equal(webhookRows.length, 1);
    assert.deepEqual(processingCalls, [webhookRows[0].id]);
  });

  it("route POST still returns 200 when automatic processing crashes after storage", async () => {
    const { supabase, webhookRows } = createFakeSupabase();
    const processingCalls = [];
    const response = await handleStravaWebhookPost(
      jsonRequest(validWebhookPayload()),
      supabase,
      {
        processSingleEvent: async (eventId) => {
          processingCalls.push(eventId);
          throw new Error("Unexpected processor crash.");
        },
      },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(webhookRows.length, 1);
    assert.deepEqual(processingCalls, [webhookRows[0].id]);
  });

  it("stores activity create events as pending and attaches the matched user", async () => {
    const event = parseStravaWebhookEvent(validWebhookPayload());
    const { calls, supabase } = createFakeSupabase({
      userId: "matched-user",
    });

    const result = await storeStravaWebhookEvent({ supabase, event });
    const insertCall = calls.find(
      (call) =>
        call.table === "strava_webhook_events" &&
        call.operation === "insert",
    );

    assert.equal(result.duplicate, false);
    assert.equal(result.eventId, insertCall.row.id);
    assert.equal(result.processingStatus, "pending");
    assert.equal(result.actionTaken, null);
    assert.equal(result.userId, "matched-user");
    assert.match(result.eventId, /^[0-9a-f-]{36}$/);
    assert.equal(insertCall.row.user_id, "matched-user");
    assert.equal(insertCall.row.owner_id, 987654321);
    assert.equal(insertCall.row.object_type, "activity");
    assert.equal(insertCall.row.aspect_type, "create");
    assert.equal(insertCall.row.processing_status, "pending");
    assert.equal(insertCall.row.action_taken, null);
    assert.deepEqual(insertCall.row.raw_event, validWebhookPayload());
  });

  it("stores unmatched events with a null user id", async () => {
    const event = parseStravaWebhookEvent(validWebhookPayload());
    const { calls, supabase } = createFakeSupabase({
      userId: null,
    });

    const result = await storeStravaWebhookEvent({ supabase, event });
    const insertCall = calls.find(
      (call) =>
        call.table === "strava_webhook_events" &&
        call.operation === "insert",
    );

    assert.equal(result.userId, null);
    assert.equal(insertCall.row.user_id, null);
  });

  it("stores update, delete, and athlete events as ignored", async () => {
    for (const overrides of [
      { aspect_type: "update", updates: { title: "New title" } },
      { aspect_type: "delete" },
      {
        object_type: "athlete",
        aspect_type: "update",
        updates: { authorized: "false" },
      },
    ]) {
      const event = parseStravaWebhookEvent(validWebhookPayload(overrides));
      const decision = getWebhookIntakeDecision(event);
      const { calls, supabase } = createFakeSupabase();
      const result = await storeStravaWebhookEvent({ supabase, event });
      const insertCall = calls.find(
        (call) =>
          call.table === "strava_webhook_events" &&
          call.operation === "insert",
      );

      assert.equal(decision.processingStatus, "ignored");
      assert.equal(result.processingStatus, "ignored");
      assert.equal(insertCall.row.processing_status, "ignored");
      assert.equal(insertCall.row.action_taken, decision.actionTaken);
    }
  });

  it("treats duplicate webhook event inserts as successful intake", async () => {
    const event = parseStravaWebhookEvent(validWebhookPayload());
    const { supabase } = createFakeSupabase({
      insertError: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
    });

    const result = await storeStravaWebhookEvent({ supabase, event });

    assert.equal(result.duplicate, true);
    assert.equal(result.eventId, null);
    assert.equal(result.processingStatus, "pending");
  });

  it("does not fetch activity details or call import/workout functions during intake", async () => {
    const event = parseStravaWebhookEvent(validWebhookPayload());
    const { calls, supabase } = createFakeSupabase();

    await storeStravaWebhookEvent({ supabase, event });

    assert.deepEqual(
      calls.map((call) => call.table),
      ["strava_connections", "strava_connections", "strava_webhook_events"],
    );
  });
});
