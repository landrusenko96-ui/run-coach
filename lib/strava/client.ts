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

type RawStravaDetailedActivity = RawStravaSummaryActivity & {
  achievement_count?: unknown;
  workout_type?: unknown;
  average_speed?: unknown;
  max_speed?: unknown;
  perceived_exertion?: unknown;
  average_watts?: unknown;
  max_watts?: unknown;
  weighted_average_watts?: unknown;
  device_watts?: unknown;
  splits_metric?: unknown;
  laps?: unknown;
  best_efforts?: unknown;
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

export type StravaActivitySplit = {
  distanceM: number | null;
  elapsedTimeSec: number | null;
  movingTimeSec: number | null;
  averageSpeedMps: number | null;
  paceSecPerKm: number | null;
  elevationDifferenceM: number | null;
  split: number | null;
  rawSplit: Record<string, unknown>;
};

export type StravaActivityLap = {
  name: string | null;
  distanceM: number | null;
  elapsedTimeSec: number | null;
  movingTimeSec: number | null;
  averageSpeedMps: number | null;
  maxSpeedMps: number | null;
  paceSecPerKm: number | null;
  totalElevationGainM: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averageWatts: number | null;
  averageCadence: number | null;
  lapIndex: number | null;
  split: number | null;
  rawLap: Record<string, unknown>;
};

export type StravaBestEffort = {
  name: string | null;
  distanceM: number | null;
  elapsedTimeSec: number | null;
  movingTimeSec: number | null;
  startDate: string | null;
  prRank: number | null;
  rawEffort: Record<string, unknown>;
};

export type StravaDetailedActivity = StravaSummaryActivity & {
  achievementCount: number | null;
  workoutType: number | null;
  averageSpeedMps: number | null;
  maxSpeedMps: number | null;
  perceivedExertion: number | null;
  averageWatts: number | null;
  maxWatts: number | null;
  weightedAverageWatts: number | null;
  deviceWatts: boolean | null;
  splitsMetric: StravaActivitySplit[];
  laps: StravaActivityLap[];
  bestEfforts: StravaBestEffort[];
  rawDetail: Record<string, unknown>;
};

export type StravaActivityStreamKey =
  | "time"
  | "distance"
  | "heartrate"
  | "watts"
  | "velocity_smooth"
  | "altitude"
  | "grade_smooth"
  | "cadence"
  | "moving";

export type StravaActivityStreams = {
  time: number[] | null;
  distance: number[] | null;
  heartrate: number[] | null;
  watts: number[] | null;
  velocitySmooth: number[] | null;
  altitude: number[] | null;
  gradeSmooth: number[] | null;
  cadence: number[] | null;
  moving: boolean[] | null;
  rawStreams: Record<string, unknown>;
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

function getOptionalInteger(value: unknown): number | null {
  const numberValue = getOptionalNumber(value);

  return numberValue === null ? null : Math.round(numberValue);
}

function getOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function getObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
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

function getPaceSecPerKm(input: {
  distanceM: number | null;
  movingTimeSec: number | null;
  elapsedTimeSec: number | null;
  averageSpeedMps: number | null;
}): number | null {
  const durationSec = input.movingTimeSec ?? input.elapsedTimeSec;

  if (input.averageSpeedMps !== null && input.averageSpeedMps > 0) {
    return Math.round(1000 / input.averageSpeedMps);
  }

  if (
    input.distanceM !== null &&
    input.distanceM > 0 &&
    durationSec !== null &&
    durationSec > 0
  ) {
    return Math.round(durationSec / (input.distanceM / 1000));
  }

  return null;
}

function buildStravaActivitySplit(rawSplit: Record<string, unknown>): StravaActivitySplit {
  const distanceM = getOptionalNumber(rawSplit.distance);
  const elapsedTimeSec = getOptionalInteger(rawSplit.elapsed_time);
  const movingTimeSec = getOptionalInteger(rawSplit.moving_time);
  const averageSpeedMps = getOptionalNumber(rawSplit.average_speed);

  return {
    distanceM,
    elapsedTimeSec,
    movingTimeSec,
    averageSpeedMps,
    paceSecPerKm: getPaceSecPerKm({
      distanceM,
      elapsedTimeSec,
      movingTimeSec,
      averageSpeedMps,
    }),
    elevationDifferenceM: getOptionalNumber(rawSplit.elevation_difference),
    split: getOptionalInteger(rawSplit.split),
    rawSplit,
  };
}

function buildStravaActivityLap(rawLap: Record<string, unknown>): StravaActivityLap {
  const distanceM = getOptionalNumber(rawLap.distance);
  const elapsedTimeSec = getOptionalInteger(rawLap.elapsed_time);
  const movingTimeSec = getOptionalInteger(rawLap.moving_time);
  const averageSpeedMps = getOptionalNumber(rawLap.average_speed);

  return {
    name: getText(rawLap.name),
    distanceM,
    elapsedTimeSec,
    movingTimeSec,
    averageSpeedMps,
    maxSpeedMps: getOptionalNumber(rawLap.max_speed),
    paceSecPerKm: getPaceSecPerKm({
      distanceM,
      elapsedTimeSec,
      movingTimeSec,
      averageSpeedMps,
    }),
    totalElevationGainM: getOptionalNumber(rawLap.total_elevation_gain),
    averageHeartRate: getOptionalNumber(rawLap.average_heartrate),
    maxHeartRate: getOptionalNumber(rawLap.max_heartrate),
    averageWatts: getOptionalNumber(rawLap.average_watts),
    averageCadence: getOptionalNumber(rawLap.average_cadence),
    lapIndex: getOptionalInteger(rawLap.lap_index),
    split: getOptionalInteger(rawLap.split),
    rawLap,
  };
}

function buildStravaBestEffort(rawEffort: Record<string, unknown>): StravaBestEffort {
  return {
    name: getText(rawEffort.name),
    distanceM: getOptionalNumber(rawEffort.distance),
    elapsedTimeSec: getOptionalInteger(rawEffort.elapsed_time),
    movingTimeSec: getOptionalInteger(rawEffort.moving_time),
    startDate: getText(rawEffort.start_date),
    prRank: getOptionalInteger(rawEffort.pr_rank),
    rawEffort,
  };
}

function buildStravaDetailedActivity(
  rawActivity: RawStravaDetailedActivity,
): StravaDetailedActivity {
  const summary = buildStravaSummaryActivity(rawActivity);
  const rawDetail = rawActivity as Record<string, unknown>;

  return {
    ...summary,
    achievementCount: getOptionalInteger(rawActivity.achievement_count),
    workoutType: getOptionalInteger(rawActivity.workout_type),
    averageSpeedMps: getOptionalNumber(rawActivity.average_speed),
    maxSpeedMps: getOptionalNumber(rawActivity.max_speed),
    perceivedExertion: getOptionalNumber(rawActivity.perceived_exertion),
    averageWatts: getOptionalNumber(rawActivity.average_watts),
    maxWatts: getOptionalNumber(rawActivity.max_watts),
    weightedAverageWatts: getOptionalNumber(rawActivity.weighted_average_watts),
    deviceWatts: getOptionalBoolean(rawActivity.device_watts),
    splitsMetric: getObjectArray(rawActivity.splits_metric).map(buildStravaActivitySplit),
    laps: getObjectArray(rawActivity.laps).map(buildStravaActivityLap),
    bestEfforts: getObjectArray(rawActivity.best_efforts).map(buildStravaBestEffort),
    rawDetail,
  };
}

function getStreamDataArray(
  rawStreams: Record<string, unknown>,
  key: StravaActivityStreamKey,
): unknown[] | null {
  const stream = rawStreams[key];

  if (!stream || typeof stream !== "object" || Array.isArray(stream)) {
    return null;
  }

  const data = (stream as Record<string, unknown>).data;

  return Array.isArray(data) ? data : null;
}

function getNumberStream(
  rawStreams: Record<string, unknown>,
  key: StravaActivityStreamKey,
): number[] | null {
  const data = getStreamDataArray(rawStreams, key);

  if (!data) {
    return null;
  }

  const numbers = data.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  return numbers.length === data.length ? numbers : null;
}

function getBooleanStream(
  rawStreams: Record<string, unknown>,
  key: StravaActivityStreamKey,
): boolean[] | null {
  const data = getStreamDataArray(rawStreams, key);

  if (!data) {
    return null;
  }

  const booleans = data.filter((value): value is boolean => typeof value === "boolean");

  return booleans.length === data.length ? booleans : null;
}

function buildStravaActivityStreams(
  rawStreams: Record<string, unknown>,
): StravaActivityStreams {
  return {
    time: getNumberStream(rawStreams, "time"),
    distance: getNumberStream(rawStreams, "distance"),
    heartrate: getNumberStream(rawStreams, "heartrate"),
    watts: getNumberStream(rawStreams, "watts"),
    velocitySmooth: getNumberStream(rawStreams, "velocity_smooth"),
    altitude: getNumberStream(rawStreams, "altitude"),
    gradeSmooth: getNumberStream(rawStreams, "grade_smooth"),
    cadence: getNumberStream(rawStreams, "cadence"),
    moving: getBooleanStream(rawStreams, "moving"),
    rawStreams,
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
  const detailedActivity = await fetchStravaActivityDetailById(input);

  return {
    id: detailedActivity.id,
    name: detailedActivity.name,
    sportType: detailedActivity.sportType,
    startDate: detailedActivity.startDate,
    startDateLocal: detailedActivity.startDateLocal,
    distanceM: detailedActivity.distanceM,
    movingTimeSec: detailedActivity.movingTimeSec,
    elapsedTimeSec: detailedActivity.elapsedTimeSec,
    totalElevationGainM: detailedActivity.totalElevationGainM,
    averageHeartRate: detailedActivity.averageHeartRate,
    maxHeartRate: detailedActivity.maxHeartRate,
    rawSummary: detailedActivity.rawSummary,
  };
}

export async function fetchStravaActivityDetailById(input: {
  accessToken: string;
  activityId: string | number;
  includeAllEfforts?: boolean;
  options?: Pick<StravaClientOptions, "fetchImpl"> & {
    baseUrl?: string;
  };
}): Promise<StravaDetailedActivity> {
  assertServerOnly();

  const fetchImpl = input.options?.fetchImpl ?? fetch;
  const baseUrl = input.options?.baseUrl ?? STRAVA_API_BASE_URL;
  const activityId = encodeURIComponent(
    getRequiredActivityIdText(input.activityId),
  );
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/activities/${activityId}`);

  if (input.includeAllEfforts) {
    url.searchParams.set("include_all_efforts", "true");
  }

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

  return buildStravaDetailedActivity(responseBody as RawStravaDetailedActivity);
}

export async function fetchStravaActivityStreams(input: {
  accessToken: string;
  activityId: string | number;
  keys?: StravaActivityStreamKey[];
  options?: Pick<StravaClientOptions, "fetchImpl"> & {
    baseUrl?: string;
  };
}): Promise<StravaActivityStreams> {
  assertServerOnly();

  const fetchImpl = input.options?.fetchImpl ?? fetch;
  const baseUrl = input.options?.baseUrl ?? STRAVA_API_BASE_URL;
  const activityId = encodeURIComponent(
    getRequiredActivityIdText(input.activityId),
  );
  const url = new URL(
    `${baseUrl.replace(/\/+$/, "")}/activities/${activityId}/streams`,
  );
  const keys = input.keys ?? [
    "time",
    "distance",
    "heartrate",
    "watts",
    "velocity_smooth",
    "altitude",
    "grade_smooth",
    "cadence",
    "moving",
  ];

  url.searchParams.set("keys", keys.join(","));
  url.searchParams.set("key_by_type", "true");

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

  const responseBody = await parseJsonObjectResponse(response, "activity streams");

  return buildStravaActivityStreams(responseBody);
}
