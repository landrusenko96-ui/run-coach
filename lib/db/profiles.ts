import {
  getAuthenticatedUserId,
  getDbClient,
  type UserScopedDbOptions,
} from "@/lib/db/supabaseClient";
import type { Profile } from "@/types/training";

export type SaveProfileInput = Omit<
  Profile,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export async function fetchFirstProfile(
  options?: UserScopedDbOptions,
): Promise<Profile | null> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
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
  options?: UserScopedDbOptions,
): Promise<Profile> {
  const supabase = getDbClient(options);
  const userId = await getAuthenticatedUserId(options);
  const profileWithUser = {
    ...profile,
    user_id: userId,
  };

  const query = existingProfileId
    ? supabase
        .from("profiles")
        .update(profileWithUser)
        .eq("id", existingProfileId)
        .eq("user_id", userId)
    : supabase.from("profiles").insert(profileWithUser);

  const { data, error } = await query.select("*").single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved profile.");
  }

  return data as Profile;
}
