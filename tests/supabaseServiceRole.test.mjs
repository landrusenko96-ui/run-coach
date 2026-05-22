import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getSupabasePublicConfig } from "../lib/supabase/config.ts";
import {
  getSupabaseServiceRoleConfig,
} from "../lib/supabase/serviceRole.ts";

const trackedEnvNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const originalEnv = Object.fromEntries(
  trackedEnvNames.map((name) => [name, process.env[name]]),
);

function restoreEnv() {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function resetSupabaseEnv() {
  for (const name of trackedEnvNames) {
    delete process.env[name];
  }
}

function encodeBase64Url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildFakeJwt(payload) {
  return [
    encodeBase64Url({ alg: "HS256", typ: "JWT" }),
    encodeBase64Url(payload),
    "fake-signature",
  ].join(".");
}

describe("Supabase service role config", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("reads a server-only Supabase service role config", () => {
    resetSupabaseEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co/";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test-key";

    const config = getSupabaseServiceRoleConfig();

    assert.deepEqual(config, {
      url: "https://example.supabase.co",
      serviceRoleKey: "sb_secret_test-key",
    });
  });

  it("requires the service role key", () => {
    resetSupabaseEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

    assert.throws(
      () => getSupabaseServiceRoleConfig(),
      /Missing SUPABASE_SERVICE_ROLE_KEY server environment variable/,
    );
  });

  it("rejects a service role key exposed with a NEXT_PUBLIC prefix", () => {
    resetSupabaseEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY = "sb_secret_exposed";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test-key";

    assert.throws(
      () => getSupabaseServiceRoleConfig(),
      /Do not expose SUPABASE_SERVICE_ROLE_KEY with a NEXT_PUBLIC_ prefix/,
    );
  });

  it("rejects publishable and browser keys as service role keys", () => {
    resetSupabaseEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_public";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_publishable_public";

    assert.throws(
      () => getSupabaseServiceRoleConfig(),
      /must be a service role or secret key, not a public key/,
    );

    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_public";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-anon-key";

    assert.throws(
      () => getSupabaseServiceRoleConfig(),
      /must not match a public Supabase browser key/,
    );
  });

  it("rejects anon or user JWTs as service role keys", () => {
    resetSupabaseEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = buildFakeJwt({
      role: "anon",
    });

    assert.throws(
      () => getSupabaseServiceRoleConfig(),
      /must be a service_role JWT or Supabase secret key/,
    );

    process.env.SUPABASE_SERVICE_ROLE_KEY = buildFakeJwt({
      role: "authenticated",
    });

    assert.throws(
      () => getSupabaseServiceRoleConfig(),
      /must be a service_role JWT or Supabase secret key/,
    );
  });

  it("keeps normal public Supabase config behavior unchanged", () => {
    resetSupabaseEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co/";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_public";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test-key";

    assert.deepEqual(getSupabasePublicConfig(), {
      url: "https://example.supabase.co",
      publicKey: "sb_publishable_public",
      usingLegacyAnonKey: false,
    });
  });
});
