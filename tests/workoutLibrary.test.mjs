import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getRoleForSubtype,
  getStressForSubtype,
  getWeeklyIntensityCaps,
  getWorkoutTypeForSubtype,
  resolveWorkoutPrescription,
} from "../lib/training/workoutLibrary.ts";

const baseContext = {
  subtype: "cruise_intervals",
  phase: "build",
  raceDistance: "marathon",
  weekNumber: 6,
  weeklyVolumeKm: 50,
  runDaysPerWeek: 5,
  longRunKm: 20,
  peakLongRunKm: 30,
  targetDistanceKm: 10,
  maxSessionDurationMin: null,
  dayLabel: "tuesday",
  terrain: "flat",
  flatRoutesAvailable: true,
  trailAccess: false,
  raceCourseLooksHilly: false,
  fitnessConfidence: "high",
  feasibilityRating: "ambitious",
  paces: {
    easySecPerKm: 360,
    thresholdSecPerKm: 315,
    currentRacePaceSecPerKm: 375,
    bridgeRacePaceSecPerKm: 350,
    goalRacePaceSecPerKm: 340,
  },
};

function context(overrides = {}) {
  return {
    ...baseContext,
    ...overrides,
    paces: {
      ...baseContext.paces,
      ...(overrides.paces ?? {}),
    },
  };
}

function hasNestedRepeats(steps) {
  return steps.some((step) => {
    if (!step.repeat) {
      return false;
    }

    return step.repeat.steps.some(
      (repeatStep) => Boolean(repeatStep.repeat) || hasNestedRepeats([repeatStep]),
    );
  });
}

function hasIncompleteLeafDuration(steps) {
  return steps.some((step) => {
    if (step.repeat) {
      return hasIncompleteLeafDuration(step.repeat.steps);
    }

    if (step.durationType === "open") {
      return true;
    }

    return !step.durationValue || !step.durationUnit;
  });
}

describe("workout library", () => {
  it("maps internal subtypes to DB-safe workout types and roles", () => {
    assert.equal(getWorkoutTypeForSubtype("cruise_intervals"), "tempo");
    assert.equal(getWorkoutTypeForSubtype("fartlek"), "easy");
    assert.equal(getWorkoutTypeForSubtype("hill_repeats"), "interval");
    assert.equal(getWorkoutTypeForSubtype("long_mp_blocks"), "long_run");
    assert.equal(getRoleForSubtype("hm_pace_blocks"), "race_pace");
    assert.equal(getStressForSubtype("fartlek"), "moderate");
  });

  it("computes spec intensity caps from weekly volume", () => {
    assert.deepEqual(getWeeklyIntensityCaps({ weeklyVolumeKm: 80 }), {
      thresholdCapKm: 8,
      vo2CapKm: 6.4,
      repetitionCapKm: 4,
    });
  });

  it("uses variable warmup, cooldown, recovery, and repeat values", () => {
    const smallerWorkout = resolveWorkoutPrescription(
      context({
        weeklyVolumeKm: 36,
        targetDistanceKm: 7,
      }),
    );
    const largerWorkout = resolveWorkoutPrescription(
      context({
        weeklyVolumeKm: 70,
        targetDistanceKm: 14,
      }),
    );

    assert.ok(largerWorkout.variables.warmupMin > smallerWorkout.variables.warmupMin);
    assert.ok(largerWorkout.variables.cooldownMin > smallerWorkout.variables.cooldownMin);
    assert.ok(largerWorkout.variables.workDurationMin > smallerWorkout.variables.workDurationMin);
    assert.ok(largerWorkout.variables.repeatCount >= smallerWorkout.variables.repeatCount);
  });

  it("respects max session duration by reducing duration and distance", () => {
    const uncappedWorkout = resolveWorkoutPrescription(
      context({
        subtype: "medium_long_steady",
        targetDistanceKm: 16,
        maxSessionDurationMin: null,
      }),
    );
    const cappedWorkout = resolveWorkoutPrescription(
      context({
        subtype: "medium_long_steady",
        targetDistanceKm: 16,
        maxSessionDurationMin: 65,
      }),
    );

    assert.equal(cappedWorkout.durationWasCapped, true);
    assert.equal(cappedWorkout.durationMin, 65);
    assert.ok(cappedWorkout.distanceKm < uncappedWorkout.distanceKm);
  });

  it("creates export-safe structured workouts without nested repeats", () => {
    const subtypes = [
      "easy_strides",
      "long_mp_blocks",
      "cruise_intervals",
      "continuous_tempo",
      "hm_pace_blocks",
      "vo2_intervals",
      "hill_repeats",
    ];

    for (const subtype of subtypes) {
      const workout = resolveWorkoutPrescription(context({ subtype }));

      assert.equal(workout.structuredWorkout.exportSafe, true);
      assert.deepEqual(workout.structuredWorkout.exportWarnings, []);
      assert.equal(hasNestedRepeats(workout.structuredWorkout.steps), false);
      assert.equal(hasIncompleteLeafDuration(workout.structuredWorkout.steps), false);
      assert.ok(
        workout.structuredWorkout.steps.some(
          (step) =>
            step.targetType === "pace" ||
            step.repeat?.steps.some((repeatStep) => repeatStep.targetType === "pace"),
        ),
      );
    }
  });
});
