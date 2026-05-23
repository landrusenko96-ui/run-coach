import {
  getAuthenticatedUserId,
  getDbClient,
  type UserScopedDbOptions,
} from "@/lib/db/supabaseClient";
import type { RaceGoal } from "@/types/training";

export type SaveRaceGoalInput = Omit<
  RaceGoal,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export async function fetchActiveRaceGoal(
  profileId: string,
  options?: UserScopedDbOptions,
): Promise<RaceGoal | null> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("race_goals")
    .select("*")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as RaceGoal | null;
}

export async function fetchRaceGoalById(
  raceGoalId: string,
  options?: UserScopedDbOptions,
): Promise<RaceGoal> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("race_goals")
    .select("*")
    .eq("user_id", userId)
    .eq("id", raceGoalId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Could not find the linked race goal.");
  }

  return data as RaceGoal;
}

export async function saveRaceGoal(
  raceGoal: SaveRaceGoalInput,
  existingRaceGoalId?: string,
  options?: UserScopedDbOptions,
): Promise<RaceGoal> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);
  const raceGoalWithUser = {
    ...raceGoal,
    user_id: userId,
  };

  const query = existingRaceGoalId
    ? supabase
        .from("race_goals")
        .update(raceGoalWithUser)
        .eq("id", existingRaceGoalId)
        .eq("user_id", userId)
    : supabase.from("race_goals").insert(raceGoalWithUser);

  const { data, error } = await query.select("*").single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved race goal.");
  }

  return data as RaceGoal;
}
