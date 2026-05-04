import { getSupabaseClient } from "@/lib/db/supabaseClient";
import type { Profile } from "@/types/training";

export type SaveProfileInput = Omit<Profile, "id" | "created_at" | "updated_at">;

export async function fetchFirstProfile(): Promise<Profile | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Profile | null;
}

export async function saveProfile(
  profile: SaveProfileInput,
  existingProfileId?: string,
): Promise<Profile> {
  const supabase = getSupabaseClient();

  const query = existingProfileId
    ? supabase.from("profiles").update(profile).eq("id", existingProfileId)
    : supabase.from("profiles").insert(profile);

  const { data, error } = await query.select("*").single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved profile.");
  }

  return data as Profile;
}
