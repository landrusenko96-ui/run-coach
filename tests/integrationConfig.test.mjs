import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getIntervalsConfigProblem,
  getSupabaseServiceRoleConfigMessage,
  INTERVALS_NOT_CONFIGURED_MESSAGE,
  isIntervalsConfigError,
  isStravaOAuthConfigError,
  isStravaWebhookConfigError,
  isSupabaseServiceRoleConfigError,
  STRAVA_SERVICE_ROLE_NOT_CONFIGURED_MESSAGE,
  STRAVA_SERVICE_ROLE_UNSAFE_MESSAGE,
} from "../lib/integrationConfig.ts";

describe("integration config safety helpers", () => {
  it("reports missing Intervals config without reading secret values", () => {
    assert.equal(
      getIntervalsConfigProblem({
        athleteIdConfigured: false,
        apiKeyConfigured: true,
      }),
      INTERVALS_NOT_CONFIGURED_MESSAGE,
    );
    assert.equal(
      getIntervalsConfigProblem({
        athleteIdConfigured: true,
        apiKeyConfigured: true,
      }),
      null,
    );
  });

  it("classifies provider config errors by safe environment names", () => {
    assert.equal(
      isIntervalsConfigError(
        new Error("Missing INTERVALS_API_KEY server environment variable."),
      ),
      true,
    );
    assert.equal(
      isStravaOAuthConfigError(
        new Error("Missing STRAVA_CLIENT_ID server environment variable."),
      ),
      true,
    );
    assert.equal(
      isStravaWebhookConfigError(
        new Error("Missing STRAVA_WEBHOOK_VERIFY_TOKEN server environment variable."),
      ),
      true,
    );
  });

  it("keeps Supabase service-role configuration messages secret-free", () => {
    const missingError = new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY server environment variable.",
    );
    const unsafeError = new Error(
      "Do not expose SUPABASE_SERVICE_ROLE_KEY with a NEXT_PUBLIC_ prefix.",
    );

    assert.equal(isSupabaseServiceRoleConfigError(missingError), true);
    assert.equal(
      getSupabaseServiceRoleConfigMessage(missingError),
      STRAVA_SERVICE_ROLE_NOT_CONFIGURED_MESSAGE,
    );
    assert.equal(
      getSupabaseServiceRoleConfigMessage(unsafeError),
      STRAVA_SERVICE_ROLE_UNSAFE_MESSAGE,
    );
  });
});
