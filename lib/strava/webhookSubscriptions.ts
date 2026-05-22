import {
  getStravaWebhookServerConfig,
  type StravaWebhookServerConfig,
} from "./config.ts";
import type { StravaWebhookSubscriptionInfo } from "../../types/strava.ts";

export const STRAVA_PUSH_SUBSCRIPTIONS_URL =
  "https://www.strava.com/api/v3/push_subscriptions";

type StravaWebhookSubscriptionOptions = {
  config?: StravaWebhookServerConfig;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

export type StravaWebhookSubscriptionResult = StravaWebhookSubscriptionInfo & {
  ok: boolean;
  message: string;
};

type RawStravaWebhookSubscription = {
  id?: unknown;
  callback_url?: unknown;
};

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Strava webhook subscriptions can only be managed on the server.");
  }
}

function getConfig(
  options: StravaWebhookSubscriptionOptions,
): StravaWebhookServerConfig {
  assertServerOnly();

  return options.config ?? getStravaWebhookServerConfig();
}

function getFetchImpl(
  options: StravaWebhookSubscriptionOptions,
): typeof fetch {
  return options.fetchImpl ?? fetch;
}

function getBaseUrl(options: StravaWebhookSubscriptionOptions): string {
  return options.baseUrl ?? STRAVA_PUSH_SUBSCRIPTIONS_URL;
}

function buildEmptyResult(input: {
  ok: boolean;
  message: string;
}): StravaWebhookSubscriptionResult {
  return {
    ok: input.ok,
    exists: false,
    subscriptionId: null,
    callbackUrl: null,
    message: input.message,
  };
}

function getText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getIdText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getRequiredSubscriptionId(subscriptionId: string | number): string {
  const text = getIdText(subscriptionId);

  if (!text || !/^\d+$/.test(text)) {
    throw new Error("A numeric Strava webhook subscription ID is required.");
  }

  return text;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseSubscriptionList(text: string): RawStravaWebhookSubscription[] {
  const parsed = parseJson(text);

  if (Array.isArray(parsed)) {
    return parsed.filter(
      (item): item is RawStravaWebhookSubscription =>
        Boolean(item) && typeof item === "object",
    );
  }

  if (parsed && typeof parsed === "object") {
    return [parsed as RawStravaWebhookSubscription];
  }

  return [];
}

function parseCreatedSubscriptionId(text: string): string | null {
  const parsed = parseJson(text);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  return getIdText((parsed as { id?: unknown }).id);
}

function redactSensitiveText(
  text: string | null,
  config: StravaWebhookServerConfig,
): string | null {
  if (!text) {
    return null;
  }

  let safeText = text;

  for (const secret of [config.clientSecret, config.webhookVerifyToken]) {
    if (secret) {
      safeText = safeText.split(secret).join("[redacted]");
    }
  }

  return safeText;
}

async function parseSafeErrorMessage(
  response: Response,
  config: StravaWebhookServerConfig,
): Promise<string | null> {
  const responseText = (await response.text()).trim();

  if (!responseText) {
    return null;
  }

  const parsed = parseJson(responseText);
  let message: unknown = null;

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    message =
      (parsed as { message?: unknown }).message ??
      (parsed as { error?: unknown }).error;
  }

  const text =
    typeof message === "string" && message.trim()
      ? message.trim()
      : responseText;
  const truncated = text.length > 300 ? `${text.slice(0, 300)}...` : text;

  return redactSensitiveText(truncated, config);
}

function buildSafeFailure(input: {
  message: string;
  detail: string | null;
}): StravaWebhookSubscriptionResult {
  return buildEmptyResult({
    ok: false,
    message: input.detail
      ? `${input.message} ${input.detail}`
      : input.message,
  });
}

function buildSubscriptionResult(
  subscription: RawStravaWebhookSubscription,
): StravaWebhookSubscriptionResult | null {
  const subscriptionId = getIdText(subscription.id);

  if (!subscriptionId) {
    return null;
  }

  return {
    ok: true,
    exists: true,
    subscriptionId,
    callbackUrl: getText(subscription.callback_url),
    message: "Strava webhook subscription exists.",
  };
}

function isAlreadyExistsError(message: string | null): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();

  return normalized.includes("already") && normalized.includes("exist");
}

function buildCredentialQuery(
  url: URL,
  config: StravaWebhookServerConfig,
): URL {
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("client_secret", config.clientSecret);

  return url;
}

export async function getStravaWebhookSubscription(
  options: StravaWebhookSubscriptionOptions = {},
): Promise<StravaWebhookSubscriptionResult> {
  const config = getConfig(options);
  const fetchImpl = getFetchImpl(options);
  const url = buildCredentialQuery(new URL(getBaseUrl(options)), config);

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return buildSafeFailure({
      message: "Could not check Strava webhook subscription.",
      detail: await parseSafeErrorMessage(response, config),
    });
  }

  const subscriptions = parseSubscriptionList(await response.text());
  const subscription = subscriptions
    .map((item) => buildSubscriptionResult(item))
    .find(Boolean);

  if (!subscription) {
    return buildEmptyResult({
      ok: true,
      message: "No Strava webhook subscription exists.",
    });
  }

  return subscription;
}

export async function createStravaWebhookSubscription(
  options: StravaWebhookSubscriptionOptions = {},
): Promise<StravaWebhookSubscriptionResult> {
  const existingSubscription = await getStravaWebhookSubscription(options);

  if (existingSubscription.ok && existingSubscription.exists) {
    return {
      ...existingSubscription,
      message: "Strava webhook subscription already exists.",
    };
  }

  if (!existingSubscription.ok) {
    return {
      ...existingSubscription,
      message: "Could not check existing Strava webhook subscription before creating.",
    };
  }

  const config = getConfig(options);
  const fetchImpl = getFetchImpl(options);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    callback_url: config.webhookCallbackUrl,
    verify_token: config.webhookVerifyToken,
  });
  const response = await fetchImpl(getBaseUrl(options), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const detail = await parseSafeErrorMessage(response, config);

    if (isAlreadyExistsError(detail)) {
      const retriedSubscription = await getStravaWebhookSubscription(options);

      if (retriedSubscription.ok && retriedSubscription.exists) {
        return {
          ...retriedSubscription,
          message: "Strava webhook subscription already exists.",
        };
      }
    }

    return buildSafeFailure({
      message: "Could not create Strava webhook subscription.",
      detail,
    });
  }

  return {
    ok: true,
    exists: true,
    subscriptionId: parseCreatedSubscriptionId(await response.text()),
    callbackUrl: config.webhookCallbackUrl,
    message: "Strava webhook subscription created.",
  };
}

export async function deleteStravaWebhookSubscription(
  subscriptionId: string | number,
  options: StravaWebhookSubscriptionOptions = {},
): Promise<StravaWebhookSubscriptionResult> {
  const requestedSubscriptionId = getRequiredSubscriptionId(subscriptionId);
  const existingSubscription = await getStravaWebhookSubscription(options);

  if (!existingSubscription.ok) {
    return {
      ...existingSubscription,
      message: "Could not check current Strava webhook subscription before deleting.",
    };
  }

  if (!existingSubscription.exists || !existingSubscription.subscriptionId) {
    return buildEmptyResult({
      ok: true,
      message: "No Strava webhook subscription exists to delete.",
    });
  }

  if (existingSubscription.subscriptionId !== requestedSubscriptionId) {
    return {
      ...existingSubscription,
      ok: false,
      message:
        "Requested Strava webhook subscription ID does not match the current subscription.",
    };
  }

  const config = getConfig(options);
  const fetchImpl = getFetchImpl(options);
  const url = buildCredentialQuery(
    new URL(`${getBaseUrl(options).replace(/\/+$/, "")}/${requestedSubscriptionId}`),
    config,
  );
  const response = await fetchImpl(url.toString(), {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 204) {
    return buildEmptyResult({
      ok: true,
      message: "Strava webhook subscription deleted.",
    });
  }

  return buildSafeFailure({
    message: "Could not delete Strava webhook subscription.",
    detail: await parseSafeErrorMessage(response, config),
  });
}
