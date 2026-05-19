import type {
  SaveWorkoutExportInput,
  UpdateWorkoutExportAfterGarminDeleteInput,
} from "../db/workoutExportShapes.ts";
import type {
  PlannedWorkout,
  WorkoutExport,
  WorkoutExportMode,
  WorkoutExportSyncStatus,
} from "../../types/training.ts";

const GARMIN_BRIDGE_HEADER = "X-Garmin-Bridge-Key";
const BRIDGE_NOT_RUNNING_MESSAGE = "Local Garmin bridge is not running.";
const DEFAULT_BULK_PUBLISH_DELAY_MS = 1500;

export type GarminBridgeStatusCategory =
  | "AUTHENTICATED"
  | "NOT_AUTHENTICATED"
  | "TOKEN_FILE_MISSING"
  | "TOKEN_EXPIRED_OR_INVALID"
  | "GARMIN_UNREACHABLE"
  | "UNKNOWN_ERROR";

export type GarminBridgeStatusResponse = {
  ok: boolean;
  authenticated: boolean;
  category: GarminBridgeStatusCategory;
  client_library: "python-garminconnect";
  client_version: string | null;
  token_file_exists: boolean;
  token_file_path: string;
  last_auth_check_at: string;
  message: string;
};

export type GarminBridgeTargetSummary = {
  target_type: string;
  target_min: number | null;
  target_max: number | null;
  target_unit: string | null;
  display: string;
};

export type GarminBridgeDebugSummary = {
  dry_run: boolean;
  client_library: "python-garminconnect";
  client_version: string | null;
  generated_step_count: number;
};

export type GarminBridgePreviewResponse = {
  ok: boolean;
  target_summary: GarminBridgeTargetSummary;
  step_count: number;
  repeat_count: number;
  pace_target_count: number;
  hr_target_count: number;
  warnings: string[];
  error: string | null;
  garmin_payload_preview: Record<string, unknown> | null;
};

export type GarminBridgePublishStatus =
  | "PUBLISHED"
  | "DRY_RUN"
  | "INVALID_WORKOUT"
  | "AUTH_REQUIRED"
  | "GARMIN_REJECTED"
  | "UPLOADED_NOT_SCHEDULED";

export type GarminBridgeScheduleSummary = {
  scheduled_date: string | null;
  garmin_schedule_id: string | null;
  result_type: "SCHEDULED" | "SCHEDULE_ID_UNAVAILABLE" | "NOT_SCHEDULED";
  message: string;
};

export type GarminBridgePublishResponse = {
  ok: boolean;
  status: GarminBridgePublishStatus;
  planned_workout_id: string;
  garmin_workout_id: string | null;
  garmin_schedule_id: string | null;
  scheduled_date: string | null;
  schedule_summary: GarminBridgeScheduleSummary | null;
  warnings: string[];
  error: string | null;
  target_summary: GarminBridgeTargetSummary;
  debug_summary: GarminBridgeDebugSummary | null;
};

type RawGarminBridgePublishResponse = Omit<
  GarminBridgePublishResponse,
  "status"
> & {
  status: string;
};

export type GarminBridgeDeleteStatus =
  | "DELETED"
  | "UNSCHEDULED_ONLY"
  | "SCHEDULE_DATE_REQUIRED"
  | "PAST_WORKOUT_BLOCKED"
  | "AUTH_REQUIRED"
  | "NOT_SUPPORTED"
  | "GARMIN_REJECTED"
  | "SCHEDULE_NOT_FOUND";

export type GarminBridgeDeleteResponse = {
  ok: boolean;
  status: GarminBridgeDeleteStatus;
  planned_workout_id: string;
  garmin_workout_id: string;
  warnings: string[];
  error: string | null;
};

export type GarminBridgeClientStatus =
  | "DISABLED"
  | "CONFIG_ERROR"
  | "BRIDGE_UNAVAILABLE"
  | "BRIDGE_UNAUTHORIZED"
  | "BRIDGE_ERROR"
  | GarminBridgeStatusCategory;

export type GarminBridgeWorkoutClientStatus =
  | "DISABLED"
  | "CONFIG_ERROR"
  | "BRIDGE_UNAVAILABLE"
  | "BRIDGE_UNAUTHORIZED"
  | "BRIDGE_ERROR"
  | "ALREADY_PUBLISHED"
  | "DELETE_NOT_ALLOWED"
  | "DELETE_TRACKING_FAILED"
  | "LOCAL_WORKOUT_ERROR"
  | "EXPORT_TRACKING_FAILED"
  | "PREVIEW_READY"
  | "PREVIEW_INVALID"
  | GarminBridgePublishStatus;

export type GarminBridgeStatusResult = {
  ok: boolean;
  enabled: boolean;
  status: GarminBridgeClientStatus;
  message: string;
  bridgeStatus: GarminBridgeStatusResponse | null;
};

export type GarminBridgePreviewResult = {
  ok: boolean;
  status: GarminBridgeWorkoutClientStatus;
  plannedWorkoutId: string;
  message: string;
  preview: GarminBridgePreviewResponse | null;
};

export type GarminBridgePublishResult = {
  ok: boolean;
  status: GarminBridgeWorkoutClientStatus;
  plannedWorkoutId: string;
  message: string;
  publish: GarminBridgePublishResponse | null;
  exportRecord: WorkoutExport | null;
  trackingError: string | null;
};

export type GarminBridgeDeleteResult = {
  ok: boolean;
  status:
    | "DELETED"
    | "UNSCHEDULED_ONLY"
    | "NOT_SUPPORTED"
    | "DELETE_NOT_ALLOWED"
    | "DELETE_TRACKING_FAILED"
    | "LOCAL_WORKOUT_ERROR"
    | "CONFIG_ERROR"
    | "DISABLED"
    | "BRIDGE_UNAVAILABLE"
    | "BRIDGE_UNAUTHORIZED"
    | "BRIDGE_ERROR"
    | "SCHEDULE_DATE_REQUIRED"
    | "PAST_WORKOUT_BLOCKED"
    | "AUTH_REQUIRED"
    | "GARMIN_REJECTED"
    | "SCHEDULE_NOT_FOUND";
  plannedWorkoutId: string;
  message: string;
  deleteResult: GarminBridgeDeleteResponse | null;
  exportRecord: WorkoutExport | null;
  trackingError: string | null;
};

export type GarminBridgeUpdateStatus =
  | "UPDATED"
  | "UPDATED_PARTIAL"
  | "UPDATE_FAILED"
  | "UPDATE_NOT_ALLOWED"
  | "EXPORT_TRACKING_FAILED"
  | "LOCAL_WORKOUT_ERROR"
  | "CONFIG_ERROR"
  | "DISABLED"
  | "BRIDGE_UNAVAILABLE"
  | "BRIDGE_UNAUTHORIZED"
  | "BRIDGE_ERROR";

export type GarminBridgeUpdateResult = {
  ok: boolean;
  status: GarminBridgeUpdateStatus;
  plannedWorkoutId: string;
  message: string;
  deleteResult: GarminBridgeDeleteResponse | null;
  publish: GarminBridgePublishResponse | null;
  exportRecord: WorkoutExport | null;
  oldExportRecord: WorkoutExport | null;
  trackingError: string | null;
};

export type GarminBridgeBulkPublishResult = {
  ok: boolean;
  message: string;
  results: GarminBridgePublishResult[];
};

export type GarminBridgeBulkUpdateResult = {
  ok: boolean;
  message: string;
  results: GarminBridgeUpdateResult[];
};

export type GarminBridgeBulkDeleteResult = {
  ok: boolean;
  message: string;
  results: GarminBridgeDeleteResult[];
};

type GarminBridgeConfig = {
  url: string;
  apiKey: string;
};

type GarminBridgeConfigProblem = {
  ok: false;
  status: "DISABLED" | "CONFIG_ERROR";
  message: string;
};

export type GarminBridgeClientOptions = {
  bridgeUrl?: string | null;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  fetchPlannedWorkoutById?: (
    plannedWorkoutId: string,
  ) => Promise<PlannedWorkout>;
  saveWorkoutExport?: (
    workoutExport: SaveWorkoutExportInput,
  ) => Promise<WorkoutExport>;
  updateWorkoutExportAfterGarminDelete?: (
    workoutExport: UpdateWorkoutExportAfterGarminDeleteInput,
  ) => Promise<WorkoutExport>;
  fetchWorkoutExportsForPlannedWorkout?: (
    plannedWorkoutId: string,
  ) => Promise<WorkoutExport[]>;
  now?: () => Date;
  exportMode?: WorkoutExportMode;
  targetWorkoutExport?: WorkoutExport;
  skipWorkoutExportTracking?: boolean;
  stopOnError?: boolean;
  bulkDelayMs?: number;
  delay?: (milliseconds: number) => Promise<void>;
};

type GarminBridgeWorkoutRequest = {
  planned_workout_id: string;
  workout_name: string;
  workout_date: string;
  sport: "Run";
  structured_workout: NonNullable<PlannedWorkout["structured_workout"]>;
  dry_run: boolean;
};

type GarminBridgeDeleteRequest = {
  planned_workout_id: string;
  garmin_workout_id: string;
  schedule_date: string;
};

type GarminBridgeRequestResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      status: "BRIDGE_UNAVAILABLE" | "BRIDGE_UNAUTHORIZED" | "BRIDGE_ERROR";
      message: string;
    };

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Garmin bridge client can only run on the server.");
  }
}

function getOptionalValue(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : null;
}

function getBridgeConfig(
  options: GarminBridgeClientOptions,
): GarminBridgeConfig | GarminBridgeConfigProblem {
  assertServerOnly();

  const url =
    "bridgeUrl" in options
      ? getOptionalValue(options.bridgeUrl)
      : getOptionalValue(process.env.GARMIN_BRIDGE_URL);

  if (!url) {
    return {
      ok: false,
      status: "DISABLED",
      message: "Direct Garmin export is disabled because GARMIN_BRIDGE_URL is not configured.",
    };
  }

  const apiKey =
    "apiKey" in options
      ? getOptionalValue(options.apiKey)
      : getOptionalValue(process.env.GARMIN_BRIDGE_API_KEY);

  if (!apiKey) {
    return {
      ok: false,
      status: "CONFIG_ERROR",
      message: "GARMIN_BRIDGE_API_KEY is missing. Add it to the server environment before using the local Garmin bridge.",
    };
  }

  return {
    url,
    apiKey,
  };
}

function isBridgeConfigProblem(
  config: GarminBridgeConfig | GarminBridgeConfigProblem,
): config is GarminBridgeConfigProblem {
  return "ok" in config && config.ok === false;
}

function buildBridgeUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const responseText = await response.text();

  if (!responseText.trim()) {
    return null;
  }

  return JSON.parse(responseText) as T;
}

async function callGarminBridge<T>(
  path: string,
  input: {
    config: GarminBridgeConfig;
    method?: "GET" | "POST";
    body?: unknown;
    fetchImpl?: typeof fetch;
  },
): Promise<GarminBridgeRequestResult<T>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const method = input.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    [GARMIN_BRIDGE_HEADER]: input.config.apiKey,
  };
  let body: string | undefined;

  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(input.body);
  }

  let response: Response;

  try {
    response = await fetchImpl(buildBridgeUrl(input.config.url, path), {
      method,
      headers,
      body,
    });
  } catch {
    return {
      ok: false,
      status: "BRIDGE_UNAVAILABLE",
      message: BRIDGE_NOT_RUNNING_MESSAGE,
    };
  }

  if (response.status === 401) {
    return {
      ok: false,
      status: "BRIDGE_UNAUTHORIZED",
      message: "Local Garmin bridge rejected the request. Check GARMIN_BRIDGE_API_KEY.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: "BRIDGE_ERROR",
      message: `Local Garmin bridge returned HTTP ${response.status}.`,
    };
  }

  try {
    const data = await parseJsonResponse<T>(response);

    if (!data) {
      return {
        ok: false,
        status: "BRIDGE_ERROR",
        message: "Local Garmin bridge returned an empty response.",
      };
    }

    return {
      ok: true,
      data,
    };
  } catch {
    return {
      ok: false,
      status: "BRIDGE_ERROR",
      message: "Local Garmin bridge returned an unreadable response.",
    };
  }
}

async function loadPlannedWorkout(
  plannedWorkoutId: string,
  options: GarminBridgeClientOptions,
): Promise<PlannedWorkout> {
  if (options.fetchPlannedWorkoutById) {
    return options.fetchPlannedWorkoutById(plannedWorkoutId);
  }

  const { fetchPlannedWorkoutById } = await import("../db/workouts.ts");

  return fetchPlannedWorkoutById(plannedWorkoutId);
}

function buildWorkoutRequest(
  plannedWorkout: PlannedWorkout,
  dryRun: boolean,
): GarminBridgeWorkoutRequest {
  if (!plannedWorkout.structured_workout) {
    throw new Error("This planned workout does not have a structured workout document yet.");
  }

  return {
    planned_workout_id: plannedWorkout.id,
    workout_name: plannedWorkout.title,
    workout_date: plannedWorkout.workout_date,
    sport: "Run",
    structured_workout: plannedWorkout.structured_workout,
    dry_run: dryRun,
  };
}

function localWorkoutErrorResult(
  plannedWorkoutId: string,
  error: unknown,
): GarminBridgePreviewResult {
  return {
    ok: false,
    status: "LOCAL_WORKOUT_ERROR",
    plannedWorkoutId,
    message:
      error instanceof Error
        ? error.message
        : "Could not load the planned workout.",
    preview: null,
  };
}

function localPublishErrorResult(
  plannedWorkoutId: string,
  error: unknown,
): GarminBridgePublishResult {
  return {
    ok: false,
    status: "LOCAL_WORKOUT_ERROR",
    plannedWorkoutId,
    message:
      error instanceof Error
        ? error.message
        : "Could not load the planned workout.",
    publish: null,
    exportRecord: null,
    trackingError: null,
  };
}

function previewMessage(preview: GarminBridgePreviewResponse): string {
  if (preview.ok) {
    return "Garmin workout preview generated.";
  }

  return preview.error ?? "Garmin workout preview failed.";
}

function publishMessage(publish: GarminBridgePublishResponse): string {
  if (publish.ok) {
    return "Garmin workout published and scheduled.";
  }

  return publish.error ?? "Garmin workout publish failed.";
}

function normalizePublishStatus(status: string): GarminBridgePublishStatus {
  const normalizedStatus = status.toUpperCase();

  if (normalizedStatus === "PUBLISHED") {
    return "PUBLISHED";
  }

  if (normalizedStatus === "DRY_RUN") {
    return "DRY_RUN";
  }

  if (normalizedStatus === "INVALID_WORKOUT") {
    return "INVALID_WORKOUT";
  }

  if (
    normalizedStatus === "AUTH_REQUIRED" ||
    normalizedStatus === "NOT_AUTHENTICATED"
  ) {
    return "AUTH_REQUIRED";
  }

  if (
    normalizedStatus === "GARMIN_REJECTED" ||
    normalizedStatus === "UPLOAD_FAILED" ||
    normalizedStatus === "NOT_PUBLISHED"
  ) {
    return "GARMIN_REJECTED";
  }

  if (
    normalizedStatus === "UPLOADED_NOT_SCHEDULED" ||
    normalizedStatus === "SCHEDULE_FAILED"
  ) {
    return "UPLOADED_NOT_SCHEDULED";
  }

  return "GARMIN_REJECTED";
}

function normalizePublishResponse(
  response: RawGarminBridgePublishResponse,
): GarminBridgePublishResponse {
  const status = normalizePublishStatus(response.status);

  return {
    ...response,
    ok: response.ok || status === "PUBLISHED",
    status,
  };
}

function getExportMode(options: GarminBridgeClientOptions): WorkoutExportMode {
  return options.exportMode ?? "single_publish";
}

function getNowIso(options: GarminBridgeClientOptions): string {
  return (options.now ?? (() => new Date()))().toISOString();
}

function mapPublishStatusToExportStatus(
  status: GarminBridgeWorkoutClientStatus,
): WorkoutExportSyncStatus {
  if (status === "PUBLISHED") {
    return "synced";
  }

  if (status === "UPLOADED_NOT_SCHEDULED") {
    return "partial";
  }

  return "failed";
}

function getEffectiveGarminExportStatus(
  exportRecord: WorkoutExport,
): WorkoutExportSyncStatus {
  if (
    exportRecord.sync_status === "failed" &&
    exportRecord.provider_workout_id &&
    exportRecord.last_error === "Garmin workout published and scheduled."
  ) {
    return "synced";
  }

  return exportRecord.sync_status;
}

function getLatestDirectGarminExport(
  workoutExports: WorkoutExport[],
): WorkoutExport | null {
  let latestExport: WorkoutExport | null = null;

  for (const workoutExport of workoutExports) {
    if (workoutExport.export_provider !== "garmin_direct") {
      continue;
    }

    if (
      !latestExport ||
      workoutExport.created_at.localeCompare(latestExport.created_at) > 0
    ) {
      latestExport = workoutExport;
    }
  }

  return latestExport;
}

function getExistingGarminExportWarning(
  exportRecord: WorkoutExport | null,
): string | null {
  if (!exportRecord) {
    return null;
  }

  const syncStatus = getEffectiveGarminExportStatus(exportRecord);

  if (syncStatus === "stale") {
    return "Changed after Garmin export — use Update Garmin Export.";
  }

  if (syncStatus === "partial") {
    return "Workout may already exist in Garmin. Delete or update it instead of publishing a duplicate.";
  }

  if (syncStatus === "synced") {
    return "Already published to Garmin.";
  }

  if (syncStatus === "failed" && exportRecord.provider_workout_id) {
    return "A previous Garmin export has a Garmin workout ID. Delete or update it before publishing again.";
  }

  return null;
}

async function fetchExistingWorkoutExports(
  plannedWorkoutId: string,
  options: GarminBridgeClientOptions,
): Promise<WorkoutExport[]> {
  if (options.fetchWorkoutExportsForPlannedWorkout) {
    return options.fetchWorkoutExportsForPlannedWorkout(plannedWorkoutId);
  }

  const { fetchWorkoutExportsForPlannedWorkout } = await import(
    "../db/workoutExports.ts"
  );

  return fetchWorkoutExportsForPlannedWorkout(plannedWorkoutId);
}

async function getDirectGarminPublishGuard(
  plannedWorkoutId: string,
  options: GarminBridgeClientOptions,
): Promise<
  | {
      ok: true;
      existingExport: WorkoutExport | null;
      warning: string | null;
      blocked: boolean;
    }
  | {
      ok: false;
      message: string;
    }
> {
  let existingExports: WorkoutExport[];

  try {
    existingExports = await fetchExistingWorkoutExports(plannedWorkoutId, options);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not check existing Garmin exports.";

    return {
      ok: false,
      message: `Could not check existing Garmin exports before publishing: ${message}`,
    };
  }

  const existingExport = getLatestDirectGarminExport(existingExports);
  const warning = getExistingGarminExportWarning(existingExport);
  const blocked =
    existingExport !== null &&
    (getEffectiveGarminExportStatus(existingExport) === "synced" ||
      getEffectiveGarminExportStatus(existingExport) === "stale" ||
      getEffectiveGarminExportStatus(existingExport) === "partial" ||
      (getEffectiveGarminExportStatus(existingExport) === "failed" &&
        Boolean(existingExport.provider_workout_id)));

  return {
    ok: true,
    existingExport,
    warning,
    blocked,
  };
}

function addPublishWarning(
  publish: GarminBridgePublishResponse,
  warning: string | null,
): GarminBridgePublishResponse {
  if (!warning || publish.warnings.includes(warning)) {
    return publish;
  }

  return {
    ...publish,
    warnings: [warning, ...publish.warnings],
  };
}

function sanitizeExportErrorMessage(message: string | null): string | null {
  if (!message) {
    return null;
  }

  if (message.includes("GARMIN_BRIDGE_API_KEY")) {
    return "Garmin bridge API key is missing or invalid.";
  }

  return message;
}

function buildWorkoutExportInput(input: {
  plannedWorkout: PlannedWorkout;
  request: GarminBridgeWorkoutRequest | null;
  result: GarminBridgePublishResult;
  exportMode: WorkoutExportMode;
  nowIso: string;
}): SaveWorkoutExportInput {
  const syncStatus = mapPublishStatusToExportStatus(input.result.status);
  const publish = input.result.publish;
  const warnings = publish?.warnings ?? [];
  const lastError =
    syncStatus === "failed" || syncStatus === "partial"
      ? sanitizeExportErrorMessage(publish?.error ?? input.result.message)
      : null;

  return {
    planned_workout_id: input.plannedWorkout.id,
    training_plan_id: input.plannedWorkout.training_plan_id,
    profile_id: input.plannedWorkout.profile_id,
    export_provider: "garmin_direct",
    export_mode: input.exportMode,
    provider_workout_id: publish?.garmin_workout_id ?? null,
    provider_schedule_id: publish?.garmin_schedule_id ?? null,
    sync_status: syncStatus,
    scheduled_date:
      publish?.scheduled_date ??
      input.request?.workout_date ??
      input.plannedWorkout.workout_date,
    last_synced_at: syncStatus === "synced" ? input.nowIso : null,
    last_verified_at: null,
    last_error: lastError,
    warnings,
    payload_snapshot: {
      provider: "garmin_direct",
      export_mode: input.exportMode,
      planned_workout_id: input.plannedWorkout.id,
      workout_name: input.plannedWorkout.title,
      workout_date: input.plannedWorkout.workout_date,
      bridge_request: input.request,
      bridge_result: {
        ok: publish?.ok ?? input.result.ok,
        status: publish?.status ?? input.result.status,
        provider_workout_id: publish?.garmin_workout_id ?? null,
        provider_schedule_id: publish?.garmin_schedule_id ?? null,
        scheduled_date: publish?.scheduled_date ?? null,
        schedule_summary: publish?.schedule_summary ?? null,
        target_summary: publish?.target_summary ?? null,
        debug_summary: publish?.debug_summary ?? null,
        error: sanitizeExportErrorMessage(publish?.error ?? input.result.message),
        warnings,
      },
    },
  };
}

async function saveWorkoutExportRecord(
  workoutExport: SaveWorkoutExportInput,
  options: GarminBridgeClientOptions,
): Promise<WorkoutExport> {
  if (options.saveWorkoutExport) {
    return options.saveWorkoutExport(workoutExport);
  }

  const { saveWorkoutExport } = await import("../db/workoutExports.ts");

  return saveWorkoutExport(workoutExport);
}

async function updateWorkoutExportAfterDeleteRecord(
  workoutExport: UpdateWorkoutExportAfterGarminDeleteInput,
  options: GarminBridgeClientOptions,
): Promise<WorkoutExport> {
  if (options.updateWorkoutExportAfterGarminDelete) {
    return options.updateWorkoutExportAfterGarminDelete(workoutExport);
  }

  const { updateGarminWorkoutExportAfterDelete } = await import(
    "../db/workoutExports.ts"
  );

  return updateGarminWorkoutExportAfterDelete(workoutExport);
}

function canDeleteDirectGarminExport(
  exportRecord: WorkoutExport | null,
): exportRecord is WorkoutExport {
  if (!exportRecord || exportRecord.export_provider !== "garmin_direct") {
    return false;
  }

  const syncStatus = getEffectiveGarminExportStatus(exportRecord);

  return (
    syncStatus === "synced" ||
    syncStatus === "stale" ||
    syncStatus === "partial"
  );
}

function canUpdateDirectGarminExport(
  exportRecord: WorkoutExport | null,
): exportRecord is WorkoutExport {
  return (
    exportRecord?.export_provider === "garmin_direct" &&
    getEffectiveGarminExportStatus(exportRecord) === "stale"
  );
}

function deleteMessage(deleteResult: GarminBridgeDeleteResponse): string {
  if (deleteResult.status === "DELETED") {
    return "Garmin workout delete request completed. Confirm it is gone in Garmin Connect and on the watch.";
  }

  if (deleteResult.status === "UNSCHEDULED_ONLY") {
    return "Garmin workout was unscheduled, but it may still exist in the Garmin workout library.";
  }

  if (deleteResult.status === "NOT_SUPPORTED") {
    return "The local Garmin bridge cannot delete this workout with the installed Garmin client. Delete it manually in Garmin Connect.";
  }

  return deleteResult.error ?? "Garmin workout delete failed.";
}

function buildDeleteTrackingInput(input: {
  exportRecord: WorkoutExport;
  plannedWorkout: PlannedWorkout;
  request: GarminBridgeDeleteRequest;
  deleteResult: GarminBridgeDeleteResponse;
  syncStatus: Extract<WorkoutExportSyncStatus, "deleted" | "partial">;
  nowIso: string;
}): UpdateWorkoutExportAfterGarminDeleteInput {
  return {
    id: input.exportRecord.id,
    sync_status: input.syncStatus,
    last_synced_at: input.nowIso,
    last_error:
      input.syncStatus === "partial"
        ? sanitizeExportErrorMessage(input.deleteResult.error ?? deleteMessage(input.deleteResult))
        : null,
    warnings: input.deleteResult.warnings,
    payload_snapshot: {
      provider: "garmin_direct",
      action: "manual_delete",
      planned_workout_id: input.plannedWorkout.id,
      garmin_workout_id: input.request.garmin_workout_id,
      schedule_date: input.request.schedule_date,
      bridge_result: {
        ok: input.deleteResult.ok,
        status: input.deleteResult.status,
        error: sanitizeExportErrorMessage(input.deleteResult.error),
        warnings: input.deleteResult.warnings,
      },
    },
  };
}

function buildManualUpdateExportInput(input: {
  plannedWorkout: PlannedWorkout;
  request: GarminBridgeWorkoutRequest | null;
  deleteRequest: GarminBridgeDeleteRequest;
  deleteResult: GarminBridgeDeleteResponse | null;
  publish: GarminBridgePublishResponse | null;
  syncStatus: WorkoutExportSyncStatus;
  warnings: string[];
  lastError: string | null;
  nowIso: string;
}): SaveWorkoutExportInput {
  return {
    planned_workout_id: input.plannedWorkout.id,
    training_plan_id: input.plannedWorkout.training_plan_id,
    profile_id: input.plannedWorkout.profile_id,
    export_provider: "garmin_direct",
    export_mode: "manual_update",
    provider_workout_id: input.publish?.garmin_workout_id ?? null,
    provider_schedule_id: input.publish?.garmin_schedule_id ?? null,
    sync_status: input.syncStatus,
    scheduled_date:
      input.publish?.scheduled_date ??
      input.request?.workout_date ??
      input.plannedWorkout.workout_date,
    last_synced_at: input.syncStatus === "synced" ? input.nowIso : null,
    last_verified_at: null,
    last_error: sanitizeExportErrorMessage(input.lastError),
    warnings: input.warnings,
    payload_snapshot: {
      provider: "garmin_direct",
      export_mode: "manual_update",
      planned_workout_id: input.plannedWorkout.id,
      workout_name: input.plannedWorkout.title,
      workout_date: input.plannedWorkout.workout_date,
      old_garmin_workout_id: input.deleteRequest.garmin_workout_id,
      bridge_request: input.request,
      delete_summary: input.deleteResult
        ? {
            ok: input.deleteResult.ok,
            status: input.deleteResult.status,
            old_garmin_workout_id: input.deleteResult.garmin_workout_id,
            error: sanitizeExportErrorMessage(input.deleteResult.error),
            warnings: input.deleteResult.warnings,
          }
        : null,
      publish_summary: input.publish
        ? {
            ok: input.publish.ok,
            status: input.publish.status,
            provider_workout_id: input.publish.garmin_workout_id,
            provider_schedule_id: input.publish.garmin_schedule_id,
            scheduled_date: input.publish.scheduled_date,
            schedule_summary: input.publish.schedule_summary,
            target_summary: input.publish.target_summary,
            debug_summary: input.publish.debug_summary,
            error: sanitizeExportErrorMessage(input.publish.error),
            warnings: input.publish.warnings,
          }
        : null,
    },
  };
}

function getManualUpdateWarnings(input: {
  deleteResult: GarminBridgeDeleteResponse | null;
  publish: GarminBridgePublishResponse | null;
}): string[] {
  const warnings = [
    ...(input.deleteResult?.warnings ?? []),
    ...(input.publish?.warnings ?? []),
  ];

  if (input.deleteResult?.status === "UNSCHEDULED_ONLY") {
    warnings.unshift(
      "Old Garmin workout may still exist in the Garmin workout library.",
    );
  } else if (input.deleteResult && input.deleteResult.status !== "DELETED") {
    warnings.unshift("Older duplicate may remain in Garmin.");
  }

  if (input.deleteResult?.status === "DELETED" && input.publish?.ok === false) {
    warnings.unshift("Garmin workout was removed, but replacement failed.");
  }

  return [...new Set(warnings)];
}

function getManualUpdateFinalState(input: {
  deleteResult: GarminBridgeDeleteResponse | null;
  publish: GarminBridgePublishResponse | null;
  publishRequestError: string | null;
}): {
  ok: boolean;
  status: GarminBridgeUpdateStatus;
  syncStatus: WorkoutExportSyncStatus;
  message: string;
  lastError: string | null;
  warnings: string[];
} {
  const warnings = getManualUpdateWarnings(input);
  const publish = input.publish;
  const deleteStatus = input.deleteResult?.status ?? null;
  const publishError =
    input.publishRequestError ?? publish?.error ?? "Garmin update failed.";

  if (publish?.status === "PUBLISHED" && deleteStatus === "DELETED") {
    return {
      ok: true,
      status: "UPDATED",
      syncStatus: "synced",
      message: "Garmin export updated.",
      lastError: null,
      warnings,
    };
  }

  if (publish?.status === "PUBLISHED") {
    return {
      ok: false,
      status: "UPDATED_PARTIAL",
      syncStatus: "partial",
      message:
        "Garmin export was published, but the old Garmin workout may still remain.",
      lastError: "Older duplicate may remain in Garmin.",
      warnings,
    };
  }

  if (publish?.status === "UPLOADED_NOT_SCHEDULED") {
    return {
      ok: false,
      status: "UPDATED_PARTIAL",
      syncStatus: "partial",
      message:
        "Garmin workout was uploaded, but scheduling did not fully complete.",
      lastError: publish.error ?? "Garmin workout uploaded, but scheduling failed.",
      warnings,
    };
  }

  if (deleteStatus === "DELETED") {
    return {
      ok: false,
      status: "UPDATE_FAILED",
      syncStatus: "failed",
      message: "Old Garmin workout was removed, but replacement failed.",
      lastError: publishError,
      warnings,
    };
  }

  return {
    ok: false,
    status: "UPDATE_FAILED",
    syncStatus: "failed",
    message: "Garmin export update failed.",
    lastError: publishError,
    warnings,
  };
}

function getBulkPublishDelayMs(options: GarminBridgeClientOptions): number {
  if (options.bulkDelayMs === undefined) {
    return DEFAULT_BULK_PUBLISH_DELAY_MS;
  }

  return Math.max(0, options.bulkDelayMs);
}

async function waitBetweenBulkPublishes(
  options: GarminBridgeClientOptions,
): Promise<void> {
  const delayMs = getBulkPublishDelayMs(options);

  if (delayMs === 0) {
    return;
  }

  if (options.delay) {
    await options.delay(delayMs);
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function attachExportTracking(
  result: GarminBridgePublishResult,
  input: {
    plannedWorkout: PlannedWorkout;
    request: GarminBridgeWorkoutRequest | null;
    options: GarminBridgeClientOptions;
  },
): Promise<GarminBridgePublishResult> {
  try {
    const exportRecord = await saveWorkoutExportRecord(
      buildWorkoutExportInput({
        plannedWorkout: input.plannedWorkout,
        request: input.request,
        result,
        exportMode: getExportMode(input.options),
        nowIso: getNowIso(input.options),
      }),
      input.options,
    );

    return {
      ...result,
      exportRecord,
      trackingError: null,
    };
  } catch (error) {
    const trackingError =
      error instanceof Error
        ? error.message
        : "Could not save Garmin export tracking.";

    return {
      ...result,
      ok: false,
      status: "EXPORT_TRACKING_FAILED",
      message: `${result.message} Export tracking could not be saved: ${trackingError}`,
      exportRecord: null,
      trackingError,
    };
  }
}

export async function getGarminBridgeStatus(
  options: GarminBridgeClientOptions = {},
): Promise<GarminBridgeStatusResult> {
  const config = getBridgeConfig(options);

  if (isBridgeConfigProblem(config)) {
    return {
      ok: false,
      enabled: config.status !== "DISABLED",
      status: config.status,
      message: config.message,
      bridgeStatus: null,
    };
  }

  const result = await callGarminBridge<GarminBridgeStatusResponse>(
    "/garmin/status",
    {
      config,
      fetchImpl: options.fetchImpl,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      enabled: true,
      status: result.status,
      message: result.message,
      bridgeStatus: null,
    };
  }

  return {
    ok: result.data.ok,
    enabled: true,
    status: result.data.category,
    message: result.data.message,
    bridgeStatus: result.data,
  };
}

export async function previewGarminWorkout(
  plannedWorkoutId: string,
  options: GarminBridgeClientOptions = {},
): Promise<GarminBridgePreviewResult> {
  const config = getBridgeConfig(options);

  if (isBridgeConfigProblem(config)) {
    return {
      ok: false,
      status: config.status,
      plannedWorkoutId,
      message: config.message,
      preview: null,
    };
  }

  let request: GarminBridgeWorkoutRequest;

  try {
    const plannedWorkout = await loadPlannedWorkout(plannedWorkoutId, options);
    request = buildWorkoutRequest(plannedWorkout, true);
  } catch (error) {
    return localWorkoutErrorResult(plannedWorkoutId, error);
  }

  const result = await callGarminBridge<GarminBridgePreviewResponse>(
    "/garmin/workouts/preview",
    {
      config,
      method: "POST",
      body: request,
      fetchImpl: options.fetchImpl,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      plannedWorkoutId,
      message: result.message,
      preview: null,
    };
  }

  return {
    ok: result.data.ok,
    status: result.data.ok ? "PREVIEW_READY" : "PREVIEW_INVALID",
    plannedWorkoutId,
    message: previewMessage(result.data),
    preview: result.data,
  };
}

export async function publishGarminWorkout(
  plannedWorkoutId: string,
  options: GarminBridgeClientOptions = {},
): Promise<GarminBridgePublishResult> {
  assertServerOnly();

  let plannedWorkout: PlannedWorkout;
  let request: GarminBridgeWorkoutRequest;

  try {
    plannedWorkout = await loadPlannedWorkout(plannedWorkoutId, options);
  } catch (error) {
    return localPublishErrorResult(plannedWorkoutId, error);
  }

  const publishGuard = await getDirectGarminPublishGuard(
    plannedWorkout.id,
    options,
  );

  if (!publishGuard.ok) {
    return {
      ok: false,
      status: "EXPORT_TRACKING_FAILED",
      plannedWorkoutId,
      message: publishGuard.message,
      publish: null,
      exportRecord: null,
      trackingError: publishGuard.message,
    };
  }

  if (publishGuard.blocked) {
    return {
      ok: false,
      status: "ALREADY_PUBLISHED",
      plannedWorkoutId,
      message: publishGuard.warning ?? "Already published to Garmin.",
      publish: null,
      exportRecord: publishGuard.existingExport,
      trackingError: null,
    };
  }

  try {
    request = buildWorkoutRequest(plannedWorkout, false);
  } catch (error) {
    return attachExportTracking(localPublishErrorResult(plannedWorkoutId, error), {
      plannedWorkout,
      request: null,
      options,
    });
  }

  const config = getBridgeConfig(options);

  if (isBridgeConfigProblem(config)) {
    return attachExportTracking(
      {
        ok: false,
        status: config.status,
        plannedWorkoutId,
        message: config.message,
        publish: null,
        exportRecord: null,
        trackingError: null,
      },
      {
        plannedWorkout,
        request,
        options,
      },
    );
  }

  const result = await callGarminBridge<RawGarminBridgePublishResponse>(
    "/garmin/workouts/publish",
    {
      config,
      method: "POST",
      body: request,
      fetchImpl: options.fetchImpl,
    },
  );

  if (!result.ok) {
    return attachExportTracking(
      {
        ok: false,
        status: result.status,
        plannedWorkoutId,
        message: result.message,
        publish: null,
        exportRecord: null,
        trackingError: null,
      },
      {
        plannedWorkout,
        request,
        options,
      },
    );
  }

  const publish = addPublishWarning(
    normalizePublishResponse(result.data),
    publishGuard.warning,
  );
  const messagePrefix = publishGuard.warning ? `${publishGuard.warning} ` : "";

  return attachExportTracking(
    {
      ok: publish.ok,
      status: publish.status,
      plannedWorkoutId,
      message: `${messagePrefix}${publishMessage(publish)}`,
      publish,
      exportRecord: null,
      trackingError: null,
    },
    {
      plannedWorkout,
      request,
      options,
    },
  );
}

export async function deleteGarminWorkout(
  plannedWorkoutId: string,
  options: GarminBridgeClientOptions = {},
): Promise<GarminBridgeDeleteResult> {
  assertServerOnly();

  let plannedWorkout: PlannedWorkout;

  try {
    plannedWorkout = await loadPlannedWorkout(plannedWorkoutId, options);
  } catch (error) {
    return {
      ok: false,
      status: "LOCAL_WORKOUT_ERROR",
      plannedWorkoutId,
      message:
        error instanceof Error
          ? error.message
          : "Could not load the planned workout.",
      deleteResult: null,
      exportRecord: null,
      trackingError: null,
    };
  }

  let existingExports: WorkoutExport[];

  try {
    existingExports = await fetchExistingWorkoutExports(
      plannedWorkout.id,
      options,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not check existing Garmin exports.";

    return {
      ok: false,
      status: "DELETE_TRACKING_FAILED",
      plannedWorkoutId,
      message: `Could not check existing Garmin exports before deleting: ${message}`,
      deleteResult: null,
      exportRecord: null,
      trackingError: message,
    };
  }

  const existingExport =
    options.targetWorkoutExport ?? getLatestDirectGarminExport(existingExports);

  if (!canDeleteDirectGarminExport(existingExport)) {
    return {
      ok: false,
      status: "DELETE_NOT_ALLOWED",
      plannedWorkoutId,
      message:
        "Delete from Garmin is only available for synced, stale, or partial direct Garmin exports.",
      deleteResult: null,
      exportRecord: existingExport,
      trackingError: null,
    };
  }

  if (!existingExport.provider_workout_id) {
    return {
      ok: false,
      status: "DELETE_NOT_ALLOWED",
      plannedWorkoutId,
      message:
        "This Garmin export does not have a Garmin workout ID, so it cannot be deleted automatically.",
      deleteResult: null,
      exportRecord: existingExport,
      trackingError: null,
    };
  }

  const config = getBridgeConfig(options);

  if (isBridgeConfigProblem(config)) {
    return {
      ok: false,
      status: config.status,
      plannedWorkoutId,
      message: config.message,
      deleteResult: null,
      exportRecord: existingExport,
      trackingError: null,
    };
  }

  const request: GarminBridgeDeleteRequest = {
    planned_workout_id: plannedWorkout.id,
    garmin_workout_id: existingExport.provider_workout_id,
    schedule_date: existingExport.scheduled_date ?? plannedWorkout.workout_date,
  };

  const result = await callGarminBridge<GarminBridgeDeleteResponse>(
    "/garmin/workouts/delete",
    {
      config,
      method: "POST",
      body: request,
      fetchImpl: options.fetchImpl,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      plannedWorkoutId,
      message: result.message,
      deleteResult: null,
      exportRecord: existingExport,
      trackingError: null,
    };
  }

  const deleteResult = result.data;

  if (deleteResult.status === "DELETED" || deleteResult.status === "UNSCHEDULED_ONLY") {
    const syncStatus = deleteResult.status === "DELETED" ? "deleted" : "partial";

    if (options.skipWorkoutExportTracking) {
      return {
        ok: deleteResult.status === "DELETED",
        status: deleteResult.status,
        plannedWorkoutId,
        message: deleteMessage(deleteResult),
        deleteResult,
        exportRecord: existingExport,
        trackingError: null,
      };
    }

    try {
      const exportRecord = await updateWorkoutExportAfterDeleteRecord(
        buildDeleteTrackingInput({
          exportRecord: existingExport,
          plannedWorkout,
          request,
          deleteResult,
          syncStatus,
          nowIso: getNowIso(options),
        }),
        options,
      );

      return {
        ok: deleteResult.status === "DELETED",
        status: deleteResult.status,
        plannedWorkoutId,
        message: deleteMessage(deleteResult),
        deleteResult,
        exportRecord,
        trackingError: null,
      };
    } catch (error) {
      const trackingError =
        error instanceof Error
          ? error.message
          : "Could not save Garmin delete tracking.";

      return {
        ok: false,
        status: "DELETE_TRACKING_FAILED",
        plannedWorkoutId,
        message: `${deleteMessage(deleteResult)} Export tracking could not be saved: ${trackingError}`,
        deleteResult,
        exportRecord: null,
        trackingError,
      };
    }
  }

  return {
    ok: false,
    status: deleteResult.status,
    plannedWorkoutId,
    message: deleteMessage(deleteResult),
    deleteResult,
    exportRecord: existingExport,
    trackingError: null,
  };
}

export async function updateGarminWorkout(
  plannedWorkoutId: string,
  options: GarminBridgeClientOptions = {},
): Promise<GarminBridgeUpdateResult> {
  assertServerOnly();

  let plannedWorkout: PlannedWorkout;
  let request: GarminBridgeWorkoutRequest;

  try {
    plannedWorkout = await loadPlannedWorkout(plannedWorkoutId, options);
    request = buildWorkoutRequest(plannedWorkout, false);
  } catch (error) {
    return {
      ok: false,
      status: "LOCAL_WORKOUT_ERROR",
      plannedWorkoutId,
      message:
        error instanceof Error
          ? error.message
          : "Could not load the planned workout.",
      deleteResult: null,
      publish: null,
      exportRecord: null,
      oldExportRecord: null,
      trackingError: null,
    };
  }

  let existingExports: WorkoutExport[];

  try {
    existingExports = await fetchExistingWorkoutExports(
      plannedWorkout.id,
      options,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not check existing Garmin exports.";

    return {
      ok: false,
      status: "EXPORT_TRACKING_FAILED",
      plannedWorkoutId,
      message: `Could not check existing Garmin exports before updating: ${message}`,
      deleteResult: null,
      publish: null,
      exportRecord: null,
      oldExportRecord: null,
      trackingError: message,
    };
  }

  const existingExport = getLatestDirectGarminExport(existingExports);

  if (!canUpdateDirectGarminExport(existingExport)) {
    return {
      ok: false,
      status: "UPDATE_NOT_ALLOWED",
      plannedWorkoutId,
      message:
        "Update Garmin Export is only available for stale direct Garmin exports.",
      deleteResult: null,
      publish: null,
      exportRecord: null,
      oldExportRecord: existingExport,
      trackingError: null,
    };
  }

  if (!existingExport.provider_workout_id) {
    return {
      ok: false,
      status: "UPDATE_NOT_ALLOWED",
      plannedWorkoutId,
      message:
        "This stale Garmin export does not have a Garmin workout ID, so it cannot be updated automatically.",
      deleteResult: null,
      publish: null,
      exportRecord: null,
      oldExportRecord: existingExport,
      trackingError: null,
    };
  }

  const config = getBridgeConfig(options);

  if (isBridgeConfigProblem(config)) {
    return {
      ok: false,
      status: config.status,
      plannedWorkoutId,
      message: config.message,
      deleteResult: null,
      publish: null,
      exportRecord: null,
      oldExportRecord: existingExport,
      trackingError: null,
    };
  }

  const deleteRequest: GarminBridgeDeleteRequest = {
    planned_workout_id: plannedWorkout.id,
    garmin_workout_id: existingExport.provider_workout_id,
    schedule_date: existingExport.scheduled_date ?? plannedWorkout.workout_date,
  };

  const deleteRequestResult = await callGarminBridge<GarminBridgeDeleteResponse>(
    "/garmin/workouts/delete",
    {
      config,
      method: "POST",
      body: deleteRequest,
      fetchImpl: options.fetchImpl,
    },
  );

  if (!deleteRequestResult.ok) {
    return {
      ok: false,
      status: deleteRequestResult.status,
      plannedWorkoutId,
      message: deleteRequestResult.message,
      deleteResult: null,
      publish: null,
      exportRecord: null,
      oldExportRecord: existingExport,
      trackingError: null,
    };
  }

  const deleteResult = deleteRequestResult.data;

  if (deleteResult.status === "AUTH_REQUIRED") {
    return {
      ok: false,
      status: "UPDATE_FAILED",
      plannedWorkoutId,
      message: deleteMessage(deleteResult),
      deleteResult,
      publish: null,
      exportRecord: null,
      oldExportRecord: existingExport,
      trackingError: null,
    };
  }

  const publishRequestResult = await callGarminBridge<RawGarminBridgePublishResponse>(
    "/garmin/workouts/publish",
    {
      config,
      method: "POST",
      body: request,
      fetchImpl: options.fetchImpl,
    },
  );
  const publish = publishRequestResult.ok
    ? normalizePublishResponse(publishRequestResult.data)
    : null;
  const publishRequestError = publishRequestResult.ok
    ? null
    : publishRequestResult.message;
  const finalState = getManualUpdateFinalState({
    deleteResult,
    publish,
    publishRequestError,
  });
  let oldExportRecord: WorkoutExport | null = existingExport;

  if (
    deleteResult.status === "DELETED" ||
    deleteResult.status === "UNSCHEDULED_ONLY"
  ) {
    const oldSyncStatus =
      deleteResult.status === "DELETED" ? "deleted" : "partial";

    try {
      oldExportRecord = await updateWorkoutExportAfterDeleteRecord(
        buildDeleteTrackingInput({
          exportRecord: existingExport,
          plannedWorkout,
          request: deleteRequest,
          deleteResult,
          syncStatus: oldSyncStatus,
          nowIso: getNowIso(options),
        }),
        options,
      );
    } catch {
      oldExportRecord = existingExport;
    }
  }

  try {
    const exportRecord = await saveWorkoutExportRecord(
      buildManualUpdateExportInput({
        plannedWorkout,
        request,
        deleteRequest,
        deleteResult,
        publish,
        syncStatus: finalState.syncStatus,
        warnings: finalState.warnings,
        lastError: finalState.lastError,
        nowIso: getNowIso(options),
      }),
      options,
    );

    return {
      ok: finalState.ok,
      status: finalState.status,
      plannedWorkoutId,
      message: finalState.message,
      deleteResult,
      publish,
      exportRecord,
      oldExportRecord,
      trackingError: null,
    };
  } catch (error) {
    const trackingError =
      error instanceof Error
        ? error.message
        : "Could not save Garmin update tracking.";

    return {
      ok: false,
      status: "EXPORT_TRACKING_FAILED",
      plannedWorkoutId,
      message: `${finalState.message} Export tracking could not be saved: ${trackingError}`,
      deleteResult,
      publish,
      exportRecord: null,
      oldExportRecord,
      trackingError,
    };
  }
}

export async function bulkPublishGarminWorkouts(
  plannedWorkoutIds: string[],
  options: GarminBridgeClientOptions = {},
): Promise<GarminBridgeBulkPublishResult> {
  if (plannedWorkoutIds.length === 0) {
    return {
      ok: false,
      message: "Select at least one planned workout to publish.",
      results: [],
    };
  }

  const results: GarminBridgePublishResult[] = [];

  for (let index = 0; index < plannedWorkoutIds.length; index += 1) {
    const plannedWorkoutId = plannedWorkoutIds[index];

    results.push(
      await publishGarminWorkout(plannedWorkoutId, {
        ...options,
        exportMode: "bulk_publish",
      }),
    );

    const latestResult = results[results.length - 1];

    if (!latestResult.ok && options.stopOnError === true) {
      break;
    }

    if (index < plannedWorkoutIds.length - 1) {
      await waitBetweenBulkPublishes(options);
    }
  }

  const successCount = results.filter((result) => result.ok).length;

  return {
    ok: successCount === results.length,
    message:
      successCount === results.length
        ? `Published ${successCount} Garmin workout${successCount === 1 ? "" : "s"}.`
        : `Published ${successCount} of ${results.length} Garmin workouts.`,
    results,
  };
}

export async function bulkUpdateGarminWorkouts(
  plannedWorkoutIds: string[],
  options: GarminBridgeClientOptions = {},
): Promise<GarminBridgeBulkUpdateResult> {
  if (plannedWorkoutIds.length === 0) {
    return {
      ok: false,
      message: "Select at least one planned workout to update.",
      results: [],
    };
  }

  const results: GarminBridgeUpdateResult[] = [];

  for (let index = 0; index < plannedWorkoutIds.length; index += 1) {
    const plannedWorkoutId = plannedWorkoutIds[index];

    results.push(await updateGarminWorkout(plannedWorkoutId, options));

    const latestResult = results[results.length - 1];

    if (!latestResult.ok && options.stopOnError === true) {
      break;
    }

    if (index < plannedWorkoutIds.length - 1) {
      await waitBetweenBulkPublishes(options);
    }
  }

  const successCount = results.filter((result) => result.ok).length;

  return {
    ok: successCount === results.length,
    message:
      successCount === results.length
        ? `Updated ${successCount} Garmin export${successCount === 1 ? "" : "s"}.`
        : `Updated ${successCount} of ${results.length} Garmin export${results.length === 1 ? "" : "s"}.`,
    results,
  };
}

export async function bulkDeleteGarminWorkouts(
  plannedWorkoutIds: string[],
  options: GarminBridgeClientOptions = {},
): Promise<GarminBridgeBulkDeleteResult> {
  if (plannedWorkoutIds.length === 0) {
    return {
      ok: false,
      message: "Select at least one planned workout to delete from Garmin.",
      results: [],
    };
  }

  const results: GarminBridgeDeleteResult[] = [];

  for (let index = 0; index < plannedWorkoutIds.length; index += 1) {
    const plannedWorkoutId = plannedWorkoutIds[index];

    results.push(await deleteGarminWorkout(plannedWorkoutId, options));

    const latestResult = results[results.length - 1];

    if (!latestResult.ok && options.stopOnError === true) {
      break;
    }

    if (index < plannedWorkoutIds.length - 1) {
      await waitBetweenBulkPublishes(options);
    }
  }

  const successCount = results.filter((result) => result.ok).length;

  return {
    ok: successCount === results.length,
    message:
      successCount === results.length
        ? `Deleted ${successCount} Garmin export${successCount === 1 ? "" : "s"}.`
        : `Deleted ${successCount} of ${results.length} Garmin export${results.length === 1 ? "" : "s"}.`,
    results,
  };
}
