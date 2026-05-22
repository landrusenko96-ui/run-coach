import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StravaApiError } from "../lib/strava/client.ts";
import { fetchWebhookStravaActivity } from "../lib/strava/fetchWebhookStravaActivity.ts";

const supabase = {};
const now = new Date("2026-05-20T12:00:00.000Z");

const testActivity = {
  id: "123456789",
  name: "Morning Run",
  sportType: "Run",
  startDate: "2026-05-20T11:00:00Z",
  startDateLocal: "2026-05-20T07:00:00",
  distanceM: 8046.72,
  movingTimeSec: 2700,
  elapsedTimeSec: 2820,
  totalElevationGainM: 42.5,
  averageHeartRate: 144.2,
  maxHeartRate: 172,
  rawSummary: {
    id: 123456789,
    name: "Morning Run",
  },
};

function testConnection(overrides = {}) {
  return {
    id: "connection-1",
    athlete: {
      stravaAthleteId: "987654321",
      displayName: "Example Runner",
      username: "example_runner",
      profileUrl: null,
    },
    scope: "read,activity:read_all",
    tokenExpiresAt: "2026-05-20T14:00:00.000Z",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    userId: "user-1",
    accessToken: "old-access-token",
    refreshToken: "old-refresh-token",
    ...overrides,
  };
}

function createDependencies({
  connection = testConnection(),
  refreshError = null,
  fetchError = null,
} = {}) {
  const calls = [];

  return {
    calls,
    dependencies: {
      now,
      fetchConnection: async (client, ownerId) => {
        calls.push({ operation: "fetchConnection", client, ownerId });

        return connection;
      },
      updateTokens: async (client, input) => {
        calls.push({ operation: "updateTokens", client, input });
      },
      refreshToken: async (refreshToken) => {
        calls.push({ operation: "refreshToken", refreshToken });

        if (refreshError) {
          throw refreshError;
        }

        return {
          accessToken: "new-access-token",
          refreshToken: "new-refresh-token",
          tokenExpiresAt: "2026-05-20T15:00:00.000Z",
        };
      },
      fetchActivity: async (input) => {
        calls.push({ operation: "fetchActivity", input });

        if (fetchError) {
          throw fetchError;
        }

        return testActivity;
      },
    },
  };
}

describe("Strava webhook activity fetch helper", () => {
  it("returns missing_connection when no saved Strava connection matches owner_id", async () => {
    const { calls, dependencies } = createDependencies({
      connection: null,
    });

    const result = await fetchWebhookStravaActivity({
      supabase,
      ownerId: 987654321,
      activityId: 123456789,
      dependencies,
    });

    assert.deepEqual(result, {
      ok: false,
      status: "missing_connection",
      message: "No Strava connection was found for this webhook owner.",
      userId: null,
      activity: null,
    });
    assert.deepEqual(
      calls.map((call) => call.operation),
      ["fetchConnection"],
    );
  });

  it("fetches a single activity with an unexpired token", async () => {
    const { calls, dependencies } = createDependencies();

    const result = await fetchWebhookStravaActivity({
      supabase,
      ownerId: 987654321,
      activityId: 123456789,
      dependencies,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "fetched");
    assert.equal(result.userId, "user-1");
    assert.deepEqual(result.activity, testActivity);
    assert.deepEqual(
      calls.map((call) => call.operation),
      ["fetchConnection", "fetchActivity"],
    );
    assert.equal(calls[0].ownerId, "987654321");
    assert.deepEqual(calls[1].input, {
      accessToken: "old-access-token",
      activityId: "123456789",
    });
  });

  it("refreshes an expired token, saves it, then fetches the activity", async () => {
    const { calls, dependencies } = createDependencies({
      connection: testConnection({
        tokenExpiresAt: "2026-05-20T12:30:00.000Z",
      }),
    });

    const result = await fetchWebhookStravaActivity({
      supabase,
      ownerId: 987654321,
      activityId: 123456789,
      dependencies,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(
      calls.map((call) => call.operation),
      ["fetchConnection", "refreshToken", "updateTokens", "fetchActivity"],
    );
    assert.equal(calls[1].refreshToken, "old-refresh-token");
    assert.deepEqual(calls[2].input, {
      userId: "user-1",
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      tokenExpiresAt: "2026-05-20T15:00:00.000Z",
    });
    assert.equal(calls[3].input.accessToken, "new-access-token");
  });

  it("returns refresh_failed when token refresh fails", async () => {
    const { calls, dependencies } = createDependencies({
      connection: testConnection({
        tokenExpiresAt: "2026-05-20T12:30:00.000Z",
      }),
      refreshError: new Error("invalid refresh token"),
    });

    const result = await fetchWebhookStravaActivity({
      supabase,
      ownerId: 987654321,
      activityId: 123456789,
      dependencies,
    });

    assert.deepEqual(result, {
      ok: false,
      status: "refresh_failed",
      message: "Could not refresh the Strava connection.",
      userId: "user-1",
      activity: null,
    });
    assert.deepEqual(
      calls.map((call) => call.operation),
      ["fetchConnection", "refreshToken"],
    );
  });

  it("maps Strava API failures to safe statuses", async () => {
    const cases = [
      { statusCode: 401, expectedStatus: "unauthorized" },
      { statusCode: 404, expectedStatus: "not_found" },
      { statusCode: 429, expectedStatus: "rate_limited" },
      { statusCode: 500, expectedStatus: "api_error" },
    ];

    for (const { statusCode, expectedStatus } of cases) {
      const { dependencies } = createDependencies({
        fetchError: new StravaApiError({
          status: statusCode,
          responseBody: "Strava error",
        }),
      });

      const result = await fetchWebhookStravaActivity({
        supabase,
        ownerId: 987654321,
        activityId: 123456789,
        dependencies,
      });

      assert.equal(result.ok, false);
      assert.equal(result.status, expectedStatus);
      assert.equal(result.userId, "user-1");
      assert.equal(result.activity, null);
      assert.doesNotMatch(result.message, /old-access-token|old-refresh-token/);
    }
  });

  it("returns a token-free generic error for non-Strava fetch failures", async () => {
    const { dependencies } = createDependencies({
      fetchError: new Error("network failed for old-access-token"),
    });

    const result = await fetchWebhookStravaActivity({
      supabase,
      ownerId: 987654321,
      activityId: 123456789,
      dependencies,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "api_error");
    assert.equal(result.message, "Could not fetch Strava activity.");
    assert.doesNotMatch(result.message, /old-access-token/);
  });
});
