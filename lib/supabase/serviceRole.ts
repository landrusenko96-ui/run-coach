import { createClient } from "@supabase/supabase-js";

export type SupabaseServiceRoleConfig = {
  url: string;
  serviceRoleKey: string;
};

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Supabase service role clients can only be used on the server.");
  }
}

function getRequiredEnvValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name} server environment variable.`);
  }

  return value;
}

function normalizeSupabaseUrl(value: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must not include a query string or hash.");
  }

  return value.replace(/\/+$/, "");
}

function decodeJwtPayload(key: string): Record<string, unknown> | null {
  const parts = key.split(".");

  if (parts.length !== 3 || !parts[1]) {
    return null;
  }

  try {
    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8")) as unknown;

    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function assertServiceRoleKeyLooksPrivate(key: string): void {
  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      "Do not expose SUPABASE_SERVICE_ROLE_KEY with a NEXT_PUBLIC_ prefix.",
    );
  }

  if (key.startsWith("sb_publishable_") || key.startsWith("sb_anon_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be a service role or secret key, not a public key.",
    );
  }

  if (
    key === process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    key === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  ) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must not match a public Supabase browser key.",
    );
  }

  const jwtPayload = decodeJwtPayload(key);
  const role = jwtPayload?.role;

  if (typeof role === "string" && role !== "service_role") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be a service_role JWT or Supabase secret key.",
    );
  }
}

export function getSupabaseServiceRoleConfig(): SupabaseServiceRoleConfig {
  assertServerOnly();

  const url = normalizeSupabaseUrl(
    getRequiredEnvValue("NEXT_PUBLIC_SUPABASE_URL"),
  );
  const serviceRoleKey = getRequiredEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  assertServiceRoleKeyLooksPrivate(serviceRoleKey);

  return {
    url,
    serviceRoleKey,
  };
}

export function createServiceRoleClient() {
  const config = getSupabaseServiceRoleConfig();

  // This client bypasses RLS. Use it only in trusted server-side code, such as
  // webhook ingestion or admin maintenance tasks, and never in browser code.
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
