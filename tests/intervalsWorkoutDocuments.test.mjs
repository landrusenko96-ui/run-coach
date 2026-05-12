import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IntervalsWorkoutDocumentError,
  buildIntervalsCalendarEventPayload,
} from "../lib/intervals/workoutDocuments.ts";
import { buildStructuredWorkout } from "../lib/training/structuredWorkout.ts";

const baseWorkoutSource = {
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

function plannedWorkout(overrides = {}) {
  const source = {
    ...baseWorkoutSource,
    ...overrides,
  };

  return {
    id: overrides.id ?? "planned-workout-1",
    training_plan_id: "plan-1",
    profile_id: "profile-1",
    race_goal_id: "goal-1",
    workout_date: overrides.workout_date ?? "2026-05-12",
    week_number: 1,
    day_label: "tuesday",
    workout_type: source.workout_type,
    title: source.title,
    description: source.description,
    distance_km: source.distance_km,
    duration_min: source.duration_min,
    target_pace_min_sec_per_km: source.target_pace_min_sec_per_km,
    target_pace_max_sec_per_km: source.target_pace_max_sec_per_km,
    target_hr_zone: source.target_hr_zone,
    terrain: "flat",
    purpose: source.purpose,
    instructions: source.instructions,
    structured_workout:
      "structured_workout" in overrides
        ? overrides.structured_workout
        : buildStructuredWorkout(source),
    status: "planned",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  };
}

describe("buildIntervalsCalendarEventPayload", () => {
  it("builds an easy run event with HR target text and stable external id", () => {
    const payload = buildIntervalsCalendarEventPayload(plannedWorkout());

    assert.equal(payload.category, "WORKOUT");
    assert.equal(payload.type, "Run");
    assert.equal(payload.external_id, "planned-workout-1");
    assert.equal(payload.start_date_local, "2026-05-12T00:00:00");
    assert.equal(payload.name, "Easy run");
    assert.equal(payload.moving_time, 3000);
    assert.equal(payload.description, "- 8km Z2 HR");
    assert.doesNotMatch(payload.description, /\/km|pace/i);
  });

  it("formats distance-based steps as decimal kilometers, not raw meters", () => {
    const payload = buildIntervalsCalendarEventPayload(
      plannedWorkout({
        distance_km: 5.9,
        duration_min: 36,
      }),
    );

    assert.equal(payload.description, "- 5.9km Z2 HR");
    assert.doesNotMatch(payload.description, /5900m/);
  });

  it("builds a tempo run event with warmup, HR work, and cooldown", () => {
    const payload = buildIntervalsCalendarEventPayload(
      plannedWorkout({
        id: "tempo-1",
        workout_type: "tempo",
        title: "Tempo run",
        distance_km: 9,
        duration_min: 55,
        target_pace_min_sec_per_km: 320,
        target_pace_max_sec_per_km: 340,
        target_hr_zone: "Zone 3 to Zone 4",
      }),
    );

    assert.equal(payload.external_id, "tempo-1");
    assert.equal(payload.moving_time, 3300);
    assert.equal(
      payload.description,
      "Warmup\n\n- 10m Z2 HR\n\nTempo running\n\n- 35m Z3-Z4 HR\n\nCooldown\n\n- 10m Z2 HR",
    );
    assert.doesNotMatch(payload.description, /\/km|pace/i);
  });

  it("builds an interval workout event with a repeat block and HR targets", () => {
    const payload = buildIntervalsCalendarEventPayload(
      plannedWorkout({
        id: "interval-1",
        workout_type: "interval",
        title: "Interval session",
        distance_km: 8,
        duration_min: 45,
        target_pace_min_sec_per_km: 295,
        target_pace_max_sec_per_km: 315,
        target_hr_zone: "Zone 4",
      }),
    );

    assert.equal(payload.external_id, "interval-1");
    assert.equal(payload.moving_time, 2700);
    assert.equal(
      payload.description,
      "Warmup\n\n- 10m Z2 HR\n\n5x\n- 3m Z4 HR\n- 2m Z1-Z2 HR\n\nCooldown\n\n- 10m Z2 HR",
    );
    assert.doesNotMatch(payload.description, /\/km|pace/i);
  });

  it("builds a calibration workout event with controlled HR targets", () => {
    const payload = buildIntervalsCalendarEventPayload(
      plannedWorkout({
        id: "calibration-1",
        workout_type: "calibration",
        title: "Calibration run",
        distance_km: 5,
        duration_min: 40,
        target_pace_min_sec_per_km: 360,
        target_pace_max_sec_per_km: 405,
        target_hr_zone: "Zone 2 to low Zone 3",
      }),
    );

    assert.equal(payload.external_id, "calibration-1");
    assert.equal(payload.moving_time, 2400);
    assert.equal(
      payload.description,
      "Warmup\n\n- 10m Z2 HR\n\n- 20m Z2-Z3 HR\n\nCooldown\n\n- 10m Z2 HR",
    );
    assert.doesNotMatch(payload.description, /\/km|pace/i);
  });

  it("rejects planned workouts without a structured workout document", () => {
    assert.throws(
      () =>
        buildIntervalsCalendarEventPayload(
          plannedWorkout({
            structured_workout: null,
          }),
        ),
      IntervalsWorkoutDocumentError,
    );
  });

  it("rejects open-duration leaf steps", () => {
    const workout = plannedWorkout();
    workout.structured_workout = {
      ...workout.structured_workout,
      steps: [
        {
          ...workout.structured_workout.steps[0],
          durationType: "open",
          durationValue: undefined,
          durationUnit: undefined,
        },
      ],
    };

    assert.throws(
      () => buildIntervalsCalendarEventPayload(workout),
      /Open-duration workout steps/,
    );
  });
});
