import {
  getStravaServerConfig,
  type StravaServerConfig,
} from "./config.ts";

export const STRAVA_AUTHORIZATION_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token";
export const STRAVA_API_BASE_URL = "https://www.strava.com/api/v3";
export const STRAVA_REQUIRED_SCOPES = ["read", "activity:read_all"] as const;
export const STRAVA_REQUESTED_SCOPE = STRAVA_REQUIRED_SCOPES.join(",");
export const STRAVA_TOKEN_REFRESH_BUFFER_SECONDS = 60 * 60;

type StravaClientOptions = {
  config?: StravaServerConfig;
  fetchImpl?: typeof fetch;
};

type RawStravaAthlete = {
  id?: unknown;
  username?: unknown;
  firstname?: unknown;
  lastname?: unknown;
  profile?: unknown;
  profile_medium?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
};

type RawStravaTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  athlete?: unknown;
};

type RawStravaSummaryActivity = {
  id?: unknown;
  name?: unknown;
  sport_type?: unknown;
  type?: unknown;
  start_date?: unknown;
  start_date_local?: unknown;
  distance?: unknown;
  moving_time?: unknown;
  elapsed_time?: unknown;
  total_elevation_gain?: unknown;
  average_heartrate?: unknown;
  max_heartrate?: unknown;
};

export type SafeStravaAthleteSummary = {
  id: string;
  username: string | null;
  firstname: string | null;
  lastname: string | null;
  profile: string | null;
  profileMedium: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

export type StravaTokenExchange = {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  athlete: SafeStravaAthleteSummary;
};

export type StravaRefreshedToken = {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
};

export type StravaSummaryActivity = {
  id: string;
  name: string;
  sportType: string;
  startDate: string;
  startDateLocal: string | null;
  distanceM: number | null;
  movingTimeSec: number | null;
  elapsedTimeSec: number | null;
  totalElevationGainM: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  rawSummary: Record<string, unknown>;
};

export class StravaApiError extends Error {
  status: number;
  responseBody: string | null;

  constructor(input: { status: number; responseBody: string | null }) {
    super(
      `Strava API request failed with status ${input.status}${
        input.responseBody ? `: ${input.responseBody}` : ""
      }`,
    );
    this.name = "StravaApiError";
    this.status = input.status;
    this.responseBody = input.responseBody;
  }
}

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Strava API client can only run on the server.");
  }
}

function getConfig(options: StravaClientOptions): StravaServerConfig {
  assertServerOnly();

  return options.config ?? getStravaServerConfig();
}

function getText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRequiredText(value: unknown, fieldName: string): string {
  const text = getText(value);

  if (!text) {
    throw new Error(`Strava token response was missing ${fieldName}.`);
  }

  return text;
}

function getStravaId(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  throw new Error("Strava token response was missing athlete.id.");
}

function getTokenExpiry(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Strava token response was missing expires_at.");
  }

  return new Date(value * 1000).toISOString();
}

function asRawAthlete(value: unknown): RawStravaAthlete {
  if (!value || typeof value !== "object") {
    throw new Error("Strava token response was missing athlete.");
  }

  return value as RawStravaAthlete;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

async function parseSafeErrorBody(response: Response): Promise<string | null> {
  const responseText = (await response.text()).trim();

  if (!responseText) {
    return null;
  }

  const parsedBody = parseJsonObject(responseText);
  const message = parsedBody?.message ?? parsedBody?.error;

  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return responseText.length > 300 ? `${responseText.slice(0, 300)}...` : responseText;
}

async function parseJsonObjectResponse(
  response: Response,
  description: string,
): Promise<Record<string, unknown>> {
  const responseText = await response.text();
  const parsedBody = parseJsonObject(responseText);

  if (!parsedBody) {
    throw new Error(`Strava ${description} response must be a JSON object.`);
  }

  return parsedBody;
}

async function parseJsonArrayResponse(
  response: Response,
  description: string,
): Promise<unknown[]> {
  const responseText = await response.text();

  try {
    const parsedBody = JSON.parse(responseText) as unknown;

    if (Array.isArray(parsedBody)) {
      return parsedBody;
    }
  } catch {
    // Fall through to the consistent error below.
  }

  throw new Error(`Strava ${description} response must be a JSON array.`);
}

function getOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRequiredDateTimeText(value: unknown, fieldName: string): string {
  const dateTimeText = getRequiredText(value, fieldName);
  const timestamp = Date.parse(dateTimeText);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`Strava activity response had an invalid ${fieldName}.`);
  }

  return dateTimeText;
}

function buildStravaActivityId(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  throw new Error("Strava activity response was missing id.");
}

function getRequiredActivityIdText(value: string | number): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  throw new Error("Strava activity ID is required.");
}

function buildStravaSummaryActivity(
  rawActivity: RawStravaSummaryActivity,
): StravaSummaryActivity {
  const rawSummary = rawActivity as Record<string, unknown>;
  const sportType = getText(rawActivity.sport_type) ?? getText(rawActivity.type);

  if (!sportType) {
    throw new Error("Strava activity response was missing sport_type.");
  }

  return {
    id: buildStravaActivityId(rawActivity.id),
    name: getText(rawActivity.name) ?? "Untitled Strava Activity",
    sportType,
    startDate: getRequiredDateTimeText(rawActivity.start_date, "start_date"),
    startDateLocal: getText(rawActivity.start_date_local),
    distanceM: getOptionalNumber(rawActivity.distance),
    movingTimeSec: getOptionalNumber(rawActivity.moving_time),
    elapsedTimeSec: getOptionalNumber(rawActivity.elapsed_time),
    totalElevationGainM: getOptionalNumber(rawActivity.total_elevation_gain),
    averageHeartRate: getOptionalNumber(rawActivity.average_heartrate),
    maxHeartRate: getOptionalNumber(rawActivity.max_heartrate),
    rawSummary,
  };
}

function buildTokenRefreshBody(
  refreshToken: string,
  config: StravaServerConfig,
): URLSearchParams {
  return new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

function buildCodeExchangeBody(
  code: string,
  config: StravaServerConfig,
): URLSearchParams {
  return new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
  });
}

async function postStravaTokenRequest(
  body: URLSearchParams,
  options: StravaClientOptions,
): Promise<RawStravaTokenResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new StravaApiError({
      status: response.status,
      responseBody: await parseSafeErrorBody(response),
    });
  }

  return (await parseJsonObjectResponse(response, "token")) as RawStravaTokenResponse;
}

export function buildStravaAuthorizationUrl(
  state: string,
  options: Pick<StravaClientOptions, "config"> = {},
): string {
  const config = getConfig(options);
  const url = new URL(STRAVA_AUTHORIZATION_URL);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", STRAVA_REQUESTED_SCOPE);
  url.searchParams.set("state", state);

  return url.toString();
}

export function getGrantedStravaScopes(scopeText: string): Set<string> {
  return new Set(
    scopeText
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
}

export function hasRequiredStravaScopes(scopeText: string): boolean {
  const grantedScopes = getGrantedStravaScopes(scopeText);

  return STRAVA_REQUIRED_SCOPES.every((scope) => grantedScopes.has(scope));
}

export function buildSafeStravaAthleteSummary(
  athlete: RawStravaAthlete,
): SafeStravaAthleteSummary {
  return {
    id: getStravaId(athlete.id),
    username: getText(athlete.username),
    firstname: getText(athlete.firstname),
    lastname: getText(athlete.lastname),
    profile: getText(athlete.profile),
    profileMedium: getText(athlete.profile_medium),
    city: getText(athlete.city),
    state: getText(athlete.state),
    country: getText(athlete.country),
  };
}

export function getStravaAthleteDisplayName(
  athlete: SafeStravaAthleteSummary,
): string | null {
  const fullName = [athlete.firstname, athlete.lastname].filter(Boolean).join(" ");

  return fullName || athlete.username;
}

export async function exchangeStravaCodeForToken(
  code: string,
  options: StravaClientOptions = {},
): Promise<StravaTokenExchange> {
  const config = getConfig(options);
  const responseBody = await postStravaTokenRequest(
    buildCodeExchangeBody(code, config),
    options,
  );
  const athlete = buildSafeStravaAthleteSummary(asRawAthlete(responseBody.athlete));

  return {
    accessToken: getRequiredText(responseBody.access_token, "access_token"),
    refreshToken: getRequiredText(responseBody.refresh_token, "refresh_token"),
    tokenExpiresAt: getTokenExpiry(responseBody.expires_at),
    athlete,
  };
}

export function shouldRefreshStravaToken(
  tokenExpiresAt: string,
  now = new Date(),
): boolean {
  const expiresAtMs = Date.parse(tokenExpiresAt);

  if (!Number.isFinite(expiresAtMs)) {
    return true;
  }

  return (
    expiresAtMs - now.getTime() <=
    STRAVA_TOKEN_REFRESH_BUFFER_SECONDS * 1000
  );
}

export async function refreshStravaAccessToken(
  refreshToken: string,
  options: StravaClientOptions = {},
): Promise<StravaRefreshedToken> {
  const config = getConfig(options);
  const responseBody = await postStravaTokenRequest(
    buildTokenRefreshBody(refreshToken, config),
    options,
  );

  return {
    accessToken: getRequiredText(responseBody.access_token, "access_token"),
    refreshToken: getRequiredText(responseBody.refresh_token, "refresh_token"),
    tokenExpiresAt: getTokenExpiry(responseBody.expires_at),
  };
}

export async function fetchRecentStravaActivities(input: {
  accessToken: string;
  afterEpochSeconds: number;
  perPage?: number;
  options?: Pick<StravaClientOptions, "fetchImpl"> & {
    baseUrl?: string;
  };
}): Promise<StravaSummaryActivity[]> {
  assertServerOnly();

  const fetchImpl = input.options?.fetchImpl ?? fetch;
  const baseUrl = input.options?.baseUrl ?? STRAVA_API_BASE_URL;
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/athlete/activities`);

  url.searchParams.set("after", String(input.afterEpochSeconds));
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", String(input.perPage ?? 100));

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new StravaApiError({
      status: response.status,
      responseBody: await parseSafeErrorBody(response),
    });
  }

  const responseBody = await parseJsonArrayResponse(response, "activities");

  return responseBody.map((activity) =>
    buildStravaSummaryActivity(activity as RawStravaSummaryActivity),
  );
}

export async function fetchStravaActivityById(input: {
  accessToken: string;
  activityId: string | number;
  options?: Pick<StravaClientOptions, "fetchImpl"> & {
    baseUrl?: string;
  };
}): Promise<StravaSummaryActivity> {
  assertServerOnly();

  const fetchImpl = input.options?.fetchImpl ?? fetch;
  const baseUrl = input.options?.baseUrl ?? STRAVA_API_BASE_URL;
  const activityId = encodeURIComponent(
    getRequiredActivityIdText(input.activityId),
  );
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/activities/${activityId}`);

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new StravaApiError({
      status: response.status,
      responseBody: await parseSafeErrorBody(response),
    });
  }

  const responseBody = await parseJsonObjectResponse(response, "activity");

  return buildStravaSummaryActivity(responseBody as RawStravaSummaryActivity);
}
