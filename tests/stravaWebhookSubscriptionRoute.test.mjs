import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readDeleteStravaWebhookSubscriptionRequest } from "../lib/strava/webhookSubscriptionRoute.ts";

function requestWithBody(body) {
  return new Request("https://run.example/api/strava/webhook/subscription", {
    method: "DELETE",
    body,
  });
}

describe("Strava webhook subscription route helpers", () => {
  it("reads an explicit delete confirmation request", async () => {
    const request = requestWithBody(
      JSON.stringify({
        subscriptionId: 777,
        confirmDelete: true,
      }),
    );

    const result = await readDeleteStravaWebhookSubscriptionRequest(request);

    assert.deepEqual(result, {
      subscriptionId: "777",
      confirmDelete: true,
    });
  });

  it("requires a valid JSON body", async () => {
    await assert.rejects(
      readDeleteStravaWebhookSubscriptionRequest(requestWithBody("")),
      /body is required/,
    );
    await assert.rejects(
      readDeleteStravaWebhookSubscriptionRequest(requestWithBody("{")),
      /valid JSON/,
    );
  });

  it("requires a numeric subscription id and confirmDelete true", async () => {
    await assert.rejects(
      readDeleteStravaWebhookSubscriptionRequest(
        requestWithBody(
          JSON.stringify({
            subscriptionId: "not-a-number",
            confirmDelete: true,
          }),
        ),
      ),
      /subscriptionId/,
    );
    await assert.rejects(
      readDeleteStravaWebhookSubscriptionRequest(
        requestWithBody(
          JSON.stringify({
            subscriptionId: "777",
            confirmDelete: false,
          }),
        ),
      ),
      /confirmDelete/,
    );
  });
});
