export type SafeStravaAthlete = {
  stravaAthleteId: string;
  displayName: string | null;
  username: string | null;
  profileUrl: string | null;
};

export type StravaStatusResponse = {
  ok: boolean;
  connected: boolean;
  authenticated: boolean;
  message: string;
  athlete: SafeStravaAthlete | null;
  scope: string | null;
  tokenExpiresAt: string | null;
};

export type StravaImportDays = 7 | 14;

export type StravaImportedWorkoutSummary = {
  name: string;
  date: string;
  distanceKm: number;
  avgPaceSecPerKm: number | null;
  matchStatus: "matched" | "unlinked";
};

export type StravaImportActivityStatus =
  | "imported_matched"
  | "imported_unlinked"
  | "skipped_duplicate"
  | "skipped_already_logged"
  | "skipped_before_plan_start"
  | "skipped_after_plan_end"
  | "skipped_non_run"
  | "skipped_invalid"
  | "skipped_error";

export type StravaImportActivityResult = {
  stravaActivityId: string;
  name: string;
  date: string;
  distanceKm: number | null;
  avgPaceSecPerKm: number | null;
  status: StravaImportActivityStatus;
  statusMessage: string;
};

export type StravaImportResponse = {
  ok: boolean;
  message: string;
  imported: number;
  skippedDuplicates: number;
  skippedAlreadyLogged: number;
  skippedBeforePlanStart: number;
  skippedAfterPlanEnd: number;
  skippedNonRuns: number;
  skippedInvalid: number;
  linkedToPlanned: number;
  importedUnlinked: number;
  scored: number;
  adjusted: number;
  importedWorkouts: StravaImportedWorkoutSummary[];
  activityResults: StravaImportActivityResult[];
  errors: string[];
};
