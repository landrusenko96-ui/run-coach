import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getStravaServerConfig } from "../lib/strava/config.ts";

const originalEnv = {
  STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
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
