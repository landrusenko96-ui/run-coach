export type SupabasePublicConfig = {
  url: string;
  publicKey: string;
  usingLegacyAnonKey: boolean;
};

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const legacyAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const publicKey = publishableKey || legacyAnonKey;

  if (!url || !publicKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. NEXT_PUBLIC_SUPABASE_ANON_KEY is still supported as a legacy fallback.",
    );
  }

  if (publicKey.startsWith("sb_secret_")) {
    throw new Error(
      "Supabase public client keys must not use an sb_secret_ key. Use a publishable key or legacy anon key.",
    );
  }

  try {
    new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  return {
    url: url.replace(/\/+$/, ""),
    publicKey,
    usingLegacyAnonKey: !publishableKey,
  };
}
