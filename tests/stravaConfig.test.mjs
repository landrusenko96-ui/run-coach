import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getStravaServerConfig,
  getStravaWebhookServerConfig,
} from "../lib/strava/config.ts";

const originalEnv = {
  STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  STRAVA_WEBHOOK_CALLBACK_URL: process.env.STRAVA_WEBHOOK_CALLBACK_URL,
  STRAVA_WEBHOOK_VERIFY_TOKEN: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN,
};

function restoreEnv() {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

describe("Strava config", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("reads and normalizes server-side Strava config", () => {
    process.env.STRAVA_CLIENT_ID = "12345";
    process.env.STRAVA_CLIENT_SECRET = "super-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000/";

    const config = getStravaServerConfig();

    assert.deepEqual(config, {
      clientId: "12345",
      clientSecret: "super-secret",
      appUrl: "http://localhost:3000",
      callbackUrl: "http://localhost:3000/api/strava/callback",
    });
  });

  it("does not require webhook secrets for normal OAuth config", () => {
    process.env.STRAVA_CLIENT_ID = "12345";
    process.env.STRAVA_CLIENT_SECRET = "super-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    delete process.env.STRAVA_WEBHOOK_CALLBACK_URL;
    delete process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;

    const config = getStravaServerConfig();

    assert.equal(config.callbackUrl, "http://localhost:3000/api/strava/callback");
  });

  it("reads server-only webhook subscription config", () => {
    process.env.STRAVA_CLIENT_ID = "12345";
    process.env.STRAVA_CLIENT_SECRET = "super-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000/";
    process.env.STRAVA_WEBHOOK_CALLBACK_URL =
      "https://example.com/api/strava/webhook";
    process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = "verify-token";

    const config = getStravaWebhookServerConfig();

    assert.deepEqual(config, {
      clientId: "12345",
      clientSecret: "super-secret",
      appUrl: "http://localhost:3000",
      callbackUrl: "http://localhost:3000/api/strava/callback",
      webhookCallbackUrl: "https://example.com/api/strava/webhook",
      webhookVerifyToken: "verify-token",
    });
  });

  it("requires webhook config only for webhook subscription management", () => {
    process.env.STRAVA_CLIENT_ID = "12345";
    process.env.STRAVA_CLIENT_SECRET = "super-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    delete process.env.STRAVA_WEBHOOK_CALLBACK_URL;
    process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = "verify-token";

    assert.throws(
      () => getStravaWebhookServerConfig(),
      /Missing STRAVA_WEBHOOK_CALLBACK_URL/,
    );
  });

  it("requires the Strava client id", () => {
    delete process.env.STRAVA_CLIENT_ID;
    process.env.STRAVA_CLIENT_SECRET = "super-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    assert.throws(
      () => getStravaServerConfig(),
      /Missing STRAVA_CLIENT_ID server environment variable/,
    );
  });

  it("requires a valid app URL", () => {
    process.env.STRAVA_CLIENT_ID = "12345";
    process.env.STRAVA_CLIENT_SECRET = "super-secret";
    process.env.NEXT_PUBLIC_APP_URL = "not a url";

    assert.throws(() => getStravaServerConfig(), /valid URL/);
  });
});
