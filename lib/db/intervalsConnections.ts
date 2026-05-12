import { getSupabaseClient } from "@/lib/db/supabaseClient";
import type {
  IntervalsApiKeyPlaceholder,
  IntervalsConnection,
} from "@/types/training";

export const INTERVALS_API_KEY_PLACEHOLDER: IntervalsApiKeyPlaceholder =
  "stored_in_environment_variable";

export type SaveIntervalsConnectionInput = {
  profile_id: string;
  athlete_id: string;
  is_active: boolean;
};

export async function fetchIntervalsConnectionForProfile(
  profileId: string,
): Promise<IntervalsConnection | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("intervals_connections")
    .select("*")
    .eq("profile_id", profileId)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as IntervalsConnection | null;
}

export async function fetchActiveIntervalsConnection(
  profileId: string,
): Promise<IntervalsConnection | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("intervals_connections")
    .select("*")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as IntervalsConnection | null;
}

export async function saveIntervalsConnection(
  connection: SaveIntervalsConnectionInput,
  existingConnectionId?: string,
): Promise<IntervalsConnection> {
  const supabase = getSupabaseClient();
  const connectionWithPlaceholder = {
    ...connection,
    api_key_encrypted_or_placeholder: INTERVALS_API_KEY_PLACEHOLDER,
  };

  const query = existingConnectionId
    ? supabase
        .from("intervals_connections")
        .update(connectionWithPlaceholder)
        .eq("id", existingConnectionId)
    : supabase.from("intervals_connections").insert(connectionWithPlaceholder);

  const { data, error } = await query.select("*").single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved Intervals.icu connection.");
  }

  return data as IntervalsConnection;
}
