import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDashboardWeekSummary,
  buildRunProgressSummary,
  getNextPlannedRun,
  getNextSevenCalendarDaysWorkouts,
  getTodayWorkout,
} from "../lib/training/dashboardWeek.ts";

function plannedWorkout(overrides = {}) {
  return {
    id: overrides.id ?? "planned-1",
    training_plan_id: "plan-1",
    profile_id: "profile-1",
    race_goal_id: "goal-1",
    workout_date: overrides.workout_date ?? "2026-05-20",
    week_number: 1,
    day_label: "wednesday",
    workout_type: overrides.workout_type ?? "easy",
    title: overrides.title ?? "Easy run",
    description: null,
    distance_km: overrides.distance_km ?? 8,
    duration_min: overrides.duration_min ?? 50,
    target_pace_min_sec_per_km: null,
    target_pace_max_sec_per_km: null,
    target_hr_zone: null,
    terrain: null,
    purpose: overrides.purpose ?? "Build easy aerobic volume.",
    instructions: null,
    structured_workout: null,
    status: overrides.status ?? "planned",
    created_at: "2026-05-01T12:00:00.000Z",
    updated_at: "2026-05-01T12:00:00.000Z",
  };
}

function loggedWorkout(overrides = {}) {
  return {
    id: overrides.id ?? "logged-1",
    profile_id: "profile-1",
    race_goal_id: "goal-1",
    training_plan_id: "plan-1",
    planned_workout_id: overrides.planned_workout_id ?? "planned-1",
    workout_date: overrides.workout_date ?? "2026-05-20",
    workout_type: "run",
    source: overrides.source ?? "manual",
    source_activity_id: null,
    distance_km: 8,
    duration_sec: 3000,
    avg_pace_sec_per_km: 375,
    avg_heart_rate: null,
    max_heart_rate: null,
    cadence: null,
    elevation_gain_m: null,
    rpe: null,
    notes: null,
    created_at: overrides.created_at ?? "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-20T12:00:00.000Z",
  };
}

function workoutEvaluation(overrides = {}) {
  return {
    id: overrides.id ?? "evaluation-1",
    logged_workout_id: overrides.logged_workout_id ?? "logged-1",
    planned_workout_id: overrides.planned_workout_id ?? "planned-1",
    profile_id: "profile-1",
    training_plan_id: "plan-1",
    overall_score: overrides.overall_score ?? 88,
    completion_score: 90,
    pace_accuracy_score: 85,
    distance_completion_score: 90,
    effort_control_score: 85,
    training_value_score: 90,
    risk_level: overrides.risk_level ?? "low",
    summary: null,
    created_at: overrides.created_at ?? "2026-05-20T12:05:00.000Z",
    updated_at: "2026-05-20T12:05:00.000Z",
  };
}

function intervalsSync(overrides = {}) {
  return {
    id: overrides.id ?? "sync-1",
    planned_workout_id: overrides.planned_workout_id ?? "planned-1",
    training_plan_id: "plan-1",
    profile_id: "profile-1",
    intervals_external_id: "external-1",
    intervals_event_id: null,
    sync_status: overrides.sync_status ?? "synced",
    last_synced_at: "2026-05-20T12:00:00.000Z",
    last_error: null,
    created_at: overrides.created_at ?? "2026-05-20T12:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-05-20T12:00:00.000Z",
  };
}

function workoutExport(overrides = {}) {
  return {
    id: overrides.id ?? "export-1",
    planned_workout_id: overrides.planned_workout_id ?? "planned-1",
    training_plan_id: "plan-1",
    profile_id: "profile-1",
    export_provider: overrides.export_provider ?? "garmin_direct",
    export_mode: "single_publish",
    provider_workout_id: overrides.provider_workout_id ?? "garmin-1",
    provider_schedule_id: "schedule-1",
    sync_status: overrides.sync_status ?? "synced",
    scheduled_date: "2026-05-20",
    last_synced_at: "2026-05-20T12:00:00.000Z",
    last_verified_at: null,
    last_error: overrides.last_error ?? null,
    warnings: [],
    payload_snapshot: {},
    created_at: overrides.created_at ?? "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-20T12:00:00.000Z",
  };
}

function planAdjustment(overrides = {}) {
  return {
    id: overrides.id ?? "adjustment-1",
    profile_id: "profile-1",
    race_goal_id: "goal-1",
    training_plan_id: "plan-1",
    logged_workout_id: "logged-1",
    workout_evaluation_id: "evaluation-1",
    adjustment_type: overrides.adjustment_type ?? "reduce_next_intensity",
    reason: overrides.reason ?? "Workout was high risk.",
    explanation: overrides.explanation ?? "Reduced the next quality workout.",
    affected_workout_ids: overrides.affected_workout_ids ?? ["planned-2"],
    before_snapshot: null,
    after_snapshot: null,
    created_at: overrides.created_at ?? "2026-05-20T12:10:00.000Z",
  };
}

function buildSummary(overrides = {}) {
  return buildDashboardWeekSummary({
    plannedWorkouts: overrides.plannedWorkouts ?? [],
    loggedWorkouts: overrides.loggedWorkouts ?? [],
    workoutEvaluations: overrides.workoutEvaluations ?? [],
    intervalsWorkoutSyncs: overrides.intervalsWorkoutSyncs ?? [],
    workoutExports: overrides.workoutExports ?? [],
    planAdjustments: overrides.planAdjustments ?? [],
    todayDateText: overrides.todayDateText ?? "2026-05-20",
  });
}

describe("dashboard week helpers", () => {
  it("finds today's planned workout", () => {
    const workout = plannedWorkout({ id: "today" });

    assert.equal(
      getTodayWorkout([plannedWorkout({ id: "tomorrow", workout_date: "2026-05-21" }), workout], "2026-05-20")?.id,
      "today",
    );
  });

  it("marks today's completed workout as logged", () => {
    const summary = buildSummary({
      plannedWorkouts: [
        plannedWorkout({ id: "today", status: "completed" }),
      ],
      loggedWorkouts: [
        loggedWorkout({ id: "log-today", planned_workout_id: "today" }),
      ],
      workoutEvaluations: [
        workoutEvaluation({
          id: "score-today",
          logged_workout_id: "log-today",
          planned_workout_id: "today",
        }),
      ],
    });

    assert.equal(summary.todayWorkout?.workout.id, "today");
    assert.equal(summary.todayWorkout?.loggedWorkout?.id, "log-today");
    assert.equal(summary.todayWorkout?.workoutEvaluation?.id, "score-today");
  });

  it("shows a rest or non-run day without treating it as a run", () => {
    const summary = buildSummary({
      plannedWorkouts: [
        plannedWorkout({
          id: "rest-day",
          workout_type: "rest",
          title: "Rest day",
        }),
      ],
    });

    assert.equal(summary.todayWorkout?.workout.id, "rest-day");
    assert.equal(summary.todayWorkout?.isRunWorkout, false);
  });

  it("picks the first future planned run as the next planned run", () => {
    const workouts = [
      plannedWorkout({ id: "today-run", workout_date: "2026-05-20" }),
      plannedWorkout({
        id: "future-rest",
        workout_date: "2026-05-21",
        workout_type: "rest",
      }),
      plannedWorkout({
        id: "future-run",
        workout_date: "2026-05-22",
        workout_type: "tempo",
      }),
      plannedWorkout({
        id: "completed-future-run",
        workout_date: "2026-05-21",
        status: "completed",
      }),
    ];

    assert.equal(getNextPlannedRun(workouts, "2026-05-20")?.id, "future-run");
  });

  it("includes today through day 6 in this week's list", () => {
    const workouts = [
      plannedWorkout({ id: "yesterday", workout_date: "2026-05-19" }),
      plannedWorkout({ id: "today", workout_date: "2026-05-20" }),
      plannedWorkout({ id: "day-6", workout_date: "2026-05-26" }),
      plannedWorkout({ id: "day-7", workout_date: "2026-05-27" }),
    ];

    assert.deepEqual(
      getNextSevenCalendarDaysWorkouts(workouts, "2026-05-20").map(
        (workout) => workout.id,
      ),
      ["today", "day-6"],
    );
  });

  it("counts Intervals.icu needs republish and failed rows as attention", () => {
    const summary = buildSummary({
      plannedWorkouts: [
        plannedWorkout({ id: "needs-republish" }),
        plannedWorkout({ id: "failed", workout_date: "2026-05-21" }),
        plannedWorkout({ id: "synced", workout_date: "2026-05-22" }),
      ],
      intervalsWorkoutSyncs: [
        intervalsSync({
          id: "sync-needs-republish",
          planned_workout_id: "needs-republish",
          sync_status: "needs_resync",
        }),
        intervalsSync({
          id: "sync-failed",
          planned_workout_id: "failed",
          sync_status: "failed",
        }),
        intervalsSync({
          id: "sync-synced",
          planned_workout_id: "synced",
          sync_status: "synced",
        }),
      ],
    });

    assert.equal(summary.exportHealth.intervals.synced, 1);
    assert.equal(summary.exportHealth.intervals.needsRepublish, 1);
    assert.equal(summary.exportHealth.intervals.failed, 1);
    assert.equal(
      summary.exportHealth.attentionItems.filter(
        (item) => item.type === "intervals",
      ).length,
      2,
    );
  });

  it("counts Garmin stale, partial, and failed rows as attention", () => {
    const summary = buildSummary({
      plannedWorkouts: [
        plannedWorkout({ id: "stale" }),
        plannedWorkout({ id: "partial", workout_date: "2026-05-21" }),
        plannedWorkout({ id: "failed", workout_date: "2026-05-22" }),
        plannedWorkout({ id: "synced", workout_date: "2026-05-23" }),
      ],
      workoutExports: [
        workoutExport({ planned_workout_id: "stale", sync_status: "stale" }),
        workoutExport({
          planned_workout_id: "partial",
          sync_status: "partial",
        }),
        workoutExport({ planned_workout_id: "failed", sync_status: "failed" }),
        workoutExport({ planned_workout_id: "synced", sync_status: "synced" }),
      ],
    });

    assert.equal(summary.exportHealth.garmin.synced, 1);
    assert.equal(summary.exportHealth.garmin.stale, 1);
    assert.equal(summary.exportHealth.garmin.partial, 1);
    assert.equal(summary.exportHealth.garmin.failed, 1);
    assert.equal(
      summary.exportHealth.attentionItems.filter(
        (item) => item.type === "garmin",
      ).length,
      3,
    );
  });

  it("summarizes the latest plan change with affected workout labels", () => {
    const summary = buildSummary({
      plannedWorkouts: [
        plannedWorkout({
          id: "planned-2",
          workout_date: "2026-05-22",
          workout_type: "recovery",
          title: "Recovery run",
        }),
      ],
      planAdjustments: [
        planAdjustment({
          id: "no-change",
          adjustment_type: "none",
          created_at: "2026-05-20T12:00:00.000Z",
        }),
        planAdjustment({
          id: "latest-change",
          affected_workout_ids: ["planned-2"],
          created_at: "2026-05-20T13:00:00.000Z",
        }),
      ],
    });

    assert.equal(
      summary.planChangeSummary.latestAdjustment?.id,
      "latest-change",
    );
    assert.equal(summary.planChangeSummary.recentPlanChangingCount, 1);
    assert.deepEqual(summary.planChangeSummary.latestAffectedWorkoutLabels, [
      "2026-05-22 - Recovery run (Recovery)",
    ]);
  });

  it("counts current plan progress using running workouts only", () => {
    const progress = buildRunProgressSummary(
      [
        plannedWorkout({
          id: "completed-run",
          workout_date: "2026-05-20",
          status: "completed",
        }),
        plannedWorkout({
          id: "remaining-run",
          workout_date: "2026-05-21",
          status: "planned",
        }),
        plannedWorkout({
          id: "rest-day",
          workout_date: "2026-05-22",
          workout_type: "rest",
          status: "planned",
        }),
        plannedWorkout({
          id: "completed-rest-day",
          workout_date: "2026-05-23",
          workout_type: "rest",
          status: "completed",
        }),
      ],
      [
        loggedWorkout({
          id: "logged-completed-run",
          planned_workout_id: "completed-run",
        }),
      ],
    );

    assert.deepEqual(progress, {
      completedRuns: 1,
      remainingPlannedRuns: 1,
      totalPlannedRuns: 2,
      runCompletionPercentage: 50,
    });
  });
});
