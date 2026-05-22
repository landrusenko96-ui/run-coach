export type DeleteStravaWebhookSubscriptionRequest = {
  subscriptionId: string;
  confirmDelete: true;
};

type RawDeleteStravaWebhookSubscriptionRequest = {
  subscriptionId?: unknown;
  confirmDelete?: unknown;
};

export async function readDeleteStravaWebhookSubscriptionRequest(
  request: Request,
): Promise<DeleteStravaWebhookSubscriptionRequest> {
  const bodyText = await request.text();

  if (!bodyText.trim()) {
    throw new Error("Delete request body is required.");
  }

  let body: RawDeleteStravaWebhookSubscriptionRequest;

  try {
    body = JSON.parse(bodyText) as RawDeleteStravaWebhookSubscriptionRequest;
  } catch {
    throw new Error("Delete request body must be valid JSON.");
  }

  const subscriptionId =
    typeof body.subscriptionId === "string"
      ? body.subscriptionId.trim()
      : typeof body.subscriptionId === "number" &&
          Number.isFinite(body.subscriptionId)
        ? String(body.subscriptionId)
        : "";

  if (!subscriptionId || !/^\d+$/.test(subscriptionId)) {
    throw new Error("subscriptionId must be a numeric Strava subscription ID.");
  }

  if (body.confirmDelete !== true) {
    throw new Error("confirmDelete must be true to delete a Strava subscription.");
  }

  return {
    subscriptionId,
    confirmDelete: true,
  };
}
