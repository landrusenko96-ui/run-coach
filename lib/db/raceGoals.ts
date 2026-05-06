import { getSupabaseClient } from "@/lib/db/supabaseClient";
import type { RaceGoal } from "@/types/training";

export type SaveRaceGoalInput = Omit<
  RaceGoal,
  "id" | "created_at" | "updated_at"
>;

export async function fetchActiveRaceGoal(
  profileId: string,
): Promise<RaceGoal | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("race_goals")
    .select("*")
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

export async function fetchRaceGoalById(raceGoalId: string): Promise<RaceGoal> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("race_goals")
    .select("*")
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
): Promise<RaceGoal> {
  const supabase = getSupabaseClient();

  const query = existingRaceGoalId
    ? supabase.from("race_goals").update(raceGoal).eq("id", existingRaceGoalId)
    : supabase.from("race_goals").insert(raceGoal);

  const { data, error } = await query.select("*").single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved race goal.");
  }

  return data as RaceGoal;
}
