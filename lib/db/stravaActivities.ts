import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;
type SupabaseStravaActivityClient = Pick<SupabaseServerClient, "from">;

type StravaActivityImportRow = {
  strava_activity_id: string;
  logged_workout_id: string | null;
};

type LoggedWorkoutSourceActivityRow = {
  source_activity_id: string | null;
};

export type SaveStravaActivityInput = {
  user_id: string;
  strava_activity_id: string;
  logged_workout_id: string;
  planned_workout_id: string | null;
  activity_name: string;
  sport_type: string;
  start_date: string;
  distance_m: number;
  moving_time_sec: number;
  elapsed_time_sec: number;
  total_elevation_gain_m: number | null;
  average_heart_rate: number | null;
  max_heart_rate: number | null;
  raw_summary_json: Record<string, unknown>;
};

export async function fetchExistingStravaImportIds(
  supabase: SupabaseStravaActivityClient,
  input: {
    userId: string;
    stravaActivityIds: string[];
  },
): Promise<Set<string>> {
  const uniqueActivityIds = Array.from(new Set(input.stravaActivityIds)).filter(
    (activityId) => activityId.trim() !== "",
  );

  if (uniqueActivityIds.length === 0) {
    return new Set();
  }

  const existingActivityIds = new Set<string>();

  const { data: stravaActivityRows, error: stravaActivityError } = await supabase
    .from("strava_activities")
    .select("strava_activity_id, logged_workout_id")
    .eq("user_id", input.userId)
    .in("strava_activity_id", uniqueActivityIds);

  if (stravaActivityError) {
    throw new Error(stravaActivityError.message);
  }

  for (const row of (stravaActivityRows ?? []) as StravaActivityImportRow[]) {
    if (row.logged_workout_id) {
      existingActivityIds.add(row.strava_activity_id);
    }
  }

  const { data: loggedWorkoutRows, error: loggedWorkoutError } = await supabase
    .from("logged_workouts")
    .select("source_activity_id")
    .eq("user_id", input.userId)
    .eq("source", "strava")
    .in("source_activity_id", uniqueActivityIds);

  if (loggedWorkoutError) {
    throw new Error(loggedWorkoutError.message);
  }

  for (const row of (loggedWorkoutRows ?? []) as LoggedWorkoutSourceActivityRow[]) {
    if (row.source_activity_id) {
      existingActivityIds.add(row.source_activity_id);
    }
  }

  return existingActivityIds;
}

export async function saveStravaActivity(
  supabase: SupabaseStravaActivityClient,
  activity: SaveStravaActivityInput,
): Promise<void> {
  const { error } = await supabase
    .from("strava_activities")
    .upsert(activity, { onConflict: "user_id,strava_activity_id" });

  if (error) {
    throw new Error(error.message);
  }
}
