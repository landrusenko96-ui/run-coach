import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publishIntervalsWorkoutsForPlan } from "../lib/intervals/publishWorkouts.ts";

function structuredWorkout() {
  return {
    version: 1,
    sport: "Run",
    name: "Easy run",
    exportSafe: true,
    exportWarnings: [],
    steps: [
      {
        id: "easy-main",
        type: "work",
        name: "Easy run",
        durationType: "time",
        durationValue: 1800,
        durationUnit: "seconds",
      },
    ],
  };
}

function plannedWorkout(overrides = {}) {
  return {
    id: overrides.id ?? "workout-1",
    training_plan_id: overrides.training_plan_id ?? "plan-1",
    profile_id: "profile-1",
    race_goal_id: "goal-1",
    workout_date: overrides.workout_date ?? "2026-05-12",
    week_number: 1,
    day_label: "tuesday",
    workout_type: overrides.workout_type ?? "easy",
    title: overrides.title ?? "Easy run",
    description: "Comfortable aerobic run.",
    distance_km: 5,
    duration_min: 30,
    target_pace_min_sec_per_km: 360,
    target_pace_max_sec_per_km: 405,
    target_hr_zone: "Zone 2",
    terrain: "flat",
    purpose: "Build aerobic base.",
    instructions: "Keep this easy.",
    structured_workout:
      "structured_workout" in overrides
        ? overrides.structured_workout
        : structuredWorkout(),
    status: overrides.status ?? "planned",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  };
}

function createSyncSaver() {
  const savedSyncs = [];

  return {
    savedSyncs,
    saveIntervalsWorkoutSync: async (sync) => {
      savedSyncs.push(sync);

      return {
        ...sync,
        id: `sync-${savedSyncs.length}`,
        created_at: "2026-05-11T12:00:00.000Z",
        updated_at: "2026-05-11T12:00:00.000Z",
      };
    },
  };
}

describe("publishIntervalsWorkoutsForPlan", () => {
  it("publishes multiple valid workouts with one bulk upsert call", async () => {
    const firstWorkout = plannedWorkout({ id: "workout-1", title: "Easy one" });
    const secondWorkout = plannedWorkout({ id: "workout-2", title: "Easy two" });
    const syncSaver = createSyncSaver();
    const upsertCalls = [];

    const result = await publishIntervalsWorkoutsForPlan(
      {
        trainingPlanId: "plan-1",
        plannedWorkoutIds: ["workout-1", "workout-2"],
        plannedWorkouts: [firstWorkout, secondWorkout],
        todayDateText: "2026-05-11",
      },
      {
        ...syncSaver,
        now: () => new Date("2026-05-11T12:00:00.000Z"),
        bulkUpsertCalendarEvents: async (events) => {
          upsertCalls.push(events);

          return [
            { ...events[0], id: 101, external_id: "workout-1" },
            { ...events[1], id: 202, external_id: "workout-2" },
          ];
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0].length, 2);
    assert.deepEqual(
      upsertCalls[0].map((event) => event.external_id),
      ["workout-1", "workout-2"],
    );
    assert.deepEqual(
      result.results.map((publishResult) => publishResult.ok),
      [true, true],
    );
    assert.deepEqual(
      result.results.map((publishResult) => publishResult.intervalsEventId),
      [101, 202],
    );
    assert.deepEqual(
      syncSaver.savedSyncs.map((sync) => sync.sync_status),
      ["synced", "synced"],
    );
  });

  it("marks invalid selected workouts as failed without calling Intervals", async () => {
    const syncSaver = createSyncSaver();
    let upsertCallCount = 0;

    const result = await publishIntervalsWorkoutsForPlan(
      {
        trainingPlanId: "plan-1",
        plannedWorkoutIds: ["past", "completed", "missing-structure"],
        plannedWorkouts: [
          plannedWorkout({ id: "past", workout_date: "2026-05-10" }),
          plannedWorkout({ id: "completed", status: "completed" }),
          plannedWorkout({ id: "missing-structure", structured_workout: null }),
        ],
        todayDateText: "2026-05-11",
      },
      {
        ...syncSaver,
        bulkUpsertCalendarEvents: async () => {
          upsertCallCount += 1;
          return [];
        },
      },
    );

    assert.equal(result.ok, false);
    assert.equal(upsertCallCount, 0);
    assert.deepEqual(
      result.results.map((publishResult) => publishResult.syncStatus),
      ["failed", "failed", "failed"],
    );
    assert.deepEqual(
      syncSaver.savedSyncs.map((sync) => sync.sync_status),
      ["failed", "failed", "failed"],
    );
    assert.match(result.results[0].message, /today or future/);
    assert.match(result.results[1].message, /Only planned workouts/);
    assert.match(result.results[2].message, /structured workout/);
  });

  it("publishes valid workouts and keeps invalid failures in the same result", async () => {
    const syncSaver = createSyncSaver();

    const result = await publishIntervalsWorkoutsForPlan(
      {
        trainingPlanId: "plan-1",
        plannedWorkoutIds: ["valid", "completed"],
        plannedWorkouts: [
          plannedWorkout({ id: "valid" }),
          plannedWorkout({ id: "completed", status: "completed" }),
        ],
        todayDateText: "2026-05-11",
      },
      {
        ...syncSaver,
        bulkUpsertCalendarEvents: async (events) => [
          { ...events[0], id: 303, external_id: "valid" },
        ],
      },
    );

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.results.map((publishResult) => publishResult.ok),
      [true, false],
    );
    assert.deepEqual(
      syncSaver.savedSyncs.map((sync) => sync.sync_status),
      ["failed", "synced"],
    );
  });

  it("handles Intervals API failure by saving failed sync rows", async () => {
    const syncSaver = createSyncSaver();

    const result = await publishIntervalsWorkoutsForPlan(
      {
        trainingPlanId: "plan-1",
        plannedWorkoutIds: ["workout-1", "workout-2"],
        plannedWorkouts: [
          plannedWorkout({ id: "workout-1" }),
          plannedWorkout({ id: "workout-2" }),
        ],
        todayDateText: "2026-05-11",
      },
      {
        ...syncSaver,
        bulkUpsertCalendarEvents: async () => {
          throw new Error("Unauthorized");
        },
      },
    );

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.results.map((publishResult) => publishResult.ok),
      [false, false],
    );
    assert.deepEqual(
      syncSaver.savedSyncs.map((sync) => sync.sync_status),
      ["failed", "failed"],
    );
    assert.match(result.results[0].message, /Unauthorized/);
    assert.match(result.results[1].message, /Unauthorized/);
  });
});
