import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STRAVA_PUSH_SUBSCRIPTIONS_URL,
  createStravaWebhookSubscription,
  deleteStravaWebhookSubscription,
  getStravaWebhookSubscription,
} from "../lib/strava/webhookSubscriptions.ts";

const config = {
  clientId: "12345",
  clientSecret: "super-secret-client-secret",
  appUrl: "http://localhost:3000",
  callbackUrl: "http://localhost:3000/api/strava/callback",
  webhookCallbackUrl: "https://example.com/api/strava/webhook",
  webhookVerifyToken: "super-secret-verify-token",
};

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

function createMockFetch(responses) {
  const calls = [];
  const queuedResponses = Array.isArray(responses) ? [...responses] : [responses];
  const fetchImpl = async (url, init) => {
    calls.push({
      url: String(url),
      init,
    });

    const response = queuedResponses.shift();

    if (!response) {
      throw new Error("No mock fetch response was queued.");
    }

    return response;
  };

  return {
    calls,
    fetchImpl,
  };
}

function resultText(result) {
  return JSON.stringify(result);
}

describe("Strava webhook subscription client", () => {
  it("checks the current subscription with server-side app credentials", async () => {
    const mockFetch = createMockFetch(
      jsonResponse([
        {
          id: 777,
          callback_url: "https://example.com/api/strava/webhook",
        },
      ]),
    );

    const result = await getStravaWebhookSubscription({
      config,
      fetchImpl: mockFetch.fetchImpl,
    });
    const requestedUrl = new URL(mockFetch.calls[0].url);

    assert.equal(
      requestedUrl.origin + requestedUrl.pathname,
      STRAVA_PUSH_SUBSCRIPTIONS_URL,
    );
    assert.equal(requestedUrl.searchParams.get("client_id"), "12345");
    assert.equal(
      requestedUrl.searchParams.get("client_secret"),
      "super-secret-client-secret",
    );
    assert.deepEqual(result, {
      ok: true,
      exists: true,
      subscriptionId: "777",
      callbackUrl: "https://example.com/api/strava/webhook",
      message: "Strava webhook subscription exists.",
    });
    assert.doesNotMatch(resultText(result), /super-secret-client-secret/);
  });

  it("creates a subscription with callback URL and verify token form data", async () => {
    const mockFetch = createMockFetch([
      jsonResponse([]),
      jsonResponse({
        id: 888,
      }),
    ]);

    const result = await createStravaWebhookSubscription({
      config,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(mockFetch.calls.length, 2);
    assert.equal(mockFetch.calls[1].url, STRAVA_PUSH_SUBSCRIPTIONS_URL);
    assert.equal(mockFetch.calls[1].init.method, "POST");

    const body = mockFetch.calls[1].init.body;
    assert.equal(body.get("client_id"), "12345");
    assert.equal(body.get("client_secret"), "super-secret-client-secret");
    assert.equal(
      body.get("callback_url"),
      "https://example.com/api/strava/webhook",
    );
    assert.equal(body.get("verify_token"), "super-secret-verify-token");
    assert.equal(result.ok, true);
    assert.equal(result.exists, true);
    assert.equal(result.subscriptionId, "888");
    assert.doesNotMatch(resultText(result), /super-secret-client-secret/);
    assert.doesNotMatch(resultText(result), /super-secret-verify-token/);
  });

  it("returns the existing subscription without creating a duplicate", async () => {
    const mockFetch = createMockFetch(
      jsonResponse([
        {
          id: 777,
          callback_url: "https://example.com/api/strava/webhook",
        },
      ]),
    );

    const result = await createStravaWebhookSubscription({
      config,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(mockFetch.calls.length, 1);
    assert.equal(result.ok, true);
    assert.equal(result.exists, true);
    assert.equal(result.subscriptionId, "777");
    assert.equal(result.message, "Strava webhook subscription already exists.");
  });

  it("handles an already-exists create response by checking again", async () => {
    const mockFetch = createMockFetch([
      jsonResponse([]),
      jsonResponse(
        {
          message: "Subscription already exists.",
        },
        {
          status: 400,
        },
      ),
      jsonResponse([
        {
          id: 777,
          callback_url: "https://example.com/api/strava/webhook",
        },
      ]),
    ]);

    const result = await createStravaWebhookSubscription({
      config,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(mockFetch.calls.length, 3);
    assert.equal(result.ok, true);
    assert.equal(result.exists, true);
    assert.equal(result.subscriptionId, "777");
    assert.equal(result.message, "Strava webhook subscription already exists.");
  });

  it("deletes only the matching current subscription", async () => {
    const mockFetch = createMockFetch([
      jsonResponse([
        {
          id: 777,
          callback_url: "https://example.com/api/strava/webhook",
        },
      ]),
      new Response(null, {
        status: 204,
      }),
    ]);

    const result = await deleteStravaWebhookSubscription("777", {
      config,
      fetchImpl: mockFetch.fetchImpl,
    });
    const deleteUrl = new URL(mockFetch.calls[1].url);

    assert.equal(
      deleteUrl.origin + deleteUrl.pathname,
      `${STRAVA_PUSH_SUBSCRIPTIONS_URL}/777`,
    );
    assert.equal(deleteUrl.searchParams.get("client_id"), "12345");
    assert.equal(
      deleteUrl.searchParams.get("client_secret"),
      "super-secret-client-secret",
    );
    assert.equal(mockFetch.calls[1].init.method, "DELETE");
    assert.deepEqual(result, {
      ok: true,
      exists: false,
      subscriptionId: null,
      callbackUrl: null,
      message: "Strava webhook subscription deleted.",
    });
  });

  it("refuses to delete when the requested id does not match", async () => {
    const mockFetch = createMockFetch(
      jsonResponse([
        {
          id: 777,
          callback_url: "https://example.com/api/strava/webhook",
        },
      ]),
    );

    const result = await deleteStravaWebhookSubscription("999", {
      config,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(mockFetch.calls.length, 1);
    assert.equal(result.ok, false);
    assert.equal(result.exists, true);
    assert.equal(result.subscriptionId, "777");
    assert.match(result.message, /does not match/);
  });

  it("returns safe errors without exposing secrets", async () => {
    const mockFetch = createMockFetch(
      jsonResponse(
        {
          message:
            "Bad request super-secret-client-secret super-secret-verify-token",
        },
        {
          status: 400,
        },
      ),
    );

    const result = await getStravaWebhookSubscription({
      config,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(result.ok, false);
    assert.doesNotMatch(resultText(result), /super-secret-client-secret/);
    assert.doesNotMatch(resultText(result), /super-secret-verify-token/);
    assert.match(resultText(result), /\[redacted\]/);
  });
});
