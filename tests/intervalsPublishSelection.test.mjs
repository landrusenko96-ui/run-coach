import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysToDateText,
  getDefaultIntervalsBulkPublishWorkoutIds,
  isIntervalsBulkPublishEligible,
  isWorkoutInIntervalsBulkPublishWindow,
} from "../lib/intervals/publishSelection.ts";

function plannedWorkout(overrides = {}) {
  return {
    id: overrides.id ?? "workout-1",
    workout_date: overrides.workout_date ?? "2026-05-11",
    status: overrides.status ?? "planned",
    structured_workout:
      "structured_workout" in overrides ? overrides.structured_workout : {},
  };
}

describe("Intervals bulk publish selection helpers", () => {
  it("adds days to a date-only string without timezone drift", () => {
    assert.equal(addDaysToDateText("2026-05-11", 6), "2026-05-17");
    assert.equal(addDaysToDateText("2026-12-30", 3), "2027-01-02");
  });

  it("treats today through day 6 as the next 7 calendar days", () => {
    assert.equal(
      isWorkoutInIntervalsBulkPublishWindow(
        plannedWorkout({ workout_date: "2026-05-11" }),
        "2026-05-11",
        7,
      ),
      true,
    );
    assert.equal(
      isWorkoutInIntervalsBulkPublishWindow(
        plannedWorkout({ workout_date: "2026-05-17" }),
        "2026-05-11",
        7,
      ),
      true,
    );
    assert.equal(
      isWorkoutInIntervalsBulkPublishWindow(
        plannedWorkout({ workout_date: "2026-05-18" }),
        "2026-05-11",
        7,
      ),
      false,
    );
  });

  it("selects only publishable workouts by default", () => {
    const workouts = [
      plannedWorkout({ id: "today", workout_date: "2026-05-11" }),
      plannedWorkout({ id: "day-6", workout_date: "2026-05-17" }),
      plannedWorkout({ id: "day-7", workout_date: "2026-05-18" }),
      plannedWorkout({ id: "completed", status: "completed" }),
      plannedWorkout({ id: "missing-structure", structured_workout: null }),
    ];

    assert.deepEqual(
      getDefaultIntervalsBulkPublishWorkoutIds(workouts, "2026-05-11", 7),
      ["today", "day-6"],
    );
    assert.deepEqual(
      getDefaultIntervalsBulkPublishWorkoutIds(workouts, "2026-05-11", 14),
      ["today", "day-6", "day-7"],
    );
  });

  it("blocks past, completed, and missing-structure workouts", () => {
    assert.equal(
      isIntervalsBulkPublishEligible(
        plannedWorkout({ workout_date: "2026-05-10" }),
        "2026-05-11",
      ),
      false,
    );
    assert.equal(
      isIntervalsBulkPublishEligible(
        plannedWorkout({ status: "completed" }),
        "2026-05-11",
      ),
      false,
    );
    assert.equal(
      isIntervalsBulkPublishEligible(
        plannedWorkout({ structured_workout: null }),
        "2026-05-11",
      ),
      false,
    );
  });
});
