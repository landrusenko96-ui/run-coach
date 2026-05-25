import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bulkPublishGarminWorkouts,
  bulkDeleteGarminWorkouts,
  bulkUpdateGarminWorkouts,
  deleteGarminWorkout,
  getGarminBridgeStatus,
  previewGarminWorkout,
  publishGarminWorkout,
  updateGarminWorkout,
} from "../lib/garminBridge/client.ts";
import { assertSafeWorkoutExportInput } from "../lib/db/workoutExportShapes.ts";

const bridgeUrl = "http://127.0.0.1:8765";
const bridgeApiKey = "super-secret-bridge-key";

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
        targetType: "pace",
        targetMin: 360,
        targetMax: 420,
        targetUnit: "sec_per_km",
      },
    ],
  };
}

function plannedWorkout(overrides = {}) {
  return {
    id: overrides.id ?? "workout-1",
    training_plan_id: "plan-1",
    profile_id: "profile-1",
    race_goal_id: "goal-1",
    workout_date: overrides.workout_date ?? "2026-05-20",
    week_number: 1,
    day_label: "wednesday",
    workout_type: "easy",
    title: overrides.title ?? "Easy run",
    description: "Comfortable aerobic run.",
    distance_km: 5,
    duration_min: 30,
    target_pace_min_sec_per_km: 360,
    target_pace_max_sec_per_km: 420,
    target_hr_zone: null,
    terrain: "flat",
    purpose: "Build aerobic base.",
    instructions: "Keep this easy.",
    structured_workout:
      "structured_workout" in overrides
        ? overrides.structured_workout
        : structuredWorkout(),
    status: "planned",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  };
}

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

    return typeof response === "function" ? response(url, init) : response;
  };

  return {
    calls,
    fetchImpl,
  };
}

function createExportSaver() {
  const savedExports = [];

  return {
    savedExports,
    saveWorkoutExport: async (workoutExport) => {
      savedExports.push(workoutExport);

      return {
        ...workoutExport,
        id: `export-${savedExports.length}`,
        created_at: "2026-05-13T12:00:00.000Z",
        updated_at: "2026-05-13T12:00:00.000Z",
      };
    },
  };
}

function createExportUpdater(existingExport = workoutExport()) {
  const updatedExports = [];

  return {
    updatedExports,
    updateWorkoutExportAfterGarminDelete: async (workoutExport) => {
      updatedExports.push(workoutExport);

      return {
        ...existingExport,
        ...workoutExport,
        export_provider: "garmin_direct",
        updated_at: "2026-05-13T12:05:00.000Z",
      };
    },
  };
}

function workoutExport(overrides = {}) {
  return {
    id: overrides.id ?? "existing-export-1",
    planned_workout_id: overrides.planned_workout_id ?? "workout-1",
    training_plan_id: overrides.training_plan_id ?? "plan-1",
    profile_id: overrides.profile_id ?? "profile-1",
    export_provider: overrides.export_provider ?? "garmin_direct",
    export_mode: overrides.export_mode ?? "single_publish",
    provider_workout_id:
      "provider_workout_id" in overrides
        ? overrides.provider_workout_id
        : "garmin-workout-existing",
    provider_schedule_id:
      "provider_schedule_id" in overrides
        ? overrides.provider_schedule_id
        : "schedule-existing",
    sync_status: overrides.sync_status ?? "synced",
    scheduled_date: overrides.scheduled_date ?? "2026-05-20",
    last_synced_at:
      "last_synced_at" in overrides
        ? overrides.last_synced_at
        : "2026-05-13T12:00:00.000Z",
    last_verified_at: overrides.last_verified_at ?? null,
    last_error: overrides.last_error ?? null,
    warnings: overrides.warnings ?? [],
    payload_snapshot: overrides.payload_snapshot ?? {},
    created_at: overrides.created_at ?? "2026-05-13T12:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-05-13T12:00:00.000Z",
  };
}

function getDefaultOptions(overrides = {}) {
  const exportSaver = createExportSaver();

  return {
    bridgeUrl,
    apiKey: bridgeApiKey,
    fetchPlannedWorkoutById: async (plannedWorkoutId) =>
      plannedWorkout({ id: plannedWorkoutId }),
    fetchWorkoutExportsForPlannedWorkout: async () => [],
    saveWorkoutExport: exportSaver.saveWorkoutExport,
    ...overrides,
  };
}

function statusResponse(overrides = {}) {
  return {
    ok: true,
    authenticated: true,
    category: "AUTHENTICATED",
    client_library: "python-garminconnect",
    client_version: "0.3.3",
    token_file_exists: true,
    token_file_path: "/local/path/.garminconnect/garmin_tokens.json",
    last_auth_check_at: "2026-05-13T12:00:00Z",
    message: "Local Garmin session is available.",
    ...overrides,
  };
}

function previewResponse(overrides = {}) {
  return {
    ok: true,
    target_summary: {
      target_type: "pace",
      target_min: 360,
      target_max: 420,
      target_unit: "sec_per_km",
      display: "pace: 360-420 sec_per_km",
    },
    step_count: 1,
    repeat_count: 0,
    pace_target_count: 1,
    hr_target_count: 0,
    warnings: [],
    error: null,
    garmin_payload_preview: {
      workoutName: "Easy run",
    },
    ...overrides,
  };
}

function publishResponse(overrides = {}) {
  return {
    ok: true,
    status: "PUBLISHED",
    planned_workout_id: "workout-1",
    garmin_workout_id: "garmin-workout-1",
    garmin_schedule_id: "schedule-1",
    scheduled_date: "2026-05-20",
    schedule_summary: {
      scheduled_date: "2026-05-20",
      garmin_schedule_id: "schedule-1",
      result_type: "SCHEDULED",
      message: "Garmin schedule request succeeded.",
    },
    warnings: [],
    error: null,
    target_summary: {
      target_type: "pace",
      target_min: 360,
      target_max: 420,
      target_unit: "sec_per_km",
      display: "pace: 360-420 sec_per_km",
    },
    debug_summary: {
      dry_run: false,
      client_library: "python-garminconnect",
      client_version: "0.3.3",
      generated_step_count: 1,
    },
    ...overrides,
  };
}

function deleteResponse(overrides = {}) {
  return {
    ok: true,
    status: "DELETED",
    planned_workout_id: "workout-1",
    garmin_workout_id: "garmin-workout-existing",
    warnings: [
      "Garmin delete request completed.",
      "Manual verification recommended: confirm the workout is gone from Garmin Connect and the watch.",
    ],
    error: null,
    ...overrides,
  };
}

describe("Garmin bridge client", () => {
  it("returns disabled status when GARMIN_BRIDGE_URL is missing", async () => {
    const result = await getGarminBridgeStatus({
      bridgeUrl: null,
      apiKey: bridgeApiKey,
    });

    assert.equal(result.ok, false);
    assert.equal(result.enabled, false);
    assert.equal(result.status, "DISABLED");
    assert.match(result.message, /GARMIN_BRIDGE_URL/);
    assert.match(result.message, /Intervals\.icu/);
  });

  it("returns config error when GARMIN_BRIDGE_API_KEY is missing", async () => {
    const result = await getGarminBridgeStatus({
      bridgeUrl,
      apiKey: null,
    });

    assert.equal(result.ok, false);
    assert.equal(result.enabled, true);
    assert.equal(result.status, "CONFIG_ERROR");
    assert.match(result.message, /GARMIN_BRIDGE_API_KEY/);
    assert.match(result.message, /server environments/);
  });

  it("returns a config error when Cloudflare Access service auth is partially configured", async () => {
    const result = await getGarminBridgeStatus({
      bridgeUrl,
      apiKey: bridgeApiKey,
      accessClientId: "cloudflare-access-client-id",
      accessClientSecret: null,
    });

    assert.equal(result.ok, false);
    assert.equal(result.enabled, true);
    assert.equal(result.status, "CONFIG_ERROR");
    assert.match(result.message, /partially configured/);
    assert.doesNotMatch(JSON.stringify(result), /cloudflare-access-client-id/);
  });

  it("returns a clear error when the bridge is not running", async () => {
    const result = await getGarminBridgeStatus({
      bridgeUrl,
      apiKey: bridgeApiKey,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "BRIDGE_UNAVAILABLE");
    assert.equal(result.message, "Garmin bridge is not reachable.");
  });

  it("returns a safe unavailable status when the bridge request times out", async () => {
    const result = await getGarminBridgeStatus({
      bridgeUrl,
      apiKey: bridgeApiKey,
      requestTimeoutMs: 5,
      fetchImpl: async () => new Promise(() => {}),
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "BRIDGE_UNAVAILABLE");
    assert.equal(result.message, "Garmin bridge request timed out.");
    assert.doesNotMatch(JSON.stringify(result), /super-secret-bridge-key/);
  });

  it("sends the bridge key as a private server header for status checks", async () => {
    const mockFetch = createMockFetch(jsonResponse(statusResponse()));

    const result = await getGarminBridgeStatus({
      bridgeUrl,
      apiKey: bridgeApiKey,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(result.ok, true);
    assert.equal(mockFetch.calls.length, 1);
    assert.equal(mockFetch.calls[0].url, `${bridgeUrl}/garmin/status`);
    assert.equal(mockFetch.calls[0].init.method, "GET");
    assert.equal(
      mockFetch.calls[0].init.headers["X-Garmin-Bridge-Key"],
      bridgeApiKey,
    );
    assert.equal(
      mockFetch.calls[0].init.headers["CF-Access-Client-Id"],
      undefined,
    );
    assert.equal(
      mockFetch.calls[0].init.headers["CF-Access-Client-Secret"],
      undefined,
    );
    assert.equal(mockFetch.calls[0].init.body, undefined);
    assert.doesNotMatch(mockFetch.calls[0].url, /super-secret-bridge-key/);
  });

  it("sends Cloudflare Access service-token headers when both values are configured", async () => {
    const mockFetch = createMockFetch(jsonResponse(statusResponse()));

    const result = await getGarminBridgeStatus({
      bridgeUrl: "https://garmin-bridge.example.com",
      apiKey: bridgeApiKey,
      accessClientId: "cf-access-client-id",
      accessClientSecret: "cf-access-client-secret",
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(result.ok, true);
    assert.equal(mockFetch.calls.length, 1);
    assert.equal(
      mockFetch.calls[0].init.headers["X-Garmin-Bridge-Key"],
      bridgeApiKey,
    );
    assert.equal(
      mockFetch.calls[0].init.headers["CF-Access-Client-Id"],
      "cf-access-client-id",
    );
    assert.equal(
      mockFetch.calls[0].init.headers["CF-Access-Client-Secret"],
      "cf-access-client-secret",
    );
    assert.doesNotMatch(JSON.stringify(result), /cf-access-client-secret/);
    assert.doesNotMatch(mockFetch.calls[0].url, /cf-access-client-secret/);
  });

  it("sanitizes status responses before returning them to app callers", async () => {
    const mockFetch = createMockFetch(jsonResponse(statusResponse()));

    const result = await getGarminBridgeStatus({
      bridgeUrl,
      apiKey: bridgeApiKey,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.equal(result.ok, true);
    assert.equal(result.bridgeStatus.token_file_exists, true);
    assert.equal("token_file_path" in result.bridgeStatus, false);
    assert.doesNotMatch(JSON.stringify(result), /\/local\/path/);
    assert.doesNotMatch(JSON.stringify(result), /garmin_tokens\.json/);
  });

  it("maps preview requests to the flat bridge workout contract", async () => {
    const mockFetch = createMockFetch(jsonResponse(previewResponse()));

    const result = await previewGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
      }),
    );

    const requestBody = JSON.parse(mockFetch.calls[0].init.body);

    assert.equal(result.ok, true);
    assert.equal(result.status, "PREVIEW_READY");
    assert.equal(mockFetch.calls[0].url, `${bridgeUrl}/garmin/workouts/preview`);
    assert.deepEqual(requestBody, {
      planned_workout_id: "workout-1",
      workout_name: "Easy run",
      workout_date: "2026-05-20",
      sport: "Run",
      structured_workout: structuredWorkout(),
      dry_run: true,
    });
  });

  it("maps publish requests to the flat bridge workout contract", async () => {
    const mockFetch = createMockFetch(jsonResponse(publishResponse()));
    const exportSaver = createExportSaver();

    const result = await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        now: () => new Date("2026-05-13T12:00:00.000Z"),
      }),
    );

    const requestBody = JSON.parse(mockFetch.calls[0].init.body);

    assert.equal(result.ok, true);
    assert.equal(result.status, "PUBLISHED");
    assert.equal(result.exportRecord.id, "export-1");
    assert.equal(mockFetch.calls[0].url, `${bridgeUrl}/garmin/workouts/publish`);
    assert.deepEqual(requestBody, {
      planned_workout_id: "workout-1",
      workout_name: "Easy run",
      workout_date: "2026-05-20",
      sport: "Run",
      structured_workout: structuredWorkout(),
      dry_run: false,
    });
    assert.equal(exportSaver.savedExports.length, 1);
    assert.equal(exportSaver.savedExports[0].export_provider, "garmin_direct");
    assert.equal(exportSaver.savedExports[0].export_mode, "single_publish");
    assert.equal(exportSaver.savedExports[0].sync_status, "synced");
    assert.equal(
      exportSaver.savedExports[0].provider_workout_id,
      "garmin-workout-1",
    );
    assert.equal(exportSaver.savedExports[0].provider_schedule_id, "schedule-1");
    assert.equal(
      exportSaver.savedExports[0].last_synced_at,
      "2026-05-13T12:00:00.000Z",
    );
  });

  it("blocks direct Garmin republish when the workout is already synced", async () => {
    const mockFetch = createMockFetch(jsonResponse(publishResponse()));
    const exportSaver = createExportSaver();
    const existingExport = workoutExport({ sync_status: "synced" });

    const result = await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "ALREADY_PUBLISHED");
    assert.equal(result.message, "Already published to Garmin.");
    assert.equal(result.exportRecord, existingExport);
    assert.equal(mockFetch.calls.length, 0);
    assert.equal(exportSaver.savedExports.length, 0);
  });

  it("treats the historical failed-but-published Garmin row as already synced", async () => {
    const mockFetch = createMockFetch(jsonResponse(publishResponse()));
    const exportSaver = createExportSaver();
    const existingExport = workoutExport({
      sync_status: "failed",
      provider_workout_id: "garmin-workout-existing",
      last_error: "Garmin workout published and scheduled.",
    });

    const result = await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
      }),
    );

    assert.equal(result.status, "ALREADY_PUBLISHED");
    assert.equal(result.message, "Already published to Garmin.");
    assert.equal(mockFetch.calls.length, 0);
    assert.equal(exportSaver.savedExports.length, 0);
  });

  it("blocks explicit republish when an existing Garmin export is synced", async () => {
    const mockFetch = createMockFetch(jsonResponse(publishResponse()));
    const exportSaver = createExportSaver();

    const result = await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [
          workoutExport({ sync_status: "synced" }),
        ],
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "ALREADY_PUBLISHED");
    assert.equal(result.message, "Already published to Garmin.");
    assert.equal(mockFetch.calls.length, 0);
    assert.equal(exportSaver.savedExports.length, 0);
  });

  it("allows retry when the latest Garmin export failed", async () => {
    const mockFetch = createMockFetch(jsonResponse(publishResponse()));
    const exportSaver = createExportSaver();

    const result = await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [
          workoutExport({
            sync_status: "failed",
            provider_workout_id: null,
            last_error: "Previous Garmin publish failed.",
          }),
        ],
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, "PUBLISHED");
    assert.equal(mockFetch.calls.length, 1);
    assert.equal(exportSaver.savedExports.length, 1);
  });

  it("blocks stale Garmin publish so update can replace instead of duplicating", async () => {
    const mockFetch = createMockFetch(jsonResponse(publishResponse()));
    const exportSaver = createExportSaver();
    const existingExport = workoutExport({ sync_status: "stale" });

    const result = await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "ALREADY_PUBLISHED");
    assert.match(result.message, /use Update Garmin Export/);
    assert.equal(result.exportRecord, existingExport);
    assert.equal(mockFetch.calls.length, 0);
    assert.equal(exportSaver.savedExports.length, 0);
  });

  it("blocks partial Garmin publish to avoid creating another duplicate", async () => {
    const mockFetch = createMockFetch(jsonResponse(publishResponse()));
    const exportSaver = createExportSaver();
    const existingExport = workoutExport({ sync_status: "partial" });

    const result = await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "ALREADY_PUBLISHED");
    assert.match(
      result.message,
      /Delete or update it instead of publishing a duplicate\./,
    );
    assert.equal(result.exportRecord, existingExport);
    assert.equal(mockFetch.calls.length, 0);
    assert.equal(exportSaver.savedExports.length, 0);
  });

  it("deletes synced Garmin exports through the local bridge and marks them deleted", async () => {
    const existingExport = workoutExport({ sync_status: "synced" });
    const exportUpdater = createExportUpdater(existingExport);
    const mockFetch = createMockFetch(jsonResponse(deleteResponse()));

    const result = await deleteGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
        now: () => new Date("2026-05-13T12:05:00.000Z"),
      }),
    );

    const requestBody = JSON.parse(mockFetch.calls[0].init.body);

    assert.equal(result.ok, true);
    assert.equal(result.status, "DELETED");
    assert.equal(result.exportRecord.sync_status, "deleted");
    assert.equal(mockFetch.calls[0].url, `${bridgeUrl}/garmin/workouts/delete`);
    assert.deepEqual(requestBody, {
      planned_workout_id: "workout-1",
      garmin_workout_id: "garmin-workout-existing",
      schedule_date: "2026-05-20",
    });
    assert.equal(exportUpdater.updatedExports.length, 1);
    assert.equal(exportUpdater.updatedExports[0].sync_status, "deleted");
    assert.equal(
      exportUpdater.updatedExports[0].last_synced_at,
      "2026-05-13T12:05:00.000Z",
    );
  });

  it("allows deleting stale and partial Garmin exports", async () => {
    for (const syncStatus of ["stale", "partial"]) {
      const existingExport = workoutExport({ sync_status: syncStatus });
      const exportUpdater = createExportUpdater(existingExport);
      const mockFetch = createMockFetch(jsonResponse(deleteResponse()));

      const result = await deleteGarminWorkout(
        "workout-1",
        getDefaultOptions({
          fetchImpl: mockFetch.fetchImpl,
          fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
          updateWorkoutExportAfterGarminDelete:
            exportUpdater.updateWorkoutExportAfterGarminDelete,
        }),
      );

      assert.equal(result.status, "DELETED");
      assert.equal(mockFetch.calls.length, 1);
      assert.equal(exportUpdater.updatedExports[0].sync_status, "deleted");
    }
  });

  it("blocks Garmin delete for failed, deleted, not-synced, and missing exports", async () => {
    for (const existingExport of [
      workoutExport({ sync_status: "failed" }),
      workoutExport({ sync_status: "deleted" }),
      workoutExport({ sync_status: "not_synced" }),
      null,
    ]) {
      const mockFetch = createMockFetch(jsonResponse(deleteResponse()));
      const exportUpdater = createExportUpdater();

      const result = await deleteGarminWorkout(
        "workout-1",
        getDefaultOptions({
          fetchImpl: mockFetch.fetchImpl,
          fetchWorkoutExportsForPlannedWorkout: async () =>
            existingExport ? [existingExport] : [],
          updateWorkoutExportAfterGarminDelete:
            exportUpdater.updateWorkoutExportAfterGarminDelete,
        }),
      );

      assert.equal(result.ok, false);
      assert.equal(result.status, "DELETE_NOT_ALLOWED");
      assert.equal(mockFetch.calls.length, 0);
      assert.equal(exportUpdater.updatedExports.length, 0);
    }
  });

  it("blocks Garmin delete when provider_workout_id is missing", async () => {
    const existingExport = workoutExport({
      sync_status: "partial",
      provider_workout_id: null,
    });
    const mockFetch = createMockFetch(jsonResponse(deleteResponse()));
    const exportUpdater = createExportUpdater(existingExport);

    const result = await deleteGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "DELETE_NOT_ALLOWED");
    assert.match(result.message, /Garmin workout ID/);
    assert.equal(mockFetch.calls.length, 0);
    assert.equal(exportUpdater.updatedExports.length, 0);
  });

  it("marks Garmin delete fallback as partial when the bridge can only unschedule", async () => {
    const existingExport = workoutExport({ sync_status: "synced" });
    const exportUpdater = createExportUpdater(existingExport);
    const mockFetch = createMockFetch(
      jsonResponse(
        deleteResponse({
          ok: true,
          status: "UNSCHEDULED_ONLY",
          warnings: ["The workout may still exist in the Garmin workout library."],
        }),
      ),
    );

    const result = await deleteGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "UNSCHEDULED_ONLY");
    assert.equal(result.exportRecord.sync_status, "partial");
    assert.match(result.message, /may still exist/);
    assert.equal(exportUpdater.updatedExports[0].sync_status, "partial");
    assert.match(exportUpdater.updatedExports[0].last_error, /may still exist/);
  });

  it("returns manual guidance when Garmin deletion is not supported", async () => {
    const existingExport = workoutExport({ sync_status: "synced" });
    const exportUpdater = createExportUpdater(existingExport);
    const mockFetch = createMockFetch(
      jsonResponse(
        deleteResponse({
          ok: false,
          status: "NOT_SUPPORTED",
          warnings: ["No Garmin delete request was made."],
          error:
            "Garmin workout deletion is not supported by the available client.",
        }),
      ),
    );

    const result = await deleteGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "NOT_SUPPORTED");
    assert.match(result.message, /Delete it manually in Garmin Connect/);
    assert.equal(exportUpdater.updatedExports.length, 0);
  });

  it("does not update export tracking when Garmin delete auth fails", async () => {
    const existingExport = workoutExport({ sync_status: "synced" });
    const exportUpdater = createExportUpdater(existingExport);
    const mockFetch = createMockFetch(
      jsonResponse(
        deleteResponse({
          ok: false,
          status: "AUTH_REQUIRED",
          warnings: ["Authenticate locally before deleting Garmin workouts."],
          error: "A local Garmin session could not be resumed.",
        }),
      ),
    );

    const result = await deleteGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "AUTH_REQUIRED");
    assert.equal(exportUpdater.updatedExports.length, 0);
  });

  it("does not update export tracking or expose the API key when Garmin delete bridge is unavailable", async () => {
    const existingExport = workoutExport({ sync_status: "synced" });
    const exportUpdater = createExportUpdater(existingExport);

    const result = await deleteGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "BRIDGE_UNAVAILABLE");
    assert.equal(result.message, "Garmin bridge is not reachable.");
    assert.equal(exportUpdater.updatedExports.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /super-secret-bridge-key/);
  });

  it("blocks manual Garmin update for non-stale and missing exports", async () => {
    for (const existingExport of [
      workoutExport({ sync_status: "synced" }),
      workoutExport({ sync_status: "partial" }),
      workoutExport({ sync_status: "failed" }),
      workoutExport({ sync_status: "deleted" }),
      null,
    ]) {
      const mockFetch = createMockFetch(jsonResponse(deleteResponse()));
      const exportSaver = createExportSaver();
      const exportUpdater = createExportUpdater();

      const result = await updateGarminWorkout(
        "workout-1",
        getDefaultOptions({
          fetchImpl: mockFetch.fetchImpl,
          saveWorkoutExport: exportSaver.saveWorkoutExport,
          fetchWorkoutExportsForPlannedWorkout: async () =>
            existingExport ? [existingExport] : [],
          updateWorkoutExportAfterGarminDelete:
            exportUpdater.updateWorkoutExportAfterGarminDelete,
        }),
      );

      assert.equal(result.ok, false);
      assert.equal(result.status, "UPDATE_NOT_ALLOWED");
      assert.equal(mockFetch.calls.length, 0);
      assert.equal(exportSaver.savedExports.length, 0);
      assert.equal(exportUpdater.updatedExports.length, 0);
    }
  });

  it("blocks manual Garmin update when stale export has no provider_workout_id", async () => {
    const existingExport = workoutExport({
      sync_status: "stale",
      provider_workout_id: null,
    });
    const mockFetch = createMockFetch(jsonResponse(deleteResponse()));
    const exportSaver = createExportSaver();
    const exportUpdater = createExportUpdater(existingExport);

    const result = await updateGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "UPDATE_NOT_ALLOWED");
    assert.match(result.message, /Garmin workout ID/);
    assert.equal(mockFetch.calls.length, 0);
    assert.equal(exportSaver.savedExports.length, 0);
    assert.equal(exportUpdater.updatedExports.length, 0);
  });

  it("updates stale Garmin export by deleting old workout and publishing current workout", async () => {
    const existingExport = workoutExport({ sync_status: "stale" });
    const exportSaver = createExportSaver();
    const exportUpdater = createExportUpdater(existingExport);
    const mockFetch = createMockFetch((url) => {
      if (String(url).endsWith("/garmin/workouts/delete")) {
        return jsonResponse(deleteResponse());
      }

      return jsonResponse(
        publishResponse({
          garmin_workout_id: "garmin-workout-new",
          garmin_schedule_id: "schedule-new",
        }),
      );
    });

    const result = await updateGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
        now: () => new Date("2026-05-13T12:10:00.000Z"),
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, "UPDATED");
    assert.equal(mockFetch.calls.length, 2);
    assert.equal(exportUpdater.updatedExports.length, 1);
    assert.equal(exportUpdater.updatedExports[0].sync_status, "deleted");
    assert.equal(exportSaver.savedExports.length, 1);
    assert.equal(exportSaver.savedExports[0].export_mode, "manual_update");
    assert.equal(exportSaver.savedExports[0].sync_status, "synced");
    assert.equal(
      exportSaver.savedExports[0].provider_workout_id,
      "garmin-workout-new",
    );
    assert.equal(
      exportSaver.savedExports[0].last_synced_at,
      "2026-05-13T12:10:00.000Z",
    );
  });

  it("marks manual update partial when delete fails but publish succeeds", async () => {
    const existingExport = workoutExport({ sync_status: "stale" });
    const exportSaver = createExportSaver();
    const exportUpdater = createExportUpdater(existingExport);
    const mockFetch = createMockFetch((url) => {
      if (String(url).endsWith("/garmin/workouts/delete")) {
        return jsonResponse(
          deleteResponse({
            ok: false,
            status: "GARMIN_REJECTED",
            warnings: ["Garmin did not confirm workout deletion."],
            error: "Garmin workout deletion failed.",
          }),
        );
      }

      return jsonResponse(
        publishResponse({
          garmin_workout_id: "garmin-workout-new",
        }),
      );
    });

    const result = await updateGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "UPDATED_PARTIAL");
    assert.equal(exportUpdater.updatedExports.length, 0);
    assert.equal(exportSaver.savedExports[0].sync_status, "partial");
    assert.equal(
      exportSaver.savedExports[0].provider_workout_id,
      "garmin-workout-new",
    );
    assert.match(exportSaver.savedExports[0].last_error, /duplicate/);
    assert.match(JSON.stringify(exportSaver.savedExports[0].warnings), /duplicate/);
  });

  it("marks manual update partial when old workout is unscheduled only", async () => {
    const existingExport = workoutExport({ sync_status: "stale" });
    const exportSaver = createExportSaver();
    const exportUpdater = createExportUpdater(existingExport);
    const mockFetch = createMockFetch((url) => {
      if (String(url).endsWith("/garmin/workouts/delete")) {
        return jsonResponse(
          deleteResponse({
            ok: true,
            status: "UNSCHEDULED_ONLY",
            warnings: ["The workout may still exist in the Garmin workout library."],
          }),
        );
      }

      return jsonResponse(
        publishResponse({
          garmin_workout_id: "garmin-workout-new",
        }),
      );
    });

    const result = await updateGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "UPDATED_PARTIAL");
    assert.equal(exportUpdater.updatedExports.length, 1);
    assert.equal(exportUpdater.updatedExports[0].sync_status, "partial");
    assert.equal(exportSaver.savedExports[0].sync_status, "partial");
    assert.match(
      JSON.stringify(exportSaver.savedExports[0].warnings),
      /workout library/,
    );
  });

  it("marks manual update failed when delete succeeds but replacement publish fails", async () => {
    const existingExport = workoutExport({ sync_status: "stale" });
    const exportSaver = createExportSaver();
    const exportUpdater = createExportUpdater(existingExport);
    const mockFetch = createMockFetch((url) => {
      if (String(url).endsWith("/garmin/workouts/delete")) {
        return jsonResponse(deleteResponse());
      }

      return jsonResponse(
        publishResponse({
          ok: false,
          status: "GARMIN_REJECTED",
          garmin_workout_id: null,
          garmin_schedule_id: null,
          error: "Garmin rejected the replacement workout.",
        }),
      );
    });

    const result = await updateGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "UPDATE_FAILED");
    assert.equal(exportUpdater.updatedExports[0].sync_status, "deleted");
    assert.equal(exportSaver.savedExports[0].sync_status, "failed");
    assert.match(result.message, /replacement failed/);
    assert.match(JSON.stringify(exportSaver.savedExports[0].warnings), /removed/);
  });

  it("marks manual update partial when replacement upload succeeds but schedule fails", async () => {
    const existingExport = workoutExport({ sync_status: "stale" });
    const exportSaver = createExportSaver();
    const exportUpdater = createExportUpdater(existingExport);
    const mockFetch = createMockFetch((url) => {
      if (String(url).endsWith("/garmin/workouts/delete")) {
        return jsonResponse(deleteResponse());
      }

      return jsonResponse(
        publishResponse({
          ok: false,
          status: "UPLOADED_NOT_SCHEDULED",
          garmin_workout_id: "garmin-workout-new",
          garmin_schedule_id: null,
          error: "Garmin workout uploaded, but scheduling failed.",
        }),
      );
    });

    const result = await updateGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "UPDATED_PARTIAL");
    assert.equal(exportUpdater.updatedExports[0].sync_status, "deleted");
    assert.equal(exportSaver.savedExports[0].sync_status, "partial");
    assert.equal(
      exportSaver.savedExports[0].provider_workout_id,
      "garmin-workout-new",
    );
  });

  it("marks manual update failed when delete and publish both fail", async () => {
    const existingExport = workoutExport({ sync_status: "stale" });
    const exportSaver = createExportSaver();
    const exportUpdater = createExportUpdater(existingExport);
    const mockFetch = createMockFetch((url) => {
      if (String(url).endsWith("/garmin/workouts/delete")) {
        return jsonResponse(
          deleteResponse({
            ok: false,
            status: "GARMIN_REJECTED",
            error: "Garmin workout deletion failed.",
          }),
        );
      }

      return jsonResponse(
        publishResponse({
          ok: false,
          status: "GARMIN_REJECTED",
          garmin_workout_id: null,
          garmin_schedule_id: null,
          error: "Garmin rejected the replacement workout.",
        }),
      );
    });

    const result = await updateGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "UPDATE_FAILED");
    assert.equal(exportUpdater.updatedExports.length, 0);
    assert.equal(exportSaver.savedExports[0].sync_status, "failed");
    assert.match(exportSaver.savedExports[0].last_error, /rejected/);
  });

  it("returns safe manual update errors for auth, config, and bridge failures", async () => {
    const existingExport = workoutExport({ sync_status: "stale" });
    const authFailureFetch = createMockFetch(
      jsonResponse(
        deleteResponse({
          ok: false,
          status: "AUTH_REQUIRED",
          error: "A local Garmin session could not be resumed.",
        }),
      ),
    );
    const authResult = await updateGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: authFailureFetch.fetchImpl,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
      }),
    );
    const configResult = await updateGarminWorkout(
      "workout-1",
      getDefaultOptions({
        apiKey: null,
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
      }),
    );
    const bridgeResult = await updateGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
        fetchWorkoutExportsForPlannedWorkout: async () => [existingExport],
      }),
    );

    assert.equal(authResult.status, "UPDATE_FAILED");
    assert.equal(authResult.exportRecord, null);
    assert.equal(configResult.status, "CONFIG_ERROR");
    assert.equal(bridgeResult.status, "BRIDGE_UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(authResult), /super-secret-bridge-key/);
    assert.doesNotMatch(JSON.stringify(configResult), /super-secret-bridge-key/);
    assert.doesNotMatch(JSON.stringify(bridgeResult), /super-secret-bridge-key/);
  });

  it("normalizes older lowercase bridge success status before tracking", async () => {
    const mockFetch = createMockFetch(
      jsonResponse(
        publishResponse({
          ok: true,
          status: "published",
          garmin_workout_id: "garmin-workout-1",
          garmin_schedule_id: "schedule-1",
          error: null,
        }),
      ),
    );
    const exportSaver = createExportSaver();

    const result = await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, "PUBLISHED");
    assert.equal(exportSaver.savedExports.length, 1);
    assert.equal(exportSaver.savedExports[0].sync_status, "synced");
    assert.equal(exportSaver.savedExports[0].last_error, null);
    assert.equal(
      exportSaver.savedExports[0].provider_workout_id,
      "garmin-workout-1",
    );
  });

  it("stores partial export status when upload succeeds but scheduling fails", async () => {
    const mockFetch = createMockFetch(
      jsonResponse(
        publishResponse({
          ok: false,
          status: "UPLOADED_NOT_SCHEDULED",
          garmin_workout_id: "garmin-workout-1",
          garmin_schedule_id: null,
          schedule_summary: {
            scheduled_date: "2026-05-20",
            garmin_schedule_id: null,
            result_type: "NOT_SCHEDULED",
            message: "Garmin workout upload succeeded, but scheduling failed.",
          },
          warnings: ["Workout may need manual cleanup in Garmin Connect."],
          error: "Garmin workout uploaded, but scheduling failed.",
        }),
      ),
    );
    const exportSaver = createExportSaver();

    const result = await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "UPLOADED_NOT_SCHEDULED");
    assert.equal(exportSaver.savedExports.length, 1);
    assert.equal(exportSaver.savedExports[0].sync_status, "partial");
    assert.equal(
      exportSaver.savedExports[0].provider_workout_id,
      "garmin-workout-1",
    );
    assert.equal(exportSaver.savedExports[0].provider_schedule_id, null);
    assert.match(exportSaver.savedExports[0].last_error, /scheduling failed/);
  });

  it("stores failed export status when the bridge publish fails", async () => {
    const mockFetch = createMockFetch(
      jsonResponse(
        publishResponse({
          ok: false,
          status: "GARMIN_REJECTED",
          garmin_workout_id: null,
          garmin_schedule_id: null,
          error: "Garmin rejected the workout.",
        }),
      ),
    );
    const exportSaver = createExportSaver();

    const result = await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "GARMIN_REJECTED");
    assert.equal(exportSaver.savedExports.length, 1);
    assert.equal(exportSaver.savedExports[0].sync_status, "failed");
    assert.equal(exportSaver.savedExports[0].provider_workout_id, null);
    assert.match(exportSaver.savedExports[0].last_error, /Garmin rejected/);
  });

  it("stores failed export status when the local bridge is unavailable", async () => {
    const exportSaver = createExportSaver();

    const result = await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
        saveWorkoutExport: exportSaver.saveWorkoutExport,
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "BRIDGE_UNAVAILABLE");
    assert.equal(result.message, "Garmin bridge is not reachable.");
    assert.equal(exportSaver.savedExports.length, 1);
    assert.equal(exportSaver.savedExports[0].sync_status, "failed");
    assert.equal(
      exportSaver.savedExports[0].last_error,
      "Garmin bridge is not reachable.",
    );
  });

  it("bulk publishes sequentially and preserves input order", async () => {
    const publishedIds = [];
    const delays = [];
    const exportSaver = createExportSaver();
    const mockFetch = createMockFetch(async (_url, init) => {
      const requestBody = JSON.parse(init.body);
      publishedIds.push(requestBody.planned_workout_id);

      return jsonResponse(
        publishResponse({
          planned_workout_id: requestBody.planned_workout_id,
          garmin_workout_id: `garmin-${requestBody.planned_workout_id}`,
        }),
      );
    });

    const result = await bulkPublishGarminWorkouts(
      ["workout-2", "workout-1", "workout-3"],
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        bulkDelayMs: 25,
        delay: async (milliseconds) => {
          delays.push(milliseconds);
        },
      }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(publishedIds, ["workout-2", "workout-1", "workout-3"]);
    assert.deepEqual(delays, [25, 25]);
    assert.deepEqual(
      result.results.map((publishResult) => publishResult.plannedWorkoutId),
      ["workout-2", "workout-1", "workout-3"],
    );
    assert.deepEqual(
      exportSaver.savedExports.map((workoutExport) => workoutExport.export_mode),
      ["bulk_publish", "bulk_publish", "bulk_publish"],
    );
  });

  it("bulk publishing continues after individual failures by default", async () => {
    const publishedIds = [];
    const exportSaver = createExportSaver();
    const mockFetch = createMockFetch(async (_url, init) => {
      const requestBody = JSON.parse(init.body);
      publishedIds.push(requestBody.planned_workout_id);

      if (requestBody.planned_workout_id === "workout-1") {
        return jsonResponse(
          publishResponse({
            ok: false,
            status: "GARMIN_REJECTED",
            garmin_workout_id: null,
            garmin_schedule_id: null,
            error: "Garmin rejected the workout.",
          }),
        );
      }

      return jsonResponse(
        publishResponse({
          planned_workout_id: requestBody.planned_workout_id,
          garmin_workout_id: `garmin-${requestBody.planned_workout_id}`,
        }),
      );
    });

    const result = await bulkPublishGarminWorkouts(
      ["workout-1", "workout-2"],
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        bulkDelayMs: 0,
      }),
    );

    assert.equal(result.ok, false);
    assert.deepEqual(publishedIds, ["workout-1", "workout-2"]);
    assert.deepEqual(
      result.results.map((publishResult) => publishResult.status),
      ["GARMIN_REJECTED", "PUBLISHED"],
    );
    assert.equal(exportSaver.savedExports.length, 2);
  });

  it("bulk publishing stops after first error when configured", async () => {
    const publishedIds = [];
    const exportSaver = createExportSaver();
    const mockFetch = createMockFetch(async (_url, init) => {
      const requestBody = JSON.parse(init.body);
      publishedIds.push(requestBody.planned_workout_id);

      return jsonResponse(
        publishResponse({
          ok: false,
          status: "GARMIN_REJECTED",
          garmin_workout_id: null,
          garmin_schedule_id: null,
          error: "Garmin rejected the workout.",
        }),
      );
    });

    const result = await bulkPublishGarminWorkouts(
      ["workout-1", "workout-2", "workout-3"],
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        stopOnError: true,
        bulkDelayMs: 0,
      }),
    );

    assert.equal(result.ok, false);
    assert.deepEqual(publishedIds, ["workout-1"]);
    assert.deepEqual(
      result.results.map((publishResult) => publishResult.plannedWorkoutId),
      ["workout-1"],
    );
    assert.equal(exportSaver.savedExports.length, 1);
  });

  it("bulk updates Garmin exports sequentially and preserves input order", async () => {
    const delays = [];
    const exportSaver = createExportSaver();
    const exportUpdater = createExportUpdater();
    const mockFetch = createMockFetch((url, init) => {
      const requestBody = JSON.parse(init.body);

      if (String(url).endsWith("/garmin/workouts/delete")) {
        return jsonResponse(
          deleteResponse({
            planned_workout_id: requestBody.planned_workout_id,
            garmin_workout_id: requestBody.garmin_workout_id,
          }),
        );
      }

      return jsonResponse(
        publishResponse({
          planned_workout_id: requestBody.planned_workout_id,
          garmin_workout_id: `garmin-new-${requestBody.planned_workout_id}`,
        }),
      );
    });

    const result = await bulkUpdateGarminWorkouts(
      ["workout-2", "workout-1"],
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
        fetchWorkoutExportsForPlannedWorkout: async (plannedWorkoutId) => [
          workoutExport({
            planned_workout_id: plannedWorkoutId,
            sync_status: "stale",
            provider_workout_id: `garmin-old-${plannedWorkoutId}`,
          }),
        ],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
        bulkDelayMs: 25,
        delay: async (milliseconds) => {
          delays.push(milliseconds);
        },
      }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.results.map((updateResult) => updateResult.plannedWorkoutId),
      ["workout-2", "workout-1"],
    );
    assert.deepEqual(
      mockFetch.calls.map((call) => [
        call.url.replace(bridgeUrl, ""),
        JSON.parse(call.init.body).planned_workout_id,
      ]),
      [
        ["/garmin/workouts/delete", "workout-2"],
        ["/garmin/workouts/publish", "workout-2"],
        ["/garmin/workouts/delete", "workout-1"],
        ["/garmin/workouts/publish", "workout-1"],
      ],
    );
    assert.deepEqual(delays, [25]);
    assert.equal(exportSaver.savedExports.length, 2);
    assert.equal(exportUpdater.updatedExports.length, 2);
  });

  it("bulk deletes Garmin exports sequentially and preserves input order", async () => {
    const delays = [];
    const exportUpdater = createExportUpdater();
    const mockFetch = createMockFetch((url, init) => {
      const requestBody = JSON.parse(init.body);

      assert.match(String(url), /\/garmin\/workouts\/delete$/);

      return jsonResponse(
        deleteResponse({
          planned_workout_id: requestBody.planned_workout_id,
          garmin_workout_id: requestBody.garmin_workout_id,
        }),
      );
    });

    const result = await bulkDeleteGarminWorkouts(
      ["workout-2", "workout-1"],
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        fetchWorkoutExportsForPlannedWorkout: async (plannedWorkoutId) => [
          workoutExport({
            planned_workout_id: plannedWorkoutId,
            sync_status: "synced",
            provider_workout_id: `garmin-old-${plannedWorkoutId}`,
          }),
        ],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
        bulkDelayMs: 25,
        delay: async (milliseconds) => {
          delays.push(milliseconds);
        },
      }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.results.map((deleteResult) => deleteResult.plannedWorkoutId),
      ["workout-2", "workout-1"],
    );
    assert.deepEqual(
      mockFetch.calls.map((call) => JSON.parse(call.init.body).planned_workout_id),
      ["workout-2", "workout-1"],
    );
    assert.deepEqual(delays, [25]);
    assert.equal(exportUpdater.updatedExports.length, 2);
  });

  it("bulk delete continues after individual failures by default", async () => {
    const exportUpdater = createExportUpdater();
    const mockFetch = createMockFetch((_url, init) => {
      const requestBody = JSON.parse(init.body);

      if (requestBody.planned_workout_id === "workout-1") {
        return jsonResponse(
          deleteResponse({
            ok: false,
            status: "GARMIN_REJECTED",
            error: "Garmin rejected the delete request.",
          }),
        );
      }

      return jsonResponse(
        deleteResponse({
          planned_workout_id: requestBody.planned_workout_id,
          garmin_workout_id: requestBody.garmin_workout_id,
        }),
      );
    });

    const result = await bulkDeleteGarminWorkouts(
      ["workout-1", "workout-2"],
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        fetchWorkoutExportsForPlannedWorkout: async (plannedWorkoutId) => [
          workoutExport({
            planned_workout_id: plannedWorkoutId,
            sync_status: "synced",
            provider_workout_id: `garmin-old-${plannedWorkoutId}`,
          }),
        ],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
        bulkDelayMs: 0,
      }),
    );

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.results.map((deleteResult) => deleteResult.status),
      ["GARMIN_REJECTED", "DELETED"],
    );
    assert.equal(mockFetch.calls.length, 2);
    assert.equal(exportUpdater.updatedExports.length, 1);
  });

  it("does not expose the bridge API key in bulk maintenance results", async () => {
    const mockFetch = createMockFetch(jsonResponse(deleteResponse()));
    const exportUpdater = createExportUpdater();

    const result = await bulkDeleteGarminWorkouts(
      ["workout-1"],
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        fetchWorkoutExportsForPlannedWorkout: async () => [
          workoutExport({ sync_status: "synced" }),
        ],
        updateWorkoutExportAfterGarminDelete:
          exportUpdater.updateWorkoutExportAfterGarminDelete,
      }),
    );

    assert.doesNotMatch(JSON.stringify(result), /super-secret-bridge-key/);
    assert.doesNotMatch(JSON.stringify(result), /X-Garmin-Bridge-Key/i);
  });

  it("does not return the bridge API key in result objects", async () => {
    const mockFetch = createMockFetch(jsonResponse(statusResponse()));

    const result = await getGarminBridgeStatus({
      bridgeUrl,
      apiKey: bridgeApiKey,
      fetchImpl: mockFetch.fetchImpl,
    });

    assert.doesNotMatch(JSON.stringify(result), /super-secret-bridge-key/);
  });

  it("does not store the bridge API key or request header in export records", async () => {
    const mockFetch = createMockFetch(jsonResponse(publishResponse()));
    const exportSaver = createExportSaver();

    await publishGarminWorkout(
      "workout-1",
      getDefaultOptions({
        fetchImpl: mockFetch.fetchImpl,
        saveWorkoutExport: exportSaver.saveWorkoutExport,
      }),
    );

    const serializedExport = JSON.stringify(exportSaver.savedExports[0]);

    assert.doesNotMatch(serializedExport, /super-secret-bridge-key/);
    assert.doesNotMatch(serializedExport, /X-Garmin-Bridge-Key/i);
    assert.doesNotMatch(serializedExport, /authorization/i);
    assert.doesNotMatch(serializedExport, /cookie/i);
    assert.doesNotMatch(serializedExport, /password/i);
    assert.doesNotMatch(serializedExport, /access_token/i);
    assert.doesNotMatch(serializedExport, /refresh_token/i);
    assert.doesNotMatch(serializedExport, /python-garminconnect/i);
    assert.doesNotMatch(serializedExport, /garminconnect/i);
  });

  it("rejects Cloudflare Access and bridge secret terms in workout export records", () => {
    const unsafeExport = {
      planned_workout_id: "workout-1",
      training_plan_id: "plan-1",
      profile_id: "profile-1",
      export_provider: "garmin_direct",
      export_mode: "single_publish",
      provider_workout_id: null,
      provider_schedule_id: null,
      sync_status: "failed",
      scheduled_date: "2026-05-20",
      last_synced_at: null,
      last_verified_at: null,
      last_error: "CF-Access-Client-Secret must not be stored.",
      warnings: [],
      payload_snapshot: {
        request_headers: {
          "X-Garmin-Bridge-Key": "secret",
        },
      },
    };

    assert.throws(
      () => assertSafeWorkoutExportInput(unsafeExport),
      /must not contain secrets/,
    );
  });
});
