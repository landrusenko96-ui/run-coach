import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStructuredWorkout } from "../lib/training/structuredWorkout.ts";

const baseWorkout = {
  workout_type: "easy",
  title: "Easy run",
  description: "Comfortable aerobic running.",
  distance_km: 8,
  duration_min: 50,
  target_pace_min_sec_per_km: 360,
  target_pace_max_sec_per_km: 405,
  target_hr_zone: "Zone 2",
  purpose: "Build aerobic base.",
  instructions: "Keep the effort conversational.",
};

function workout(overrides = {}) {
  return {
    ...baseWorkout,
    ...overrides,
  };
}

describe("buildStructuredWorkout", () => {
  it("builds a simple paced run from flat planned workout fields", () => {
    const structuredWorkout = buildStructuredWorkout(workout());

    assert.equal(structuredWorkout.version, 1);
    assert.equal(structuredWorkout.sport, "Run");
    assert.equal(structuredWorkout.name, "Easy run");
    assert.equal(structuredWorkout.exportSafe, true);
    assert.deepEqual(structuredWorkout.exportWarnings, []);
    assert.equal(structuredWorkout.steps.length, 1);
    assert.deepEqual(structuredWorkout.steps[0], {
      id: "easy-main",
      type: "work",
      name: "Easy run",
      durationType: "distance",
      durationValue: 8000,
      durationUnit: "meters",
      targetType: "pace",
      targetMin: 360,
      targetMax: 405,
      targetUnit: "sec_per_km",
      notes: "Keep the effort conversational.",
    });
  });

  it("uses no target and no notes when pace is unavailable", () => {
    const structuredWorkout = buildStructuredWorkout(
      workout({
        workout_type: "recovery",
        title: "Recovery run",
        target_pace_min_sec_per_km: null,
        target_pace_max_sec_per_km: null,
        target_hr_zone: "Zone 1 to Zone 2",
      }),
    );

    assert.equal(structuredWorkout.steps[0].targetType, "none");
    assert.equal(structuredWorkout.steps[0].targetMin, undefined);
    assert.equal(structuredWorkout.steps[0].targetMax, undefined);
    assert.equal(structuredWorkout.steps[0].targetUnit, undefined);
    assert.equal(structuredWorkout.steps[0].notes, undefined);
    assert.equal(structuredWorkout.exportSafe, false);
    assert.match(structuredWorkout.exportWarnings.join(" "), /Missing planned pace/);
  });

  it("marks open-duration primary steps as not export-safe", () => {
    const structuredWorkout = buildStructuredWorkout(
      workout({
        distance_km: null,
        duration_min: null,
      }),
    );

    assert.equal(structuredWorkout.steps[0].durationType, "open");
    assert.equal(structuredWorkout.exportSafe, false);
    assert.match(structuredWorkout.exportWarnings.join(" "), /Open-ended/);
  });

  it("builds warmup, work, and cooldown steps for calibration runs", () => {
    const structuredWorkout = buildStructuredWorkout(
      workout({
        workout_type: "calibration",
        title: "Calibration run",
        distance_km: 5,
        duration_min: 40,
        target_pace_min_sec_per_km: 360,
        target_pace_max_sec_per_km: 405,
      }),
    );

    assert.deepEqual(
      structuredWorkout.steps.map((step) => step.type),
      ["warmup", "work", "cooldown"],
    );
    assert.equal(structuredWorkout.steps[0].durationValue, 600);
    assert.equal(structuredWorkout.steps[1].name, "Steady calibration effort");
    assert.equal(structuredWorkout.steps[1].durationValue, 1200);
    assert.equal(structuredWorkout.steps[2].durationValue, 600);
    assert.equal(structuredWorkout.exportSafe, true);
    assert.deepEqual(structuredWorkout.exportWarnings, []);
  });

  it("builds warmup, work, and cooldown steps for tempo runs", () => {
    const structuredWorkout = buildStructuredWorkout(
      workout({
        workout_type: "tempo",
        title: "Tempo run",
        distance_km: 9,
        duration_min: 55,
        target_pace_min_sec_per_km: 320,
        target_pace_max_sec_per_km: 340,
      }),
    );

    assert.deepEqual(
      structuredWorkout.steps.map((step) => step.type),
      ["warmup", "work", "cooldown"],
    );
    assert.equal(structuredWorkout.steps[1].name, "Tempo running");
    assert.equal(structuredWorkout.steps[1].durationType, "time");
    assert.equal(structuredWorkout.steps[1].durationValue, 2100);
    assert.equal(structuredWorkout.steps[1].targetType, "pace");
    assert.equal(structuredWorkout.exportSafe, true);
    assert.deepEqual(structuredWorkout.exportWarnings, []);
  });

  it("uses a repeat block for interval workouts", () => {
    const structuredWorkout = buildStructuredWorkout(
      workout({
        workout_type: "interval",
        title: "Interval run",
        distance_km: 8,
        duration_min: 45,
        target_pace_min_sec_per_km: 295,
        target_pace_max_sec_per_km: 315,
      }),
    );
    const repeatStep = structuredWorkout.steps[1];

    assert.equal(repeatStep.id, "interval-repeat");
    assert.equal(repeatStep.repeat.count, 5);
    assert.deepEqual(
      repeatStep.repeat.steps.map((step) => step.type),
      ["work", "recovery"],
    );
    assert.equal(repeatStep.repeat.steps[0].durationValue, 180);
    assert.equal(repeatStep.repeat.steps[0].targetType, "pace");
    assert.equal(structuredWorkout.exportSafe, true);
    assert.deepEqual(structuredWorkout.exportWarnings, []);
  });

  it("does not build structured workouts for non-run plan rows", () => {
    assert.equal(
      buildStructuredWorkout(
        workout({
          workout_type: "rest",
          title: "Rest day",
          distance_km: null,
          duration_min: null,
          target_pace_min_sec_per_km: null,
          target_pace_max_sec_per_km: null,
          target_hr_zone: null,
        }),
      ),
      null,
    );
  });
});
