import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProcessPendingWebhookSummary,
  readProcessPendingWebhookRequest,
} from "../lib/strava/webhookProcessPendingRoute.ts";

function requestWithBody(body) {
  return new Request("https://run.example/api/strava/webhook/process-pending", {
    method: "POST",
    body,
  });
}

describe("Strava webhook pending processing route helpers", () => {
  it("uses safe defaults when the request body is empty", async () => {
    const options = await readProcessPendingWebhookRequest(requestWithBody(""));

    assert.deepEqual(options, {
      retryFailed: false,
      limit: 10,
    });
  });

  it("reads retry and limit options from JSON", async () => {
    const options = await readProcessPendingWebhookRequest(
      requestWithBody(JSON.stringify({ retryFailed: true, limit: 4 })),
    );

    assert.deepEqual(options, {
      retryFailed: true,
      limit: 4,
    });
  });

  it("rejects invalid request JSON and option types", async () => {
    await assert.rejects(
      readProcessPendingWebhookRequest(requestWithBody("{")),
      /valid JSON/,
    );
    await assert.rejects(
      readProcessPendingWebhookRequest(
        requestWithBody(JSON.stringify({ retryFailed: "yes" })),
      ),
      /retryFailed/,
    );
    await assert.rejects(
      readProcessPendingWebhookRequest(
        requestWithBody(JSON.stringify({ limit: 0 })),
      ),
      /limit/,
    );
  });

  it("summarizes imported, skipped, failed, and error results", () => {
    const summary = buildProcessPendingWebhookSummary([
      {
        eventId: "event-imported",
        ok: true,
        processingStatus: "processed",
        actionTaken: "imported",
        message: "Imported.",
      },
      {
        eventId: "event-skipped",
        ok: true,
        processingStatus: "ignored",
        actionTaken: "skipped_update_ignored",
        message: "Skipped.",
      },
      {
        eventId: "event-failed",
        ok: false,
        processingStatus: "failed",
        actionTaken: "failed_processing",
        message: "Failed.",
      },
    ]);

    assert.deepEqual(summary, {
      processed: 3,
      imported: 1,
      skipped: 1,
      failed: 1,
      errors: ["Failed."],
    });
  });
});
