import type { WorkoutExport, WorkoutExportSyncStatus } from "../../types/training.ts";

export type SaveWorkoutExportInput = Omit<
  WorkoutExport,
  "id" | "created_at" | "updated_at" | "planned_workout_id" | "training_plan_id"
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
    "garmin_bridge_api_key",
    "x-garmin-bridge-key",
    "authorization",
    "cookie",
    "password",
    "access_token",
    "refresh_token",
    "id_token",
    "token_file",
  ];

  for (const blockedTerm of blockedSecretTerms) {
    if (serializedExport.includes(blockedTerm)) {
      throw new Error(
        "Workout export records must not contain secrets, tokens, cookies, passwords, API keys, or request headers.",
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
