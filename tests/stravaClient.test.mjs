import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STRAVA_AUTHORIZATION_URL,
  STRAVA_API_BASE_URL,
  STRAVA_REQUESTED_SCOPE,
  STRAVA_TOKEN_URL,
  StravaApiError,
  buildSafeStravaAthleteSummary,
  buildStravaAuthorizationUrl,
  exchangeStravaCodeForToken,
  fetchRecentStravaActivities,
  fetchStravaActivityById,
  getStravaAthleteDisplayName,
  hasRequiredStravaScopes,
  refreshStravaAccessToken,
  shouldRefreshStravaToken,
} from "../lib/strava/client.ts";

const testConfig = {
  clientId: "12345",
  clientSecret: "super-secret-client-secret",
  appUrl: "http://localhost:3000",
  callbackUrl: "http://localhost:3000/api/strava/callback",
};

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

function createMockFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url: String(url),
      init,
    });

    return response;
  };

  return {
    calls,
    fetchImpl,
  };
}

describe("Strava client", () => {
  it("builds the Strava authorization URL", () => {
    const authorizationUrl = buildStravaAuthorizationUrl("state-123", {
      config: testConfig,
    });
    const parsedUrl = new URL(authorizationUrl);

    assert.equal(parsedUrl.origin + parsedUrl.pathname, STRAVA_AUTHORIZATION_URL);
    assert.equal(parsedUrl.searchParams.get("client_id"), "12345");
    assert.equal(
      parsedUrl.searchParams.get("redirect_uri"),
      "http://localhost:3000/api/strava/callback",
    );
    assert.equal(parsedUrl.searchParams.get("response_type"), "code");
    assert.equal(parsedUrl.searchParams.get("approval_prompt"), "auto");
    assert.equal(parsedUrl.searchParams.get("scope"), STRAVA_REQUESTED_SCOPE);
    assert.equal(parsedUrl.searchParams.get("state"), "state-123");
  });

  it("checks for the required Strava scopes", () => {
    assert.equal(hasRequiredStravaScopes("read,activity:read_all"), true);
    assert.equal(hasRequiredStravaScopes("activity:read_all,read"), true);
    assert.equal(hasRequiredStravaScopes("read,activity:read"), false);
    assert.equal(hasRequiredStravaScopes("read"), false);
  });

  it("exchanges an OAuth code for tokens with server-only credentials", async () => {
    const mockFetch = createMockFetch(
      jsonResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_at: 1770000000,
        athlete: {
          id: 987654,
          username: "example_runner",
          firstname: "Example",
          lastname: "Runner",
          profile: "https://example.com/profile.jpg",
        },
      }),
    );

    const tokenExchange = await exchangeStravaCodeForToken("oauth-code", {
      config: testConfig,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(tokenExchange.accessToken, "access-token");
    assert.equal(tokenExchange.refreshToken, "refresh-token");
    assert.equal(tokenExchange.tokenExpiresAt, "2026-02-02T02:40:00.000Z");
    assert.equal(tokenExchange.athlete.id, "987654");
    assert.equal(tokenExchange.athlete.username, "example_runner");
    assert.equal(mockFetch.calls.length, 1);
    assert.equal(mockFetch.calls[0].url, STRAVA_TOKEN_URL);
    assert.equal(mockFetch.calls[0].init.method, "POST");
    assert.equal(
      mockFetch.calls[0].init.headers["Content-Type"],
      "application/x-www-form-urlencoded",
    );

    const body = mockFetch.calls[0].init.body;
    assert.equal(body.get("client_id"), "12345");
    assert.equal(body.get("client_secret"), "super-secret-client-secret");
    assert.equal(body.get("code"), "oauth-code");
    assert.equal(body.get("grant_type"), "authorization_code");
  });

  it("throws a safe API error without exposing the client secret", async () => {
    const mockFetch = createMockFetch(
      jsonResponse(
        {
          message: "Bad Request",
        },
        {
          status: 400,
        },
      ),
    );

    let thrownError = null;

    try {
      await exchangeStravaCodeForToken("oauth-code", {
        config: testConfig,
        fetchImpl: mockFetch.fetchImpl,
      });
    } catch (error) {
      thrownError = error;
    }

    assert.ok(thrownError instanceof StravaApiError);
    assert.equal(thrownError.status, 400);
    assert.equal(thrownError.responseBody, "Bad Request");
    assert.doesNotMatch(thrownError.message, /super-secret-client-secret/);
  });

  it("refreshes an access token and stores the rotated refresh token", async () => {
    const mockFetch = createMockFetch(
      jsonResponse({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_at: 1770000000,
      }),
    );

    const refreshedToken = await refreshStravaAccessToken("old-refresh-token", {
      config: testConfig,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(refreshedToken.accessToken, "new-access-token");
    assert.equal(refreshedToken.refreshToken, "new-refresh-token");
    assert.equal(refreshedToken.tokenExpiresAt, "2026-02-02T02:40:00.000Z");
    assert.equal(mockFetch.calls[0].url, STRAVA_TOKEN_URL);
    assert.equal(mockFetch.calls[0].init.method, "POST");

    const body = mockFetch.calls[0].init.body;
    assert.equal(body.get("client_id"), "12345");
    assert.equal(body.get("client_secret"), "super-secret-client-secret");
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("refresh_token"), "old-refresh-token");
  });

  it("knows when a Strava token should be refreshed", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");

    assert.equal(
      shouldRefreshStravaToken("2026-01-01T12:30:00.000Z", now),
      true,
    );
    assert.equal(
      shouldRefreshStravaToken("2026-01-01T14:00:00.000Z", now),
      false,
    );
    assert.equal(shouldRefreshStravaToken("not-a-date", now), true);
  });

  it("fetches recent Strava activities with a bearer token", async () => {
    const mockFetch = createMockFetch(
      jsonResponse([
        {
          id: 123456789,
          name: "Morning Run",
          sport_type: "Run",
          start_date: "2026-05-18T11:00:00Z",
          start_date_local: "2026-05-18T07:00:00",
          distance: 8046.72,
          moving_time: 2700,
          elapsed_time: 2820,
          total_elevation_gain: 42.5,
          average_heartrate: 144.2,
          max_heartrate: 172,
        },
      ]),
    );

    const activities = await fetchRecentStravaActivities({
      accessToken: "access-token",
      afterEpochSeconds: 1770000000,
      options: {
        fetchImpl: mockFetch.fetchImpl,
      },
    });
    const requestedUrl = new URL(mockFetch.calls[0].url);

    assert.equal(
      requestedUrl.origin + requestedUrl.pathname,
      `${STRAVA_API_BASE_URL}/athlete/activities`,
    );
    assert.equal(requestedUrl.searchParams.get("after"), "1770000000");
    assert.equal(requestedUrl.searchParams.get("page"), "1");
    assert.equal(requestedUrl.searchParams.get("per_page"), "100");
    assert.equal(
      mockFetch.calls[0].init.headers.Authorization,
      "Bearer access-token",
    );
    assert.deepEqual(activities[0], {
      id: "123456789",
      name: "Morning Run",
      sportType: "Run",
      startDate: "2026-05-18T11:00:00Z",
      startDateLocal: "2026-05-18T07:00:00",
      distanceM: 8046.72,
      movingTimeSec: 2700,
      elapsedTimeSec: 2820,
      totalElevationGainM: 42.5,
      averageHeartRate: 144.2,
      maxHeartRate: 172,
      rawSummary: {
        id: 123456789,
        name: "Morning Run",
        sport_type: "Run",
        start_date: "2026-05-18T11:00:00Z",
        start_date_local: "2026-05-18T07:00:00",
        distance: 8046.72,
        moving_time: 2700,
        elapsed_time: 2820,
        total_elevation_gain: 42.5,
        average_heartrate: 144.2,
        max_heartrate: 172,
      },
    });
  });

  it("fetches one full Strava activity by activity id", async () => {
    const mockFetch = createMockFetch(
      jsonResponse({
        id: 123456789,
        name: "Lunch Run",
        sport_type: "Run",
        start_date: "2026-05-19T16:30:00Z",
        start_date_local: "2026-05-19T12:30:00",
        distance: 5000,
        moving_time: 1500,
        elapsed_time: 1560,
        total_elevation_gain: 18,
        average_heartrate: 142.5,
        max_heartrate: 170,
        perceived_exertion: 4,
      }),
    );

    const activity = await fetchStravaActivityById({
      accessToken: "access-token",
      activityId: 123456789,
      options: {
        fetchImpl: mockFetch.fetchImpl,
      },
    });
    const requestedUrl = new URL(mockFetch.calls[0].url);

    assert.equal(
      requestedUrl.origin + requestedUrl.pathname,
      `${STRAVA_API_BASE_URL}/activities/123456789`,
    );
    assert.equal(mockFetch.calls[0].init.method, "GET");
    assert.equal(
      mockFetch.calls[0].init.headers.Authorization,
      "Bearer access-token",
    );
    assert.deepEqual(activity, {
      id: "123456789",
      name: "Lunch Run",
      sportType: "Run",
      startDate: "2026-05-19T16:30:00Z",
      startDateLocal: "2026-05-19T12:30:00",
      distanceM: 5000,
      movingTimeSec: 1500,
      elapsedTimeSec: 1560,
      totalElevationGainM: 18,
      averageHeartRate: 142.5,
      maxHeartRate: 170,
      rawSummary: {
        id: 123456789,
        name: "Lunch Run",
        sport_type: "Run",
        start_date: "2026-05-19T16:30:00Z",
        start_date_local: "2026-05-19T12:30:00",
        distance: 5000,
        moving_time: 1500,
        elapsed_time: 1560,
        total_elevation_gain: 18,
        average_heartrate: 142.5,
        max_heartrate: 170,
        perceived_exertion: 4,
      },
    });
  });

  it("throws safe API errors when fetching one activity fails", async () => {
    for (const status of [401, 404, 429, 500]) {
      const mockFetch = createMockFetch(
        jsonResponse(
          {
            message: "Strava request failed",
          },
          {
            status,
          },
        ),
      );
      let thrownError = null;

      try {
        await fetchStravaActivityById({
          accessToken: "secret-access-token",
          activityId: 123456789,
          options: {
            fetchImpl: mockFetch.fetchImpl,
          },
        });
      } catch (error) {
        thrownError = error;
      }

      assert.ok(thrownError instanceof StravaApiError);
      assert.equal(thrownError.status, status);
      assert.equal(thrownError.responseBody, "Strava request failed");
      assert.doesNotMatch(thrownError.message, /secret-access-token/);
    }
  });

  it("builds safe athlete display information", () => {
    const athlete = buildSafeStravaAthleteSummary({
      id: "9007199254740993",
      username: "example_runner",
      firstname: "Example",
      lastname: "Runner",
      profile: "https://example.com/profile.jpg",
      city: "Toronto",
    });

    assert.deepEqual(athlete, {
      id: "9007199254740993",
      username: "example_runner",
      firstname: "Example",
      lastname: "Runner",
      profile: "https://example.com/profile.jpg",
      profileMedium: null,
      city: "Toronto",
      state: null,
      country: null,
    });
    assert.equal(getStravaAthleteDisplayName(athlete), "Example Runner");
  });
});
