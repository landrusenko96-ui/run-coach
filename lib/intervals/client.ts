import {
  getIntervalsServerConfig,
  type IntervalsServerConfig,
} from "./config.ts";

export const INTERVALS_API_BASE_URL = "https://intervals.icu/api/v1";

export type IntervalsAthleteInfo = {
  id?: string;
  name?: string;
  email?: string;
  timezone?: string;
  [key: string]: unknown;
};

export type IntervalsCalendarEventPayload = {
  category: "WORKOUT" | "NOTE" | string;
  start_date_local: string;
  name?: string;
  description?: string;
  type?: "Run" | string;
  external_id?: string;
  filename?: string;
  file_contents?: string;
  file_contents_base64?: string;
  moving_time?: number;
  icu_training_load?: number;
  [key: string]: unknown;
};

export type IntervalsCalendarEvent = IntervalsCalendarEventPayload & {
  id?: number;
  uid?: string;
  athlete_id?: string;
  calendar_id?: number;
  updated?: string;
};

export type IntervalsCalendarEventDeleteInput = {
  id?: number;
  external_id?: string;
};

export type IntervalsClientOptions = {
  baseUrl?: string;
  config?: IntervalsServerConfig;
  fetchImpl?: typeof fetch;
};

type IntervalsRequestOptions = IntervalsClientOptions & {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
};

type RequiredIntervalsServerConfig = IntervalsServerConfig & {
  athleteId: string;
};

export class IntervalsApiError extends Error {
  status: number;
  path: string;
  responseBody: string | null;

  constructor(input: {
    status: number;
    path: string;
    responseBody: string | null;
  }) {
    super(
      `Intervals.icu API request failed with status ${input.status} for ${input.path}${
        input.responseBody ? `: ${input.responseBody}` : ""
      }`,
    );
    this.name = "IntervalsApiError";
    this.status = input.status;
    this.path = input.path;
    this.responseBody = input.responseBody;
  }
}

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Intervals.icu API client can only run on the server.");
  }
}

function getRequiredConfig(
  options: IntervalsClientOptions,
): RequiredIntervalsServerConfig {
  assertServerOnly();

  const config = options.config ?? getIntervalsServerConfig();

  if (!config.athleteId) {
    throw new Error("Missing INTERVALS_ATHLETE_ID server environment variable.");
  }

  return {
    ...config,
    athleteId: config.athleteId,
  };
}

function buildBasicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`, "utf8").toString("base64")}`;
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function parseErrorBody(response: Response): Promise<string | null> {
  const responseText = await response.text();
  const trimmedText = responseText.trim();

  if (!trimmedText) {
    return null;
  }

  try {
    const parsedBody = JSON.parse(trimmedText) as unknown;

    if (
      parsedBody &&
      typeof parsedBody === "object" &&
      "message" in parsedBody &&
      typeof parsedBody.message === "string"
    ) {
      return parsedBody.message;
    }
  } catch {
    // Plain-text API error bodies are still useful to callers.
  }

  return trimmedText.length > 500 ? `${trimmedText.slice(0, 500)}...` : trimmedText;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text();

  if (!responseText.trim()) {
    return null as T;
  }

  return JSON.parse(responseText) as T;
}

async function intervalsRequest<T>(
  path: string,
  options: IntervalsRequestOptions = {},
): Promise<T> {
  const config = getRequiredConfig(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: buildBasicAuthHeader(config.apiKey),
  };

  let body: string | undefined;

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetchImpl(buildUrl(options.baseUrl ?? INTERVALS_API_BASE_URL, path), {
    method,
    headers,
    body,
  });

  if (!response.ok) {
    throw new IntervalsApiError({
      status: response.status,
      path,
      responseBody: await parseErrorBody(response),
    });
  }

  return parseJsonResponse<T>(response);
}

export async function testIntervalsConnection(
  options: IntervalsClientOptions = {},
): Promise<IntervalsAthleteInfo> {
  const config = getRequiredConfig(options);

  return intervalsRequest<IntervalsAthleteInfo>(
    `/athlete/${encodeURIComponent(config.athleteId)}`,
    options,
  );
}

export async function bulkUpsertCalendarEvents(
  events: IntervalsCalendarEventPayload[],
  options: IntervalsClientOptions = {},
): Promise<IntervalsCalendarEvent[]> {
  const config = getRequiredConfig(options);

  return intervalsRequest<IntervalsCalendarEvent[]>(
    `/athlete/${encodeURIComponent(config.athleteId)}/events/bulk?upsert=true`,
    {
      ...options,
      method: "POST",
      body: events,
    },
  );
}

export async function bulkDeleteCalendarEvents(
  events: IntervalsCalendarEventDeleteInput[],
  options: IntervalsClientOptions = {},
): Promise<number> {
  const config = getRequiredConfig(options);

  return intervalsRequest<number>(
    `/athlete/${encodeURIComponent(config.athleteId)}/events/bulk-delete`,
    {
      ...options,
      method: "PUT",
      body: events,
    },
  );
}
