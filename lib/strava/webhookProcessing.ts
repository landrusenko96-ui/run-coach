import {
  fetchExistingStravaImportIds,
  saveStravaActivity,
} from "../db/stravaActivities.ts";
import { createServiceRoleClient } from "../supabase/serviceRole.ts";
import { saveLoggedWorkoutWithCompletion } from "../training/workoutLogging.ts";
import type {
  LoggedWorkout,
  PlannedWorkout,
  Profile,
  RaceGoal,
  TrainingPlan,
  WorkoutEvaluation,
} from "../../types/index.ts";
import type {
  StravaImportActivityResult,
  StravaImportResponse,
} from "../../types/strava.ts";
import {
  fetchWebhookStravaActivity,
  type FetchWebhookStravaActivityResult,
} from "./fetchWebhookStravaActivity.ts";
import {
  importSingleStravaActivityForActivePlan,
  type ImportSingleStravaActivityInput,
} from "./importRuns.ts";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;
type WebhookProcessingSupabaseClient = Pick<ServiceRoleClient, "from">;

type WebhookProcessingStatus =
  | "pending"
  | "processing"
  | "processed"
  | "ignored"
  | "failed";

type StravaWebhookEventRow = {
  id: string;
  received_at: string;
  processing_started_at: string | null;
  processed_at: string | null;
  user_id: string | null;
  owner_id: number;
  object_type: string;
  object_id: number;
  aspect_type: string;
  event_time: number;
  subscription_id: number | null;
  updates: Record<string, unknown> | null;
  raw_event: Record<string, unknown>;
  processing_status: WebhookProcessingStatus;
  action_taken: string | null;
  attempts: number;
  last_error: string | null;
  import_summary: Record<string, unknown> | null;
  logged_workout_id: string | null;
  planned_workout_id: string | null;
};

type ActiveImportContext = {
  profile: Profile;
  raceGoal: RaceGoal;
  plan: TrainingPlan;
  plannedWorkouts: PlannedWorkout[];
  loggedWorkouts: LoggedWorkout[];
  workoutEvaluations: WorkoutEvaluation[];
};

type FinishWebhookEventInput = {
  processingStatus: "processed" | "ignored" | "failed";
  actionTaken: string;
  importSummary: Record<string, unknown>;
  userId?: string | null;
  loggedWorkoutId?: string | null;
  plannedWorkoutId?: string | null;
  lastError?: string | null;
  processedAt: string | null;
};

export type ProcessStravaWebhookEventResult = {
  eventId: string;
  ok: boolean;
  processingStatus:
    | "processed"
    | "ignored"
    | "failed"
    | "already_handled"
    | "not_found";
  actionTaken: string | null;
  message: string;
};

export type ProcessPendingStravaWebhookEventsOptions = {
  limit?: number;
  includeFailed?: boolean;
  maxAttempts?: number;
  ownerId?: number | string;
  supabase?: WebhookProcessingSupabaseClient;
  dependencies?: Partial<WebhookProcessingDependencies>;
};

export type ProcessSingleStravaWebhookEventOptions = {
  supabase?: WebhookProcessingSupabaseClient;
  dependencies?: Partial<WebhookProcessingDependencies>;
};

type PendingWebhookEventOptions = {
  limit: number;
  includeFailed: boolean;
  maxAttempts: number;
  ownerId: string | null;
};

type WebhookProcessingDependencies = {
  createSupabaseClient: () => WebhookProcessingSupabaseClient;
  now: () => Date;
  fetchWebhookEventById: (
    supabase: WebhookProcessingSupabaseClient,
    eventId: string,
  ) => Promise<StravaWebhookEventRow | null>;
  fetchPendingWebhookEvents: (
    supabase: WebhookProcessingSupabaseClient,
    options: PendingWebhookEventOptions,
  ) => Promise<StravaWebhookEventRow[]>;
  markWebhookEventProcessing: (
    supabase: WebhookProcessingSupabaseClient,
    event: StravaWebhookEventRow,
    startedAt: string,
  ) => Promise<void>;
  finishWebhookEvent: (
    supabase: WebhookProcessingSupabaseClient,
    eventId: string,
    input: FinishWebhookEventInput,
  ) => Promise<void>;
  fetchPriorSkippedActivityEvent: (
    supabase: WebhookProcessingSupabaseClient,
    event: StravaWebhookEventRow,
  ) => Promise<SkippedActivityWebhookEventRow | null>;
  fetchWebhookActivity: typeof fetchWebhookStravaActivity;
  loadImportContext: (
    input: {
      supabase: WebhookProcessingSupabaseClient;
      userId: string;
    },
  ) => Promise<ActiveImportContext>;
  fetchExistingImportIds: typeof fetchExistingStravaImportIds;
  importSingleActivity: typeof importSingleStravaActivityForActivePlan;
  saveStravaActivity: typeof saveStravaActivity;
  saveLoggedWorkoutWithCompletion: typeof saveLoggedWorkoutWithCompletion;
};

type SkippedActivityWebhookEventRow = {
  id: string;
  action_taken: string | null;
  import_summary: Record<string, unknown> | null;
};

const SKIPPED_ACTIVITY_ACTIONS = [
  "skipped_no_connection",
  "skipped_duplicate",
  "skipped_non_run",
  "skipped_invalid",
  "skipped_before_plan_start",
  "skipped_already_logged",
];

class SafeWebhookProcessingError extends Error {
  importSummary: Record<string, unknown>;

  constructor(message: string, importSummary?: Record<string, unknown>) {
    super(message);
    this.name = "SafeWebhookProcessingError";
    this.importSummary = importSummary ?? {
      ok: false,
      message,
    };
  }
}

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Strava webhook processing can only run on the server.");
  }
}

function normalizeLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value) || value < 1) {
    return 10;
  }

  return Math.min(Math.floor(value), 50);
}

function normalizeMaxAttempts(value: number | undefined): number {
  if (!value || !Number.isFinite(value) || value < 1) {
    return 3;
  }

  return Math.floor(value);
}

function normalizeOwnerId(value: number | string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const text = String(value).trim();

  if (!/^\d+$/.test(text)) {
    throw new Error("ownerId must be a numeric Strava athlete ID.");
  }

  return text;
}

function isAlreadyHandled(event: StravaWebhookEventRow): boolean {
  return (
    Boolean(event.processed_at) &&
    (event.processing_status === "processed" ||
      event.processing_status === "ignored")
  );
}

function isDeauthorizationEvent(event: StravaWebhookEventRow): boolean {
  const authorized = event.updates?.authorized;

  return (
    event.object_type === "athlete" &&
    (authorized === false || authorized === "false")
  );
}

function buildAttentionSummary(input: {
  message: string;
  actionTaken: string;
  event: StravaWebhookEventRow;
}): Record<string, unknown> {
  return {
    ok: true,
    attentionNeeded: true,
    message: input.message,
    actionTaken: input.actionTaken,
    objectType: input.event.object_type,
    objectId: String(input.event.object_id),
    ownerId: String(input.event.owner_id),
    updates: input.event.updates,
  };
}

function buildIgnoredSummary(input: {
  message: string;
  actionTaken: string;
  event: StravaWebhookEventRow;
}): Record<string, unknown> {
  return {
    ok: true,
    attentionNeeded: false,
    message: input.message,
    actionTaken: input.actionTaken,
    objectType: input.event.object_type,
    objectId: String(input.event.object_id),
    ownerId: String(input.event.owner_id),
  };
}

function buildIgnoredPreviouslySkippedSummary(input: {
  message: string;
  actionTaken: string;
  event: StravaWebhookEventRow;
  priorSkippedEvent: SkippedActivityWebhookEventRow;
}): Record<string, unknown> {
  return {
    ok: true,
    attentionNeeded: false,
    message: input.message,
    actionTaken: input.actionTaken,
    objectType: input.event.object_type,
    objectId: String(input.event.object_id),
    ownerId: String(input.event.owner_id),
    priorWebhookEventId: input.priorSkippedEvent.id,
    priorActionTaken: input.priorSkippedEvent.action_taken,
  };
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof SafeWebhookProcessingError) {
    return error.message;
  }

  return "Strava webhook event processing failed.";
}

function getErrorImportSummary(error: unknown): Record<string, unknown> {
  if (error instanceof SafeWebhookProcessingError) {
    return error.importSummary;
  }

  return {
    ok: false,
    message: "Strava webhook event processing failed.",
  };
}

function mapImportAction(activityResult: StravaImportActivityResult): string {
  if (
    activityResult.status === "imported_matched" ||
    activityResult.status === "imported_unlinked"
  ) {
    return "imported";
  }

  if (activityResult.status === "skipped_error") {
    return "failed_processing";
  }

  return activityResult.status;
}

function buildImportFailureSummary(
  activityResult: StravaImportActivityResult,
  summary: StravaImportResponse,
): Record<string, unknown> {
  return {
    ok: false,
    message: activityResult.reason ?? "Strava activity import failed.",
    activityResult,
    summary,
  };
}

function buildFetchFailureSummary(
  fetchResult: Exclude<FetchWebhookStravaActivityResult, { ok: true }>,
): Record<string, unknown> {
  return {
    ok: false,
    message: fetchResult.message,
    fetchStatus: fetchResult.status,
  };
}

async function fetchWebhookEventById(
  supabase: WebhookProcessingSupabaseClient,
  eventId: string,
): Promise<StravaWebhookEventRow | null> {
  const { data, error } = await supabase
    .from("strava_webhook_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as StravaWebhookEventRow | null) ?? null;
}

async function fetchPendingWebhookEvents(
  supabase: WebhookProcessingSupabaseClient,
  options: PendingWebhookEventOptions,
): Promise<StravaWebhookEventRow[]> {
  const statuses: WebhookProcessingStatus[] = options.includeFailed
    ? ["pending", "ignored", "failed"]
    : ["pending", "ignored"];
  let query = supabase
    .from("strava_webhook_events")
    .select("*")
    .in("processing_status", statuses)
    .lt("attempts", options.maxAttempts)
    .order("received_at", { ascending: true })
    .limit(options.limit * 5);

  if (options.ownerId) {
    query = query.eq("owner_id", options.ownerId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as StravaWebhookEventRow[])
    .filter((event) => {
      if (event.processing_status === "pending") {
        return true;
      }

      if (event.processing_status === "failed") {
        return options.includeFailed;
      }

      return event.processing_status === "ignored" && !event.processed_at;
    })
    .slice(0, options.limit);
}

async function markWebhookEventProcessing(
  supabase: WebhookProcessingSupabaseClient,
  event: StravaWebhookEventRow,
  startedAt: string,
): Promise<void> {
  const { error } = await supabase
    .from("strava_webhook_events")
    .update({
      processing_status: "processing",
      processing_started_at: startedAt,
      attempts: event.attempts + 1,
      last_error: null,
    })
    .eq("id", event.id);

  if (error) {
    throw new Error(error.message);
  }
}

async function finishWebhookEvent(
  supabase: WebhookProcessingSupabaseClient,
  eventId: string,
  input: FinishWebhookEventInput,
): Promise<void> {
  const update: Record<string, unknown> = {
    processing_status: input.processingStatus,
    processed_at: input.processedAt,
    action_taken: input.actionTaken,
    import_summary: input.importSummary,
    last_error: input.lastError ?? null,
    logged_workout_id: input.loggedWorkoutId ?? null,
    planned_workout_id: input.plannedWorkoutId ?? null,
  };

  if (input.userId !== undefined) {
    update.user_id = input.userId;
  }

  const { error } = await supabase
    .from("strava_webhook_events")
    .update(update)
    .eq("id", eventId);

  if (error) {
    throw new Error(error.message);
  }
}

async function fetchPriorSkippedActivityEvent(
  supabase: WebhookProcessingSupabaseClient,
  event: StravaWebhookEventRow,
): Promise<SkippedActivityWebhookEventRow | null> {
  if (
    event.object_type !== "activity" ||
    (event.aspect_type !== "update" && event.aspect_type !== "delete")
  ) {
    return null;
  }

  const { data, error } = await supabase
    .from("strava_webhook_events")
    .select("id,action_taken,import_summary")
    .eq("owner_id", event.owner_id)
    .eq("object_type", "activity")
    .eq("object_id", event.object_id)
    .eq("aspect_type", "create")
    .in("processing_status", ["processed", "ignored"])
    .in("action_taken", SKIPPED_ACTIVITY_ACTIONS)
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as SkippedActivityWebhookEventRow | null) ?? null;
}

async function loadImportContext(): Promise<ActiveImportContext> {
  const [
    profiles,
    raceGoals,
    trainingPlans,
    workouts,
  ] = await Promise.all([
    import("../db/profiles.ts"),
    import("../db/raceGoals.ts"),
    import("../db/trainingPlans.ts"),
    import("../db/workouts.ts"),
  ]);
  const profile = await profiles.fetchFirstProfile();

  if (!profile) {
    throw new SafeWebhookProcessingError(
      "Create and save a Profile before importing Strava runs.",
    );
  }

  const activePlan = await trainingPlans.fetchActiveTrainingPlanWithWorkouts(
    profile.id,
  );

  if (!activePlan) {
    throw new SafeWebhookProcessingError(
      "Generate or select an active training plan before importing Strava runs.",
    );
  }

  const [raceGoal, loggedWorkouts, workoutEvaluations] = await Promise.all([
    raceGoals.fetchRaceGoalById(activePlan.plan.race_goal_id),
    workouts.fetchLoggedWorkoutsForTrainingPlan(activePlan.plan.id),
    workouts.fetchWorkoutEvaluationsForTrainingPlan(activePlan.plan.id),
  ]);

  return {
    profile,
    raceGoal,
    plan: activePlan.plan,
    plannedWorkouts: activePlan.workouts,
    loggedWorkouts,
    workoutEvaluations,
  };
}

const defaultDependencies: WebhookProcessingDependencies = {
  createSupabaseClient: createServiceRoleClient,
  now: () => new Date(),
  fetchWebhookEventById,
  fetchPendingWebhookEvents,
  markWebhookEventProcessing,
  finishWebhookEvent,
  fetchPriorSkippedActivityEvent,
  fetchWebhookActivity: fetchWebhookStravaActivity,
  loadImportContext,
  fetchExistingImportIds: fetchExistingStravaImportIds,
  importSingleActivity: importSingleStravaActivityForActivePlan,
  saveStravaActivity,
  saveLoggedWorkoutWithCompletion,
};

function getDependencies(
  overrides: Partial<WebhookProcessingDependencies> | undefined,
): WebhookProcessingDependencies {
  return {
    ...defaultDependencies,
    ...overrides,
  };
}

async function processActivityCreateEvent(input: {
  supabase: WebhookProcessingSupabaseClient;
  event: StravaWebhookEventRow;
  dependencies: WebhookProcessingDependencies;
}): Promise<FinishWebhookEventInput> {
  const fetchResult = await input.dependencies.fetchWebhookActivity({
    supabase: input.supabase,
    ownerId: input.event.owner_id,
    activityId: input.event.object_id,
  });

  if (!fetchResult.ok) {
    if (fetchResult.status === "missing_connection") {
      return {
        processingStatus: "ignored",
        actionTaken: "skipped_no_connection",
        userId: null,
        importSummary: buildIgnoredSummary({
          event: input.event,
          actionTaken: "skipped_no_connection",
          message: "No Strava connection was found for this webhook owner.",
        }),
        processedAt: input.dependencies.now().toISOString(),
      };
    }

    throw new SafeWebhookProcessingError(
      fetchResult.message,
      buildFetchFailureSummary(fetchResult),
    );
  }

  const importContext = await input.dependencies.loadImportContext({
    supabase: input.supabase,
    userId: fetchResult.userId,
  });
  const existingActivityIds = await input.dependencies.fetchExistingImportIds(
    input.supabase,
    {
      userId: fetchResult.userId,
      stravaActivityIds: [fetchResult.activity.id],
    },
  );
  const importResult = await input.dependencies.importSingleActivity({
    userId: fetchResult.userId,
    profile: importContext.profile,
    raceGoal: importContext.raceGoal,
    plan: importContext.plan,
    plannedWorkouts: importContext.plannedWorkouts,
    loggedWorkouts: importContext.loggedWorkouts,
    workoutEvaluations: importContext.workoutEvaluations,
    activity: fetchResult.activity,
    dependencies: {
      isDuplicate: async (stravaActivityId) =>
        existingActivityIds.has(stravaActivityId),
      saveLoggedWorkoutWithCompletion: (loggedWorkoutInput) =>
        input.dependencies.saveLoggedWorkoutWithCompletion({
          profile: importContext.profile,
          raceGoal: importContext.raceGoal,
          plan: importContext.plan,
          ...loggedWorkoutInput,
        }),
      saveStravaActivity: async (stravaActivity) => {
        await input.dependencies.saveStravaActivity(
          input.supabase,
          stravaActivity,
        );
        existingActivityIds.add(stravaActivity.strava_activity_id);
      },
    },
  } satisfies ImportSingleStravaActivityInput);
  const activityResult = importResult.activityResult;
  const actionTaken = mapImportAction(activityResult);

  if (actionTaken === "failed_processing") {
    throw new SafeWebhookProcessingError(
      activityResult.reason ?? "Strava activity import failed.",
      buildImportFailureSummary(activityResult, importResult.summary),
    );
  }

  return {
    processingStatus: "processed",
    actionTaken,
    userId: fetchResult.userId,
    loggedWorkoutId: activityResult.loggedWorkoutId,
    plannedWorkoutId: activityResult.matchedPlannedWorkoutId,
    importSummary: importResult.summary as unknown as Record<string, unknown>,
    processedAt: input.dependencies.now().toISOString(),
  };
}

async function processSafeNonCreateEvent(input: {
  supabase: WebhookProcessingSupabaseClient;
  event: StravaWebhookEventRow;
  dependencies: WebhookProcessingDependencies;
  nowIso: string;
}): Promise<FinishWebhookEventInput> {
  const priorSkippedEvent =
    await input.dependencies.fetchPriorSkippedActivityEvent(
      input.supabase,
      input.event,
    );
  const { event } = input;

  if (
    priorSkippedEvent &&
    event.object_type === "activity" &&
    event.aspect_type === "update"
  ) {
    const actionTaken = "skipped_update_ignored_previously_skipped";

    return {
      processingStatus: "ignored",
      actionTaken,
      importSummary: buildIgnoredPreviouslySkippedSummary({
        event,
        priorSkippedEvent,
        actionTaken,
        message:
          "Strava activity update ignored because this activity was already skipped by the app.",
      }),
      processedAt: input.nowIso,
    };
  }

  if (
    priorSkippedEvent &&
    event.object_type === "activity" &&
    event.aspect_type === "delete"
  ) {
    const actionTaken = "skipped_delete_ignored_previously_skipped";

    return {
      processingStatus: "ignored",
      actionTaken,
      importSummary: buildIgnoredPreviouslySkippedSummary({
        event,
        priorSkippedEvent,
        actionTaken,
        message:
          "Strava activity delete ignored because this activity was already skipped by the app.",
      }),
      processedAt: input.nowIso,
    };
  }

  if (event.object_type === "activity" && event.aspect_type === "update") {
    return {
      processingStatus: "ignored",
      actionTaken: "skipped_update_ignored",
      importSummary: buildIgnoredSummary({
        event,
        actionTaken: "skipped_update_ignored",
        message:
          "Strava activity update ignored. The app does not overwrite imported workouts automatically.",
      }),
      processedAt: input.nowIso,
    };
  }

  if (event.object_type === "activity" && event.aspect_type === "delete") {
    return {
      processingStatus: "processed",
      actionTaken: "marked_deleted_attention_needed",
      importSummary: buildAttentionSummary({
        event,
        actionTaken: "marked_deleted_attention_needed",
        message:
          "Strava activity was deleted. Review any matching logged workout manually.",
      }),
      processedAt: input.nowIso,
    };
  }

  if (isDeauthorizationEvent(event)) {
    return {
      processingStatus: "processed",
      actionTaken: "marked_connection_revoked",
      importSummary: buildAttentionSummary({
        event,
        actionTaken: "marked_connection_revoked",
        message: "Strava authorization was revoked. Reconnect Strava.",
      }),
      processedAt: input.nowIso,
    };
  }

  return {
    processingStatus: "ignored",
    actionTaken: "skipped_unsupported_event",
    importSummary: buildIgnoredSummary({
      event,
      actionTaken: "skipped_unsupported_event",
      message: "Strava webhook event type was ignored.",
    }),
    processedAt: input.nowIso,
  };
}

async function processWebhookEventRow(input: {
  supabase: WebhookProcessingSupabaseClient;
  event: StravaWebhookEventRow;
  dependencies: WebhookProcessingDependencies;
}): Promise<ProcessStravaWebhookEventResult> {
  const startedAt = input.dependencies.now().toISOString();

  await input.dependencies.markWebhookEventProcessing(
    input.supabase,
    input.event,
    startedAt,
  );

  try {
    const finishInput =
      input.event.object_type === "activity" &&
      input.event.aspect_type === "create"
        ? await processActivityCreateEvent(input)
        : await processSafeNonCreateEvent({
            ...input,
            nowIso: input.dependencies.now().toISOString(),
          });

    await input.dependencies.finishWebhookEvent(
      input.supabase,
      input.event.id,
      finishInput,
    );

    return {
      eventId: input.event.id,
      ok: true,
      processingStatus: finishInput.processingStatus,
      actionTaken: finishInput.actionTaken,
      message: "Strava webhook event processed.",
    };
  } catch (error) {
    const safeMessage = getSafeErrorMessage(error);
    const finishInput: FinishWebhookEventInput = {
      processingStatus: "failed",
      actionTaken: "failed_processing",
      importSummary: getErrorImportSummary(error),
      lastError: safeMessage,
      processedAt: null,
    };

    await input.dependencies.finishWebhookEvent(
      input.supabase,
      input.event.id,
      finishInput,
    );

    return {
      eventId: input.event.id,
      ok: false,
      processingStatus: "failed",
      actionTaken: "failed_processing",
      message: safeMessage,
    };
  }
}

export async function processSingleStravaWebhookEvent(
  eventId: string,
  options: ProcessSingleStravaWebhookEventOptions = {},
): Promise<ProcessStravaWebhookEventResult> {
  assertServerOnly();

  const dependencies = getDependencies(options.dependencies);
  const supabase = options.supabase ?? dependencies.createSupabaseClient();
  const event = await dependencies.fetchWebhookEventById(supabase, eventId);

  if (!event) {
    return {
      eventId,
      ok: false,
      processingStatus: "not_found",
      actionTaken: null,
      message: "Strava webhook event was not found.",
    };
  }

  if (isAlreadyHandled(event)) {
    return {
      eventId: event.id,
      ok: true,
      processingStatus: "already_handled",
      actionTaken: event.action_taken,
      message: "Strava webhook event was already handled.",
    };
  }

  return processWebhookEventRow({
    supabase,
    event,
    dependencies,
  });
}

export async function processPendingStravaWebhookEvents(
  options: ProcessPendingStravaWebhookEventsOptions = {},
): Promise<ProcessStravaWebhookEventResult[]> {
  assertServerOnly();

  const dependencies = getDependencies(options.dependencies);
  const supabase = options.supabase ?? dependencies.createSupabaseClient();
  const pendingOptions = {
    limit: normalizeLimit(options.limit),
    includeFailed: options.includeFailed ?? false,
    maxAttempts: normalizeMaxAttempts(options.maxAttempts),
    ownerId: normalizeOwnerId(options.ownerId),
  };
  const events = await dependencies.fetchPendingWebhookEvents(
    supabase,
    pendingOptions,
  );
  const results: ProcessStravaWebhookEventResult[] = [];

  for (const event of events) {
    try {
      results.push(
        await processSingleStravaWebhookEvent(event.id, {
          supabase,
          dependencies,
        }),
      );
    } catch {
      results.push({
        eventId: event.id,
        ok: false,
        processingStatus: "failed",
        actionTaken: "failed_processing",
        message: "Strava webhook event processing failed.",
      });
    }
  }

  return results;
}
