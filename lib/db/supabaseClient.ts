import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
  publicKey: string;
  usingLegacyAnonKey: boolean;
};

let supabaseClient: SupabaseClient | null = null;

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
  supabaseClient = createClient(config.url, config.publicKey);

  return supabaseClient;
}
