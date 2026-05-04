import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  if (anonKey.startsWith("sb_secret_")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is using a secret Supabase key. Browser code must use a publishable key or legacy anon key instead.",
    );
  }

  try {
    new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  return {
    url: url.replace(/\/+$/, ""),
    anonKey,
  };
}

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const config = getSupabaseConfig();
  supabaseClient = createClient(config.url, config.anonKey);

  return supabaseClient;
}
