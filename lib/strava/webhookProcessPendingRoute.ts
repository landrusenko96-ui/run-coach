import type { ProcessStravaWebhookEventResult } from "./webhookProcessing.ts";

export type ProcessPendingWebhookRequestOptions = {
  retryFailed: boolean;
  limit: number;
};

export type ProcessPendingWebhookSummary = {
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type ProcessPendingWebhookRequestBody = {
  retryFailed?: unknown;
  limit?: unknown;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function readProcessPendingWebhookRequest(
  request: Request,
): Promise<ProcessPendingWebhookRequestOptions> {
  const bodyText = await request.text();

  if (!bodyText.trim()) {
    return {
      retryFailed: false,
      limit: DEFAULT_LIMIT,
    };
  }

  let body: ProcessPendingWebhookRequestBody;

  try {
    body = JSON.parse(bodyText) as ProcessPendingWebhookRequestBody;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }

  if (body.retryFailed !== undefined && typeof body.retryFailed !== "boolean") {
    throw new Error("retryFailed must be true or false.");
  }

  let limit = DEFAULT_LIMIT;

  if (body.limit !== undefined) {
    if (
      typeof body.limit !== "number" ||
      !Number.isFinite(body.limit) ||
      body.limit < 1
    ) {
      throw new Error("limit must be a positive number.");
    }

    limit = Math.min(Math.floor(body.limit), MAX_LIMIT);
  }

  return {
    retryFailed: body.retryFailed ?? false,
    limit,
  };
}

export function buildProcessPendingWebhookSummary(
  results: ProcessStravaWebhookEventResult[],
): ProcessPendingWebhookSummary {
  const failedResults = results.filter(
    (result) =>
      !result.ok ||
      result.processingStatus === "failed" ||
      result.actionTaken === "failed_processing",
  );

  return {
    processed: results.length,
    imported: results.filter(
      (result) => result.ok && result.actionTaken === "imported",
    ).length,
    skipped: results.filter(
      (result) => result.ok && result.actionTaken !== "imported",
    ).length,
    failed: failedResults.length,
    errors: failedResults.map((result) => result.message),
  };
}
