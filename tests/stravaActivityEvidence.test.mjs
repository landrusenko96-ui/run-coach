import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStravaActivityEvidence,
  enrichStravaActivitiesForPlanHistory,
  isEnrichedStravaRawSummary,
} from "../lib/strava/activityEvidence.ts";

function makeSummary(overrides = {}) {
  return {
    id: overrides.id ?? "activity-1",
    name: overrides.name ?? "Morning Run",
    sportType: overrides.sportType ?? "Run",
    startDate: overrides.startDate ?? "2030-03-08T12:00:00Z",
    startDateLocal: overrides.startDateLocal ?? "2030-03-08T08:00:00",
    distanceM: overrides.distanceM ?? 8000,
    movingTimeSec: overrides.movingTimeSec ?? 2880,
    elapsedTimeSec: overrides.elapsedTimeSec ?? 2940,
    totalElevationGainM: overrides.totalElevationGainM ?? 65,
    averageHeartRate: overrides.averageHeartRate ?? 145,
    maxHeartRate: overrides.maxHeartRate ?? 168,
    rawSummary: overrides.rawSummary ?? { id: overrides.id ?? "activity-1" },
  };
}

function makeDetail(summary, overrides = {}) {
  return {
    ...summary,
    achievementCount: overrides.achievementCount ?? 0,
    workoutType: overrides.workoutType ?? null,
    averageSpeedMps: overrides.averageSpeedMps ?? null,
    maxSpeedMps: overrides.maxSpeedMps ?? null,
    perceivedExertion: overrides.perceivedExertion ?? null,
    averageWatts: overrides.averageWatts ?? null,
    maxWatts: overrides.maxWatts ?? null,
    weightedAverageWatts: overrides.weightedAverageWatts ?? null,
    deviceWatts: overrides.deviceWatts ?? null,
    splitsMetric: overrides.splitsMetric ?? [],
    laps: overrides.laps ?? [],
    bestEfforts: overrides.bestEfforts ?? [],
    rawDetail: overrides.rawDetail ?? { id: summary.id, detailed: true },
  };
}

function makeStreams(overrides = {}) {
  return {
    time: overrides.time ?? [0, 600, 1200, 1800],
    distance: overrides.distance ?? [0, 2000, 4000, 6000],
    heartrate: overrides.heartrate ?? [145, 160, 172, 178],
    watts: overrides.watts ?? [230, 280, 310, 320],
    velocitySmooth: overrides.velocitySmooth ?? [3.5, 4, 4.2, 4.1],
    altitude: overrides.altitude ?? [100, 120, 115, 130],
    gradeSmooth: overrides.gradeSmooth ?? [0, 2, -1, 3],
    cadence: overrides.cadence ?? [82, 86, 88, 87],
    moving: overrides.moving ?? [true, true, true, true],
    rawStreams: overrides.rawStreams ?? { time: { data: [0, 600, 1200, 1800] } },
  };
}

describe("Strava activity evidence", () => {
  it("summarizes PR, effort, HR, power, elevation, and split signals", () => {
    const summary = makeSummary({
      id: "race-1",
      name: "5K Race PR",
      distanceM: 5000,
      movingTimeSec: 1200,
    });
    const evidence = buildStravaActivityEvidence({
      summary,
      detail: makeDetail(summary, {
        achievementCount: 3,
        workoutType: 1,
        perceivedExertion: 9,
        averageWatts: 310,
        weightedAverageWatts: 320,
        splitsMetric: [
          { distanceM: 1000, movingTimeSec: 255, elapsedTimeSec: 255, averageSpeedMps: null, paceSecPerKm: 255, elevationDifferenceM: 1, split: 1, rawSplit: {} },
          { distanceM: 1000, movingTimeSec: 238, elapsedTimeSec: 238, averageSpeedMps: null, paceSecPerKm: 238, elevationDifferenceM: 0, split: 2, rawSplit: {} },
          { distanceM: 1000, movingTimeSec: 232, elapsedTimeSec: 232, averageSpeedMps: null, paceSecPerKm: 232, elevationDifferenceM: 0, split: 3, rawSplit: {} },
        ],
        bestEfforts: [
          { name: "5k", distanceM: 5000, elapsedTimeSec: 1200, movingTimeSec: 1200, startDate: null, prRank: 1, rawEffort: {} },
        ],
      }),
      streams: makeStreams(),
    });

    assert.equal(evidence.stravaActivityId, "race-1");
    assert.equal(evidence.hasDetail, true);
    assert.equal(evidence.hasStreams, true);
    assert.equal(evidence.hasHeartRateStream, true);
    assert.equal(evidence.hasPowerStream, true);
    assert.equal(evidence.prCount, 1);
    assert.equal(evidence.bestEffortCount, 1);
    assert.equal(evidence.perceivedExertion, 9);
    assert.equal(evidence.classificationHint, "race_time_trial");
    assert.equal(evidence.altitudeRangeM, 30);
    assert.equal(evidence.gradeRangePercent, 4);
    assert.ok(
      evidence.effortSignals.some((signal) =>
        signal.includes("Strava PR/best-effort"),
      ),
    );
  });

  it("keeps near-max evidence separate from explicit race or time-trial evidence", () => {
    const summary = makeSummary({
      id: "near-max-1",
      name: "Hard 5K Best Effort",
      distanceM: 5000,
      movingTimeSec: 1250,
    });
    const evidence = buildStravaActivityEvidence({
      summary,
      detail: makeDetail(summary, {
        achievementCount: 2,
        perceivedExertion: 9,
        splitsMetric: [
          { distanceM: 1000, movingTimeSec: 255, elapsedTimeSec: 255, averageSpeedMps: null, paceSecPerKm: 255, elevationDifferenceM: 1, split: 1, rawSplit: {} },
          { distanceM: 1000, movingTimeSec: 242, elapsedTimeSec: 242, averageSpeedMps: null, paceSecPerKm: 242, elevationDifferenceM: 0, split: 2, rawSplit: {} },
          { distanceM: 1000, movingTimeSec: 240, elapsedTimeSec: 240, averageSpeedMps: null, paceSecPerKm: 240, elevationDifferenceM: 0, split: 3, rawSplit: {} },
        ],
        bestEfforts: [
          { name: "5k", distanceM: 5000, elapsedTimeSec: 1250, movingTimeSec: 1250, startDate: null, prRank: 2, rawEffort: {} },
        ],
      }),
      streams: makeStreams(),
    });

    assert.equal(evidence.classificationHint, "possible_near_max");
  });

  it("enriches only eligible six-week run activities and stores compact evidence in raw summary", async () => {
    const activities = [
      makeSummary({ id: "run-1", sportType: "Run", startDateLocal: "2030-03-08T08:00:00" }),
      makeSummary({ id: "ride-1", sportType: "Ride", startDateLocal: "2030-03-09T08:00:00" }),
      makeSummary({ id: "invalid-1", distanceM: 0, movingTimeSec: 0 }),
      makeSummary({ id: "old-1", startDateLocal: "2030-01-01T08:00:00" }),
    ];
    const detailCalls = [];
    const streamCalls = [];
    const result = await enrichStravaActivitiesForPlanHistory({
      activities,
      accessToken: "access-token",
      windowStartDate: "2030-03-01",
      windowEndDate: "2030-04-11",
      fetchActivityDetail: async (input) => {
        detailCalls.push(input);
        return makeDetail(activities[0], {
          rawDetail: { id: "run-1", detailed: true },
        });
      },
      fetchActivityStreams: async (input) => {
        streamCalls.push(input);
        return makeStreams({
          rawStreams: { heartrate: { data: [130, 140] } },
        });
      },
    });

    assert.equal(detailCalls.length, 1);
    assert.equal(streamCalls.length, 1);
    assert.deepEqual(streamCalls[0].keys, [
      "time",
      "distance",
      "heartrate",
      "watts",
      "velocity_smooth",
      "altitude",
      "grade_smooth",
      "cadence",
      "moving",
    ]);
    assert.equal(result.evidence.length, 1);
    assert.equal(result.activities.length, 4);
    assert.equal(isEnrichedStravaRawSummary(result.activities[0].rawSummary), true);
    assert.equal(result.activities[0].rawSummary.detail.detailed, true);
    assert.equal(result.activities[0].rawSummary.evidence.stravaActivityId, "run-1");
    assert.deepEqual(result.activities[1], activities[1]);
  });

  it("keeps generation usable when one detail or stream request fails", async () => {
    const activities = [
      makeSummary({ id: "run-1" }),
      makeSummary({ id: "run-2", startDateLocal: "2030-03-09T08:00:00" }),
    ];
    const result = await enrichStravaActivitiesForPlanHistory({
      activities,
      accessToken: "access-token",
      windowStartDate: "2030-03-01",
      windowEndDate: "2030-04-11",
      fetchActivityDetail: async (input) => {
        if (input.activityId === "run-1") {
          throw new Error("detail failed");
        }

        return makeDetail(activities[1]);
      },
      fetchActivityStreams: async (input) => {
        if (input.activityId === "run-2") {
          throw new Error("stream failed");
        }

        return makeStreams();
      },
    });

    assert.equal(result.activities.length, 2);
    assert.equal(result.evidence.length, 2);
    assert.equal(result.warnings.length, 2);
    assert.ok(
      result.warnings.some((warning) =>
        warning.includes("Could not fetch Strava detail for activity run-1"),
      ),
    );
    assert.ok(
      result.warnings.some((warning) =>
        warning.includes("Could not fetch Strava streams for activity run-2"),
      ),
    );
  });
});
