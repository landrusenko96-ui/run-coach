import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INTERVALS_API_BASE_URL,
  IntervalsApiError,
  bulkDeleteCalendarEvents,
  bulkUpsertCalendarEvents,
  testIntervalsConnection,
} from "../lib/intervals/client.ts";

const testConfig = {
  athleteId: "i12345",
  apiKey: "test-api-key",
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

function getAuthorizationHeader(call) {
  return call.init.headers.Authorization;
}

describe("Intervals.icu client", () => {
  it("tests the connection by fetching athlete info with basic auth", async () => {
    const mockFetch = createMockFetch(
      jsonResponse({
        id: "i12345",
        name: "Example Runner",
      }),
    );

    const athleteInfo = await testIntervalsConnection({
      config: testConfig,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.deepEqual(athleteInfo, {
      id: "i12345",
      name: "Example Runner",
    });
    assert.equal(mockFetch.calls.length, 1);
    assert.equal(
      mockFetch.calls[0].url,
      `${INTERVALS_API_BASE_URL}/athlete/i12345`,
    );
    assert.equal(mockFetch.calls[0].init.method, "GET");
    assert.equal(
      getAuthorizationHeader(mockFetch.calls[0]),
      `Basic ${Buffer.from("API_KEY:test-api-key", "utf8").toString("base64")}`,
    );
  });

  it("bulk upserts calendar events with JSON payloads", async () => {
    const event = {
      category: "WORKOUT",
      start_date_local: "2026-05-12T00:00:00",
      name: "Easy run",
      description: "Warmup\n\n- 30m Z2",
      type: "Run",
      external_id: "planned-workout-1",
    };
    const mockFetch = createMockFetch(
      jsonResponse([
        {
          ...event,
          id: 123,
        },
      ]),
    );

    const savedEvents = await bulkUpsertCalendarEvents([event], {
      config: testConfig,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(savedEvents[0].id, 123);
    assert.equal(mockFetch.calls.length, 1);
    assert.equal(
      mockFetch.calls[0].url,
      `${INTERVALS_API_BASE_URL}/athlete/i12345/events/bulk?upsert=true`,
    );
    assert.equal(mockFetch.calls[0].init.method, "POST");
    assert.equal(mockFetch.calls[0].init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(mockFetch.calls[0].init.body), [event]);
  });

  it("bulk deletes calendar events with external ids or Intervals event ids", async () => {
    const deleteInputs = [
      {
        external_id: "planned-workout-1",
      },
      {
        id: 123,
      },
    ];
    const mockFetch = createMockFetch(jsonResponse(2));

    const deletedCount = await bulkDeleteCalendarEvents(deleteInputs, {
      config: testConfig,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(deletedCount, 2);
    assert.equal(mockFetch.calls.length, 1);
    assert.equal(
      mockFetch.calls[0].url,
      `${INTERVALS_API_BASE_URL}/athlete/i12345/events/bulk-delete`,
    );
    assert.equal(mockFetch.calls[0].init.method, "PUT");
    assert.deepEqual(JSON.parse(mockFetch.calls[0].init.body), deleteInputs);
  });

  it("throws a safe API error for non-2xx responses", async () => {
    const mockFetch = createMockFetch(
      jsonResponse(
        {
          message: "Unauthorized",
        },
        {
          status: 401,
        },
      ),
    );

    let thrownError = null;

    try {
      await testIntervalsConnection({
        config: {
          athleteId: "i12345",
          apiKey: "super-secret-key",
        },
        fetchImpl: mockFetch.fetchImpl,
      });
    } catch (error) {
      thrownError = error;
    }

    assert.ok(thrownError instanceof IntervalsApiError);
    assert.equal(thrownError.status, 401);
    assert.equal(thrownError.path, "/athlete/i12345");
    assert.equal(thrownError.responseBody, "Unauthorized");
    assert.match(thrownError.message, /Unauthorized/);
    assert.doesNotMatch(thrownError.message, /super-secret-key/);
  });

  it("requires an athlete id for MVP calls", async () => {
    await assert.rejects(
      () =>
        testIntervalsConnection({
          config: {
            athleteId: null,
            apiKey: "test-api-key",
          },
          fetchImpl: async () => jsonResponse({}),
        }),
      /Missing INTERVALS_ATHLETE_ID/,
    );
  });
});
