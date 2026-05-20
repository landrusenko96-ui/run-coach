import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getStravaAthleteDisplayName,
  type SafeStravaAthleteSummary,
} from "@/lib/strava/client";
import type { SafeStravaAthlete } from "@/types/strava";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type StravaConnectionRow = {
  id: string;
  strava_athlete_id: string;
  athlete_display_name: string | null;
  athlete_username: string | null;
  athlete_profile_url: string | null;
  token_expires_at: string;
  scope: string;
  created_at: string;
  updated_at: string;
};

type PrivateStravaConnectionRow = StravaConnectionRow & {
  user_id: string;
  access_token: string;
  refresh_token: string;
};

export type SafeStravaConnection = {
  id: string;
  athlete: SafeStravaAthlete;
  scope: string;
  tokenExpiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PrivateStravaConnection = SafeStravaConnection & {
  userId: string;
  accessToken: string;
  refreshToken: string;
};

export type SaveStravaConnectionInput = {
  userId: string;
  scope: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  athlete: SafeStravaAthleteSummary;
};

const SAFE_STRAVA_CONNECTION_COLUMNS =
  "id,strava_athlete_id,athlete_display_name,athlete_username,athlete_profile_url,token_expires_at,scope,created_at,updated_at";

const PRIVATE_STRAVA_CONNECTION_COLUMNS =
  "id,user_id,strava_athlete_id,athlete_display_name,athlete_username,athlete_profile_url,token_expires_at,scope,created_at,updated_at,access_token,refresh_token";

function mapSafeStravaConnection(row: StravaConnectionRow): SafeStravaConnection {
  return {
    id: row.id,
    athlete: {
      stravaAthleteId: row.strava_athlete_id,
      displayName: row.athlete_display_name,
      username: row.athlete_username,
      profileUrl: row.athlete_profile_url,
    },
    scope: row.scope,
    tokenExpiresAt: row.token_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPrivateStravaConnection(
  row: PrivateStravaConnectionRow,
): PrivateStravaConnection {
  return {
    ...mapSafeStravaConnection(row),
    userId: row.user_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
  };
}

export async function saveStravaConnection(
  supabase: SupabaseServerClient,
  input: SaveStravaConnectionInput,
): Promise<SafeStravaConnection> {
  const { data, error } = await supabase
    .from("strava_connections")
    .upsert(
      {
        user_id: input.userId,
        strava_athlete_id: input.athlete.id,
        athlete_display_name: getStravaAthleteDisplayName(input.athlete),
        athlete_username: input.athlete.username,
        athlete_profile_url: input.athlete.profile ?? input.athlete.profileMedium,
        athlete_summary_json: input.athlete,
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
        token_expires_at: input.tokenExpiresAt,
        scope: input.scope,
      },
      {
        onConflict: "user_id",
      },
    )
    .select(SAFE_STRAVA_CONNECTION_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supabase did not return the saved Strava connection.");
  }

  return mapSafeStravaConnection(data as StravaConnectionRow);
}

export async function fetchSafeStravaConnectionForUser(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<SafeStravaConnection | null> {
  const { data, error } = await supabase
    .from("strava_connections")
    .select(SAFE_STRAVA_CONNECTION_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapSafeStravaConnection(data as StravaConnectionRow) : null;
}

export async function fetchPrivateStravaConnectionForUser(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<PrivateStravaConnection | null> {
  const { data, error } = await supabase
    .from("strava_connections")
    .select(PRIVATE_STRAVA_CONNECTION_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapPrivateStravaConnection(data as PrivateStravaConnectionRow) : null;
}

export async function updateStravaConnectionTokens(
  supabase: SupabaseServerClient,
  input: {
    userId: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("strava_connections")
    .update({
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      token_expires_at: input.tokenExpiresAt,
    })
    .eq("user_id", input.userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteStravaConnectionForUser(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("strava_connections")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}
