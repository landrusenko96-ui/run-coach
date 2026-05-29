import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getIntensityBucketForSubtype,
  summarizePlanIntensity,
  summarizeWeeklyIntensity,
} from "../lib/training/loadRisk.ts";

const baseVariables = {
  sessionDurationMin: 60,
  warmupMin: 10,
  cooldownMin: 10,
  workDurationMin: 20,
  recoveryMin: 2,
  repeatCount: 4,
  thresholdCapKm: 5,
  vo2CapKm: 4,
  repetitionCapKm: 2.5,
};

function workout(overrides = {}) {
  return {
    subtype: "cruise_intervals",
    role: "threshold",
    stress: "hard",
    distanceKm: 10,
    durationMin: 60,
    targetPaceMaxSecPerKm: 300,
    terrain: "flat",
    ...overrides,
    variables: {
      ...baseVariables,
      ...(overrides.variables ?? {}),
    },
  };
}

describe("training load risk helpers", () => {
  it("maps workout subtypes into intensity buckets", () => {
    assert.equal(getIntensityBucketForSubtype("easy_base"), "easy");
    assert.equal(getIntensityBucketForSubtype("steady_aerobic"), "moderate");
    assert.equal(getIntensityBucketForSubtype("long_mp_blocks"), "moderate");
    assert.equal(getIntensityBucketForSubtype("cruise_intervals"), "threshold");
    assert.equal(getIntensityBucketForSubtype("vo2_intervals"), "vo2");
    assert.equal(getIntensityBucketForSubtype("hill_repeats"), "vo2");
    assert.equal(getIntensityBucketForSubtype("easy_strides"), "repetition");
    assert.equal(getIntensityBucketForSubtype("fartlek"), "repetition");
  });

  it("summarizes weekly easy, moderate, threshold, VO2, repetition, and hill load", () => {
    const summary = summarizeWeeklyIntensity({
      weekNumber: 5,
      volumeKm: 50,
      workouts: [
        workout({
          subtype: "easy_base",
          role: "easy",
          stress: "easy",
          distanceKm: 8,
          variables: { workDurationMin: 0 },
        }),
        workout(),
        workout({
          subtype: "vo2_intervals",
          role: "interval",
          distanceKm: 8,
          variables: { workDurationMin: 16 },
        }),
        workout({
          subtype: "hill_strides",
          role: "easy",
          stress: "easy",
          distanceKm: 7,
          terrain: "hills",
          variables: { workDurationMin: 3 },
        }),
        workout({
          subtype: "long_steady_finish",
          role: "long_steady",
          stress: "moderate",
          distanceKm: 18,
          durationMin: 120,
          targetPaceMaxSecPerKm: 360,
          terrain: "hills",
          variables: { workDurationMin: 24 },
        }),
      ],
    });

    assert.equal(summary.weekNumber, 5);
    assert.ok(summary.easyKm > summary.hardKm);
    assert.ok(summary.moderateKm > 0);
    assert.ok(summary.thresholdKm > 0);
    assert.ok(summary.vo2Km > 0);
    assert.ok(summary.repetitionKm > 0);
    assert.ok(summary.hillLoadKm > 0);
    assert.equal(summary.thresholdCapKm, 5);
    assert.equal(summary.vo2CapKm, 4);
    assert.equal(summary.repetitionCapKm, 2.5);
  });

  it("flags cap excess and rolls weekly summaries into a whole-plan summary", () => {
    const overloadedWeek = summarizeWeeklyIntensity({
      weekNumber: 1,
      volumeKm: 30,
      workouts: [
        workout({
          distanceKm: 12,
          targetPaceMaxSecPerKm: 240,
          variables: { workDurationMin: 20 },
        }),
      ],
    });
    const easyWeek = summarizeWeeklyIntensity({
      weekNumber: 2,
      volumeKm: 30,
      workouts: [
        workout({
          subtype: "long_easy",
          role: "long_easy",
          stress: "moderate",
          distanceKm: 14,
          variables: { workDurationMin: 0 },
        }),
      ],
    });
    const planSummary = summarizePlanIntensity([overloadedWeek, easyWeek]);

    assert.ok(overloadedWeek.loadRiskFlags.includes("threshold_cap_exceeded"));
    assert.equal(planSummary.weekCount, 2);
    assert.ok(planSummary.totalRunKm > overloadedWeek.totalRunKm);
    assert.ok(planSummary.easyShare > overloadedWeek.easyShare);
  });
});
