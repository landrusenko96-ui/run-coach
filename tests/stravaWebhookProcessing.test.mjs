import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  processPendingStravaWebhookEvents,
  processSingleStravaWebhookEvent,
} from "../lib/strava/webhookProcessing.ts";
import { importSingleStravaActivityForActivePlan } from "../lib/strava/importRuns.ts";

const profile = {
  id: "profile-1",
};

const raceGoal = {
  id: "race-goal-1",
};

const plan = {
  id: "plan-1",
  profile_id: "profile-1",
  race_goal_id: "race-goal-1",
  start_date: "2026-05-20",
  end_date: "2026-06-20",
};

const plannedWorkout = {
  id: "planned-1",
  training_plan_id: "plan-1",
  profile_id: "profile-1",
  race_goal_id: "race-goal-1",
  workout_date: "2026-05-20",
  workout_type: "easy",
  status: "planned",
  terrain: null,
};

const supabase = {};
const skippedActivityActions = new Set([
  "skipped_no_connection",
  "skipped_duplicate",
  "skipped_non_run",
  "skipped_invalid",
  "skipped_before_plan_start",
  "skipped_already_logged",
]);

function webhookEvent(overrides = {}) {
  return {
    id: "event-1",
    received_at: "2026-05-20T12:00:00.000Z",
    processing_started_at: null,
    processed_at: null,
    user_id: null,
    owner_id: 987654321,
    object_type: "activity",
    object_id: 123456789,
    aspect_type: "create",
    event_time: 1770000000,
    subscription_id: null,
    updates: null,
    raw_event: {},
    processing_status: "pending",
    action_taken: null,
    attempts: 0,
    last_error: null,
    import_summary: null,
    logged_workout_id: null,
    planned_workout_id: null,
    ...overrides,
  };
}

function activity(overrides = {}) {
  return {
    id: "123456789",
    name: "Morning Run",
    sportType: "Run",
    startDate: "2026-05-20T11:00:00Z",
    startDateLocal: "2026-05-20T07:00:00",
    distanceM: 5000,
    movingTimeSec: 1800,
    elapsedTimeSec: 1900,
    totalElevationGainM: 20,
    averageHeartRate: 140,
    maxHeartRate: 170,
    rawSummary: {
      id: "123456789",
      sport_type: "Run",
    },
    ...overrides,
  };
}

function loggedWorkout(overrides = {}) {
  return {
    id: "logged-123456789",
    profile_id: "profile-1",
    race_goal_id: "race-goal-1",
    training_plan_id: "plan-1",
    planned_workout_id: null,
    workout_date: "2026-05-20",
    workout_type: "run",
    source: "strava",
    source_activity_id: "123456789",
    distance_km: 5,
    duration_sec: 1800,
    avg_pace_sec_per_km: 360,
    avg_heart_rate: 140,
    max_heart_rate: 170,
    cadence: null,
    elevation_gain_m: 20,
    rpe: null,
    notes: "Imported from Strava: Morning Run",
    created_at: "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

function workoutEvaluation(overrides = {}) {
  return {
    id: "evaluation-1",
    logged_workout_id: "logged-123456789",
    planned_workout_id: "planned-1",
    profile_id: "profile-1",
    training_plan_id: "plan-1",
    overall_score: 90,
    completion_score: 90,
    pace_accuracy_score: 90,
    distance_completion_score: 90,
    effort_control_score: 90,
    training_value_score: 90,
    risk_level: "low",
    summary: null,
    created_at: "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

function createHarness({
  events = [webhookEvent()],
  fetchActivityResult = {
    ok: true,
    status: "fetched",
    message: "Fetched Strava activity.",
    userId: "user-1",
    activity: activity(),
  },
  existingActivityIds = new Set(),
  importContext = {},
  saveLoggedWorkoutError = null,
} = {}) {
  const eventRows = new Map(events.map((event) => [event.id, { ...event }]));
  const calls = {
    fetchWebhookActivity: [],
    loadImportContext: [],
    importSingleActivity: [],
    saveLoggedWorkoutWithCompletion: [],
    saveStravaActivity: [],
    finishWebhookEvent: [],
  };
  const timestamps = [
    "2026-05-20T12:00:01.000Z",
    "2026-05-20T12:00:02.000Z",
    "2026-05-20T12:00:03.000Z",
    "2026-05-20T12:00:04.000Z",
    "2026-05-20T12:00:05.000Z",
    "2026-05-20T12:00:06.000Z",
  ];
  let timestampIndex = 0;
  const context = {
    profile,
    raceGoal,
    plan,
    plannedWorkouts: [plannedWorkout],
    loggedWorkouts: [],
    workoutEvaluations: [],
    ...importContext,
  };
  const dependencies = {
    now: () =>
      new Date(
        timestamps[Math.min(timestampIndex++, timestamps.length - 1)],
      ),
    fetchWebhookEventById: async (_supabase, eventId) =>
      eventRows.get(eventId) ?? null,
    fetchPendingWebhookEvents: async (_supabase, options) =>
      Array.from(eventRows.values())
        .filter((event) => {
          if (
            options.ownerId &&
            String(event.owner_id) !== String(options.ownerId)
          ) {
            return false;
          }

          if (event.attempts >= options.maxAttempts) {
            return false;
          }

          if (event.processing_status === "pending") {
            return true;
          }

          if (event.processing_status === "failed") {
            return options.includeFailed;
          }

          return event.processing_status === "ignored" && !event.processed_at;
        })
        .sort((first, second) =>
          first.received_at.localeCompare(second.received_at),
        )
        .slice(0, options.limit),
    markWebhookEventProcessing: async (_supabase, event, startedAt) => {
      const row = eventRows.get(event.id);

      Object.assign(row, {
        processing_status: "processing",
        processing_started_at: startedAt,
        attempts: event.attempts + 1,
        last_error: null,
      });
    },
    finishWebhookEvent: async (_supabase, eventId, input) => {
      calls.finishWebhookEvent.push({ eventId, input });
      Object.assign(eventRows.get(eventId), {
        processing_status: input.processingStatus,
        processed_at: input.processedAt,
        action_taken: input.actionTaken,
        import_summary: input.importSummary,
        user_id: input.userId,
        logged_workout_id: input.loggedWorkoutId ?? null,
        planned_workout_id: input.plannedWorkoutId ?? null,
        last_error: input.lastError ?? null,
      });
    },
    fetchPriorSkippedActivityEvent: async (_supabase, event) =>
      Array.from(eventRows.values())
        .filter(
          (row) =>
            row.id !== event.id &&
            row.owner_id === event.owner_id &&
            row.object_type === "activity" &&
            row.object_id === event.object_id &&
            row.aspect_type === "create" &&
            ["processed", "ignored"].includes(row.processing_status) &&
            skippedActivityActions.has(row.action_taken),
        )
        .sort((first, second) =>
          String(second.processed_at ?? "").localeCompare(
            String(first.processed_at ?? ""),
          ),
        )[0] ?? null,
    fetchWebhookActivity: async (input) => {
      calls.fetchWebhookActivity.push(input);

      return fetchActivityResult;
    },
    loadImportContext: async (input) => {
      calls.loadImportContext.push(input);

      return context;
    },
    fetchExistingImportIds: async () => existingActivityIds,
    importSingleActivity: async (input) => {
      calls.importSingleActivity.push(input);

      return importSingleStravaActivityForActivePlan(input);
    },
    saveLoggedWorkoutWithCompletion: async (input) => {
      calls.saveLoggedWorkoutWithCompletion.push(input);

      if (saveLoggedWorkoutError) {
        throw saveLoggedWorkoutError;
      }

      const savedLoggedWorkout = loggedWorkout({
        id: `logged-${input.loggedWorkoutInput.source_activity_id}`,
        training_plan_id: input.loggedWorkoutInput.training_plan_id,
        planned_workout_id: input.plannedWorkout?.id ?? null,
        workout_date: input.loggedWorkoutInput.workout_date,
        source_activity_id: input.loggedWorkoutInput.source_activity_id,
      });

      return {
        ok: true,
        loggedWorkout: savedLoggedWorkout,
        workoutEvaluation: input.plannedWorkout
          ? workoutEvaluation({
              logged_workout_id: savedLoggedWorkout.id,
              planned_workout_id: input.plannedWorkout.id,
            })
          : null,
        scored: Boolean(input.plannedWorkout),
        adjusted: false,
        message: "Imported.",
        followupError: null,
      };
    },
    saveStravaActivity: async (_supabase, input) => {
      calls.saveStravaActivity.push(input);
    },
  };

  return {
    calls,
    dependencies,
    eventRows,
    getEvent: (eventId = "event-1") => eventRows.get(eventId),
  };
}

describe("Strava webhook event processing", () => {
  it("marks activity create events without a matching connection as ignored", async () => {
    const harness = createHarness({
      fetchActivityResult: {
        ok: false,
        status: "missing_connection",
        message: "No Strava connection was found for this webhook owner.",
        userId: null,
        activity: null,
      },
    });

    const result = await processSingleStravaWebhookEvent("event-1", {
      supabase,
      dependencies: harness.dependencies,
    });
    const event = harness.getEvent();

    assert.equal(result.processingStatus, "ignored");
    assert.equal(event.processing_status, "ignored");
    assert.equal(event.action_taken, "skipped_no_connection");
    assert.equal(event.attempts, 1);
    assert.ok(event.processing_started_at);
    assert.ok(event.processed_at);
    assert.equal(harness.calls.saveLoggedWorkoutWithCompletion.length, 0);
  });

  it("fetches and imports activity create events through the shared import path", async () => {
    const harness = createHarness();

    const result = await processSingleStravaWebhookEvent("event-1", {
      supabase,
      dependencies: harness.dependencies,
    });
    const event = harness.getEvent();

    assert.equal(result.ok, true);
    assert.equal(event.processing_status, "processed");
    assert.equal(event.action_taken, "imported");
    assert.equal(event.user_id, "user-1");
    assert.equal(event.logged_workout_id, "logged-123456789");
    assert.equal(event.planned_workout_id, "planned-1");
    assert.equal(event.import_summary.imported, 1);
    assert.equal(harness.calls.fetchWebhookActivity.length, 1);
    assert.equal(harness.calls.importSingleActivity.length, 1);
    assert.equal(
      harness.calls.importSingleActivity[0].activity.id,
      "123456789",
    );
    assert.equal(harness.calls.saveLoggedWorkoutWithCompletion.length, 1);
    assert.equal(harness.calls.saveStravaActivity.length, 1);
  });

  it("does not create duplicate logged workouts for duplicate activity create events", async () => {
    const harness = createHarness({
      events: [
        webhookEvent({
          id: "first-create",
          received_at: "2026-05-20T12:00:00.000Z",
        }),
        webhookEvent({
          id: "second-create",
          received_at: "2026-05-20T12:01:00.000Z",
          event_time: 1770000001,
        }),
      ],
      existingActivityIds: new Set(),
    });

    const results = await processPendingStravaWebhookEvents({
      supabase,
      dependencies: harness.dependencies,
      limit: 10,
    });

    assert.deepEqual(
      results.map((result) => result.eventId),
      ["first-create", "second-create"],
    );
    assert.equal(
      harness.getEvent("first-create").action_taken,
      "imported",
    );
    assert.equal(
      harness.getEvent("second-create").action_taken,
      "skipped_duplicate",
    );
    assert.equal(harness.calls.saveLoggedWorkoutWithCompletion.length, 1);
    assert.equal(harness.calls.saveStravaActivity.length, 1);
  });

  it("marks webhook activity create as duplicate when manual import already saved it", async () => {
    const harness = createHarness({
      existingActivityIds: new Set(["123456789"]),
    });

    await processSingleStravaWebhookEvent("event-1", {
      supabase,
      dependencies: harness.dependencies,
    });
    const event = harness.getEvent();

    assert.equal(event.processing_status, "processed");
    assert.equal(event.action_taken, "skipped_duplicate");
    assert.equal(event.import_summary.skippedDuplicates, 1);
    assert.equal(event.logged_workout_id, null);
    assert.equal(harness.calls.saveLoggedWorkoutWithCompletion.length, 0);
  });

  it("skips non-run activity create events without creating workouts", async () => {
    const harness = createHarness({
      fetchActivityResult: {
        ok: true,
        status: "fetched",
        message: "Fetched Strava activity.",
        userId: "user-1",
        activity: activity({ sportType: "Ride" }),
      },
    });

    await processSingleStravaWebhookEvent("event-1", {
      supabase,
      dependencies: harness.dependencies,
    });

    assert.equal(harness.getEvent().processing_status, "processed");
    assert.equal(harness.getEvent().action_taken, "skipped_non_run");
    assert.equal(harness.calls.importSingleActivity.length, 1);
    assert.equal(harness.calls.saveLoggedWorkoutWithCompletion.length, 0);
    assert.equal(harness.calls.saveStravaActivity.length, 0);
  });

  it("stores skipped import outcomes without creating workouts", async () => {
    const cases = [
      {
        name: "non-run",
        activity: activity({ sportType: "Ride" }),
        expectedAction: "skipped_non_run",
      },
      {
        name: "invalid",
        activity: activity({ movingTimeSec: 0 }),
        expectedAction: "skipped_invalid",
      },
      {
        name: "before plan",
        activity: activity({
          startDate: "2026-05-19T11:00:00Z",
          startDateLocal: "2026-05-19T07:00:00",
        }),
        expectedAction: "skipped_before_plan_start",
      },
      {
        name: "already logged",
        activity: activity(),
        importContext: {
          loggedWorkouts: [
            loggedWorkout({
              id: "manual-log-1",
              source: "manual",
              source_activity_id: null,
              workout_date: "2026-05-20",
            }),
          ],
        },
        expectedAction: "skipped_already_logged",
      },
      {
        name: "already matched",
        activity: activity(),
        importContext: {
          loggedWorkouts: [
            loggedWorkout({
              id: "linked-log-1",
              planned_workout_id: "planned-1",
              workout_date: "2026-05-19",
            }),
          ],
        },
        expectedAction: "skipped_already_logged",
      },
    ];

    for (const testCase of cases) {
      const harness = createHarness({
        fetchActivityResult: {
          ok: true,
          status: "fetched",
          message: "Fetched Strava activity.",
          userId: "user-1",
          activity: testCase.activity,
        },
        importContext: testCase.importContext,
      });

      await processSingleStravaWebhookEvent("event-1", {
        supabase,
        dependencies: harness.dependencies,
      });

      assert.equal(
        harness.getEvent().action_taken,
        testCase.expectedAction,
        testCase.name,
      );
      assert.equal(harness.getEvent().logged_workout_id, null);
    }
  });

  it("marks import failures as failed_processing", async () => {
    const harness = createHarness({
      saveLoggedWorkoutError: new Error("Database insert failed."),
    });

    const result = await processSingleStravaWebhookEvent("event-1", {
      supabase,
      dependencies: harness.dependencies,
    });
    const event = harness.getEvent();

    assert.equal(result.ok, false);
    assert.equal(event.processing_status, "failed");
    assert.equal(event.action_taken, "failed_processing");
    assert.equal(event.last_error, "Database insert failed.");
    assert.equal(event.processed_at, null);
    assert.equal(event.import_summary.ok, false);
  });

  it("handles updates, deletes, and deauthorizations without changing workouts", async () => {
    const events = [
      webhookEvent({
        id: "update-event",
        aspect_type: "update",
        updates: { title: "New title" },
      }),
      webhookEvent({
        id: "delete-event",
        aspect_type: "delete",
      }),
      webhookEvent({
        id: "deauth-event",
        object_type: "athlete",
        object_id: 987654321,
        aspect_type: "update",
        updates: { authorized: "false" },
      }),
    ];
    const harness = createHarness({ events });

    for (const event of events) {
      await processSingleStravaWebhookEvent(event.id, {
        supabase,
        dependencies: harness.dependencies,
      });
    }

    assert.equal(harness.getEvent("update-event").processing_status, "ignored");
    assert.equal(
      harness.getEvent("update-event").action_taken,
      "skipped_update_ignored",
    );
    assert.equal(
      harness.getEvent("delete-event").action_taken,
      "marked_deleted_attention_needed",
    );
    assert.equal(harness.getEvent("delete-event").import_summary.attentionNeeded, true);
    assert.equal(
      harness.getEvent("deauth-event").action_taken,
      "marked_connection_revoked",
    );
    assert.equal(harness.getEvent("deauth-event").import_summary.attentionNeeded, true);
    assert.equal(harness.calls.fetchWebhookActivity.length, 0);
    assert.equal(harness.calls.importSingleActivity.length, 0);
    assert.equal(harness.calls.saveLoggedWorkoutWithCompletion.length, 0);
    assert.equal(harness.calls.saveStravaActivity.length, 0);
  });

  it("ignores update and delete events when the activity was already skipped", async () => {
    const events = [
      webhookEvent({
        id: "skipped-create-event",
        processed_at: "2026-05-20T12:00:00.000Z",
        processing_status: "processed",
        action_taken: "skipped_invalid",
        import_summary: {
          skippedInvalid: 1,
        },
      }),
      webhookEvent({
        id: "update-after-skip",
        received_at: "2026-05-20T12:01:00.000Z",
        aspect_type: "update",
        updates: { title: "New title" },
      }),
      webhookEvent({
        id: "delete-after-skip",
        received_at: "2026-05-20T12:02:00.000Z",
        aspect_type: "delete",
      }),
    ];
    const harness = createHarness({ events });

    await processSingleStravaWebhookEvent("update-after-skip", {
      supabase,
      dependencies: harness.dependencies,
    });
    await processSingleStravaWebhookEvent("delete-after-skip", {
      supabase,
      dependencies: harness.dependencies,
    });

    assert.equal(
      harness.getEvent("update-after-skip").action_taken,
      "skipped_update_ignored_previously_skipped",
    );
    assert.equal(
      harness.getEvent("delete-after-skip").action_taken,
      "skipped_delete_ignored_previously_skipped",
    );
    assert.equal(
      harness.getEvent("delete-after-skip").processing_status,
      "ignored",
    );
    assert.equal(
      harness.getEvent("delete-after-skip").import_summary.attentionNeeded,
      false,
    );
    assert.equal(
      harness.getEvent("delete-after-skip").import_summary.priorActionTaken,
      "skipped_invalid",
    );
    assert.equal(harness.calls.fetchWebhookActivity.length, 0);
    assert.equal(harness.calls.importSingleActivity.length, 0);
    assert.equal(harness.calls.saveLoggedWorkoutWithCompletion.length, 0);
    assert.equal(harness.calls.saveStravaActivity.length, 0);
  });

  it("does not reprocess already handled events", async () => {
    const harness = createHarness({
      events: [
        webhookEvent({
          processing_status: "processed",
          processed_at: "2026-05-20T12:00:00.000Z",
          action_taken: "imported",
        }),
      ],
    });

    const result = await processSingleStravaWebhookEvent("event-1", {
      supabase,
      dependencies: harness.dependencies,
    });

    assert.equal(result.processingStatus, "already_handled");
    assert.equal(harness.getEvent().attempts, 0);
  });

  it("processes pending events oldest first and continues after failures", async () => {
    const harness = createHarness({
      events: [
        webhookEvent({
          id: "first-event",
          received_at: "2026-05-20T12:00:00.000Z",
        }),
        webhookEvent({
          id: "second-event",
          received_at: "2026-05-20T12:01:00.000Z",
          aspect_type: "update",
        }),
      ],
      saveLoggedWorkoutError: new Error("Database insert failed."),
    });

    const results = await processPendingStravaWebhookEvents({
      supabase,
      dependencies: harness.dependencies,
      limit: 10,
    });

    assert.deepEqual(
      results.map((result) => result.eventId),
      ["first-event", "second-event"],
    );
    assert.equal(harness.getEvent("first-event").processing_status, "failed");
    assert.equal(harness.getEvent("second-event").processing_status, "ignored");
    assert.equal(harness.getEvent("first-event").attempts, 1);
    assert.equal(harness.getEvent("second-event").attempts, 1);
  });

  it("processes only pending events for the requested Strava owner", async () => {
    const harness = createHarness({
      events: [
        webhookEvent({
          id: "matching-event",
          owner_id: 111111,
          aspect_type: "update",
        }),
        webhookEvent({
          id: "other-athlete-event",
          owner_id: 222222,
          aspect_type: "update",
        }),
      ],
    });

    const results = await processPendingStravaWebhookEvents({
      supabase,
      dependencies: harness.dependencies,
      ownerId: "111111",
      limit: 10,
    });

    assert.deepEqual(
      results.map((result) => result.eventId),
      ["matching-event"],
    );
    assert.equal(harness.getEvent("matching-event").attempts, 1);
    assert.equal(harness.getEvent("other-athlete-event").attempts, 0);
  });

  it("retries failed events only when failed retries are enabled", async () => {
    const withoutRetryHarness = createHarness({
      events: [
        webhookEvent({
          id: "failed-event",
          aspect_type: "update",
          processing_status: "failed",
          attempts: 1,
        }),
      ],
    });

    const withoutRetryResults = await processPendingStravaWebhookEvents({
      supabase,
      dependencies: withoutRetryHarness.dependencies,
      includeFailed: false,
      limit: 10,
    });

    assert.deepEqual(withoutRetryResults, []);
    assert.equal(withoutRetryHarness.getEvent("failed-event").attempts, 1);

    const withRetryHarness = createHarness({
      events: [
        webhookEvent({
          id: "failed-event",
          aspect_type: "update",
          processing_status: "failed",
          attempts: 1,
        }),
      ],
    });

    const withRetryResults = await processPendingStravaWebhookEvents({
      supabase,
      dependencies: withRetryHarness.dependencies,
      includeFailed: true,
      limit: 10,
    });

    assert.deepEqual(
      withRetryResults.map((result) => result.eventId),
      ["failed-event"],
    );
    assert.equal(withRetryHarness.getEvent("failed-event").attempts, 2);
    assert.equal(
      withRetryHarness.getEvent("failed-event").processing_status,
      "ignored",
    );
  });
});
