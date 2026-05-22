import {
  fetchPrivateStravaConnectionForAthleteId,
  updateStravaConnectionTokens,
} from "../db/stravaConnections.ts";
import {
  StravaApiError,
  fetchStravaActivityById,
  refreshStravaAccessToken,
  shouldRefreshStravaToken,
  type StravaSummaryActivity,
} from "./client.ts";

type StravaConnectionClient = Parameters<
  typeof fetchPrivateStravaConnectionForAthleteId
>[0];
type PrivateStravaConnectionResult = Awaited<
  ReturnType<typeof fetchPrivateStravaConnectionForAthleteId>
>;

export type FetchWebhookStravaActivityStatus =
  | "fetched"
  | "missing_connection"
  | "refresh_failed"
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "api_error";

export type FetchWebhookStravaActivityResult =
  | {
      ok: true;
      status: "fetched";
      message: string;
      userId: string;
      activity: StravaSummaryActivity;
    }
  | {
      ok: false;
      status: Exclude<FetchWebhookStravaActivityStatus, "fetched">;
      message: string;
      userId: string | null;
      activity: null;
    };

export type FetchWebhookStravaActivityDependencies = {
  now?: Date;
  fetchConnection?: typeof fetchPrivateStravaConnectionForAthleteId;
  updateTokens?: typeof updateStravaConnectionTokens;
  refreshToken?: typeof refreshStravaAccessToken;
  fetchActivity?: typeof fetchStravaActivityById;
};

export type FetchWebhookStravaActivityInput = {
  supabase: StravaConnectionClient;
  ownerId: string | number;
  activityId: string | number;
  dependencies?: FetchWebhookStravaActivityDependencies;
};

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Strava webhook activity fetch can only run on the server.");
  }
}

function getPositiveIdText(value: string | number, fieldName: string): string {
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  throw new Error(`${fieldName} must be a positive Strava ID.`);
}

function buildFailureResult(input: {
  status: Exclude<FetchWebhookStravaActivityStatus, "fetched">;
  message: string;
  userId?: string | null;
}): FetchWebhookStravaActivityResult {
  return {
    ok: false,
    status: input.status,
    message: input.message,
    userId: input.userId ?? null,
    activity: null,
  };
}

function mapStravaFetchError(
  error: unknown,
  userId: string,
): FetchWebhookStravaActivityResult {
  if (error instanceof StravaApiError) {
    if (error.status === 401) {
      return buildFailureResult({
        status: "unauthorized",
        message: "Strava rejected the saved access token.",
        userId,
      });
    }

    if (error.status === 404) {
      return buildFailureResult({
        status: "not_found",
        message: "Strava activity was not found.",
        userId,
      });
    }

    if (error.status === 429) {
      return buildFailureResult({
        status: "rate_limited",
        message: "Strava rate limit was reached.",
        userId,
      });
    }
  }

  return buildFailureResult({
    status: "api_error",
    message: "Could not fetch Strava activity.",
    userId,
  });
}

export async function fetchWebhookStravaActivity(
  input: FetchWebhookStravaActivityInput,
): Promise<FetchWebhookStravaActivityResult> {
  assertServerOnly();

  const ownerId = getPositiveIdText(input.ownerId, "ownerId");
  const activityId = getPositiveIdText(input.activityId, "activityId");
  const dependencies = input.dependencies ?? {};
  const fetchConnection =
    dependencies.fetchConnection ?? fetchPrivateStravaConnectionForAthleteId;
  const updateTokens = dependencies.updateTokens ?? updateStravaConnectionTokens;
  const refreshToken = dependencies.refreshToken ?? refreshStravaAccessToken;
  const fetchActivity = dependencies.fetchActivity ?? fetchStravaActivityById;

  let connection: PrivateStravaConnectionResult;

  try {
    connection = await fetchConnection(input.supabase, ownerId);
  } catch {
    return buildFailureResult({
      status: "api_error",
      message: "Could not load the Strava connection.",
    });
  }

  if (!connection) {
    return buildFailureResult({
      status: "missing_connection",
      message: "No Strava connection was found for this webhook owner.",
    });
  }

  let accessToken = connection.accessToken;

  if (
    shouldRefreshStravaToken(
      connection.tokenExpiresAt,
      dependencies.now ?? new Date(),
    )
  ) {
    try {
      const refreshedToken = await refreshToken(connection.refreshToken);

      await updateTokens(input.supabase, {
        userId: connection.userId,
        accessToken: refreshedToken.accessToken,
        refreshToken: refreshedToken.refreshToken,
        tokenExpiresAt: refreshedToken.tokenExpiresAt,
      });

      accessToken = refreshedToken.accessToken;
    } catch {
      return buildFailureResult({
        status: "refresh_failed",
        message: "Could not refresh the Strava connection.",
        userId: connection.userId,
      });
    }
  }

  try {
    const activity = await fetchActivity({
      accessToken,
      activityId,
    });

    return {
      ok: true,
      status: "fetched",
      message: "Fetched Strava activity.",
      userId: connection.userId,
      activity,
    };
  } catch (error) {
    return mapStravaFetchError(error, connection.userId);
  }
}
