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
  fetchStravaActivityDetailById,
  fetchStravaActivityStreams,
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

  it("fetches detailed activity evidence with efforts, splits, laps, and power fields", async () => {
    const mockFetch = createMockFetch(
      jsonResponse({
        id: 123456789,
        name: "Tempo Progression",
        sport_type: "Run",
        start_date: "2026-05-19T16:30:00Z",
        start_date_local: "2026-05-19T12:30:00",
        distance: 6000,
        moving_time: 1800,
        elapsed_time: 1860,
        total_elevation_gain: 22,
        average_heartrate: 158,
        max_heartrate: 181,
        achievement_count: 2,
        workout_type: 3,
        average_speed: 3.33,
        max_speed: 5.1,
        perceived_exertion: 8,
        average_watts: 260,
        max_watts: 420,
        weighted_average_watts: 278,
        device_watts: true,
        splits_metric: [
          {
            distance: 1000,
            moving_time: 310,
            elapsed_time: 315,
            average_speed: 3.23,
            elevation_difference: 4,
            split: 1,
          },
          {
            distance: 1000,
            moving_time: 280,
            elapsed_time: 282,
            average_speed: 3.57,
            elevation_difference: 2,
            split: 2,
          },
        ],
        laps: [
          {
            name: "Lap 1",
            distance: 2000,
            moving_time: 600,
            elapsed_time: 610,
            average_speed: 3.33,
            max_speed: 4.4,
            total_elevation_gain: 8,
            average_heartrate: 162,
            max_heartrate: 176,
            average_watts: 275,
            average_cadence: 86,
            lap_index: 1,
            split: 1,
          },
        ],
        best_efforts: [
          {
            name: "5k",
            distance: 5000,
            elapsed_time: 1450,
            moving_time: 1440,
            start_date: "2026-05-19T16:35:00Z",
            pr_rank: 1,
          },
        ],
      }),
    );

    const activity = await fetchStravaActivityDetailById({
      accessToken: "access-token",
      activityId: "123456789",
      includeAllEfforts: true,
      options: {
        fetchImpl: mockFetch.fetchImpl,
      },
    });
    const requestedUrl = new URL(mockFetch.calls[0].url);

    assert.equal(
      requestedUrl.origin + requestedUrl.pathname,
      `${STRAVA_API_BASE_URL}/activities/123456789`,
    );
    assert.equal(requestedUrl.searchParams.get("include_all_efforts"), "true");
    assert.equal(activity.achievementCount, 2);
    assert.equal(activity.workoutType, 3);
    assert.equal(activity.perceivedExertion, 8);
    assert.equal(activity.averageWatts, 260);
    assert.equal(activity.maxWatts, 420);
    assert.equal(activity.weightedAverageWatts, 278);
    assert.equal(activity.deviceWatts, true);
    assert.equal(activity.splitsMetric.length, 2);
    assert.equal(activity.splitsMetric[0].paceSecPerKm, 310);
    assert.equal(activity.laps.length, 1);
    assert.equal(activity.laps[0].averageHeartRate, 162);
    assert.equal(activity.laps[0].averageWatts, 275);
    assert.equal(activity.bestEfforts.length, 1);
    assert.equal(activity.bestEfforts[0].prRank, 1);
  });

  it("fetches activity streams with the export-safe evidence keys", async () => {
    const mockFetch = createMockFetch(
      jsonResponse({
        time: { data: [0, 60, 120] },
        distance: { data: [0, 250, 500] },
        heartrate: { data: [130, 145, 158] },
        watts: { data: [220, 260, 280] },
        velocity_smooth: { data: [3.8, 4.1, 4.2] },
        altitude: { data: [100, 105, 110] },
        grade_smooth: { data: [0, 1.5, -0.5] },
        cadence: { data: [82, 85, 86] },
        moving: { data: [true, true, true] },
      }),
    );

    const streams = await fetchStravaActivityStreams({
      accessToken: "access-token",
      activityId: 123456789,
      options: {
        fetchImpl: mockFetch.fetchImpl,
      },
    });
    const requestedUrl = new URL(mockFetch.calls[0].url);

    assert.equal(
      requestedUrl.origin + requestedUrl.pathname,
      `${STRAVA_API_BASE_URL}/activities/123456789/streams`,
    );
    assert.equal(
      requestedUrl.searchParams.get("keys"),
      "time,distance,heartrate,watts,velocity_smooth,altitude,grade_smooth,cadence,moving",
    );
    assert.equal(requestedUrl.searchParams.get("key_by_type"), "true");
    assert.deepEqual(streams.time, [0, 60, 120]);
    assert.deepEqual(streams.heartrate, [130, 145, 158]);
    assert.deepEqual(streams.watts, [220, 260, 280]);
    assert.deepEqual(streams.velocitySmooth, [3.8, 4.1, 4.2]);
    assert.deepEqual(streams.altitude, [100, 105, 110]);
    assert.deepEqual(streams.gradeSmooth, [0, 1.5, -0.5]);
    assert.deepEqual(streams.cadence, [82, 85, 86]);
    assert.deepEqual(streams.moving, [true, true, true]);
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

  it("throws safe API errors when fetching activity streams fails", async () => {
    for (const status of [401, 404, 429, 500]) {
      const mockFetch = createMockFetch(
        jsonResponse(
          {
            message: "Stream request failed",
          },
          {
            status,
          },
        ),
      );
      let thrownError = null;

      try {
        await fetchStravaActivityStreams({
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
      assert.equal(thrownError.responseBody, "Stream request failed");
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
