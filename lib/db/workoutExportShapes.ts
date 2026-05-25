import type { WorkoutExport, WorkoutExportSyncStatus } from "../../types/training.ts";

export type SaveWorkoutExportInput = Omit<
  WorkoutExport,
  | "id"
  | "user_id"
  | "created_at"
  | "updated_at"
  | "planned_workout_id"
  | "training_plan_id"
> & {
  planned_workout_id: string;
  training_plan_id: string;
};

export type UpdateWorkoutExportAfterGarminDeleteInput = {
  id: string;
  sync_status: Extract<WorkoutExportSyncStatus, "deleted" | "partial" | "failed">;
  last_synced_at: string | null;
  last_error: string | null;
  warnings: string[];
  payload_snapshot: Record<string, unknown>;
};

function assertSafeSerializedWorkoutExport(workoutExport: unknown) {
  const serializedExport = JSON.stringify(workoutExport).toLowerCase();
  const blockedSecretTerms = [
    "cf-access-client-id",
    "cf-access-client-secret",
    "garmin_bridge_access_client_id",
    "garmin_bridge_access_client_secret",
    "garmin_bridge_api_key",
    "x-garmin-bridge-key",
    "client_secret",
    "access_client_secret",
    "authorization",
    "bearer",
    "cookie",
    "garmin_tokens",
    "garminconnect",
    "password",
    "request headers",
    "request_headers",
    "response headers",
    "response_headers",
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "token_file",
  ];

  for (const blockedTerm of blockedSecretTerms) {
    if (serializedExport.includes(blockedTerm)) {
      throw new Error(
        "Workout export records must not contain secrets, tokens, cookies, passwords, API keys, service-token values, or request/response headers.",
      );
    }
  }
}

export function assertSafeWorkoutExportInput(
  workoutExport: SaveWorkoutExportInput,
) {
  assertSafeSerializedWorkoutExport(workoutExport);
}

export function assertSafeWorkoutExportUpdateInput(
  workoutExport: UpdateWorkoutExportAfterGarminDeleteInput,
) {
  assertSafeSerializedWorkoutExport(workoutExport);
}
