import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "../supabase/config.ts";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
  publicKey: string;
  usingLegacyAnonKey: boolean;
};

let supabaseClient: SupabaseClient | null = null;

export type SupabaseDbClient = Pick<SupabaseClient, "auth" | "from" | "rpc">;

export type UserScopedDbOptions = {
  supabase?: SupabaseDbClient;
  userId?: string;
};

export function getSupabaseConfig(): SupabaseConfig {
  const config = getSupabasePublicConfig();

  return {
    url: config.url,
    anonKey: config.publicKey,
    publicKey: config.publicKey,
    usingLegacyAnonKey: config.usingLegacyAnonKey,
  };
}

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const config = getSupabaseConfig();
  supabaseClient =
    typeof window === "undefined"
      ? createClient(config.url, config.publicKey, {
          auth: {
            autoRefreshToken: false,
            detectSessionInUrl: false,
            persistSession: false,
          },
        })
      : (createBrowserClient(config.url, config.publicKey) as SupabaseClient);

  return supabaseClient;
}

export function getDbClient(options?: UserScopedDbOptions): SupabaseDbClient {
  return options?.supabase ?? getSupabaseClient();
}

export function isAnonymousSupabaseUser(user: User | null): boolean {
  return (user as { is_anonymous?: boolean } | null)?.is_anonymous === true;
}

export async function getAuthenticatedUserId(
  options?: UserScopedDbOptions,
): Promise<string> {
  if (options?.userId) {
    return options.userId;
  }

  const { data, error } = await getDbClient(options).auth.getUser();
  const user = data.user;

  if (error || !user || isAnonymousSupabaseUser(user)) {
    throw new Error("Sign in with email before using Run.B*tch.app.");
  }

  return user.id;
}
