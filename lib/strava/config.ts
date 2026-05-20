export type StravaServerConfig = {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  callbackUrl: string;
};

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Strava API credentials can only be read on the server.");
  }
}

function getRequiredEnvValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name} server environment variable.`);
  }

  return value;
}

function normalizeAppUrl(value: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid URL.");
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error("NEXT_PUBLIC_APP_URL must not include a query string or hash.");
  }

  return value.replace(/\/+$/, "");
}

export function getStravaServerConfig(): StravaServerConfig {
  assertServerOnly();

  const appUrl = normalizeAppUrl(getRequiredEnvValue("NEXT_PUBLIC_APP_URL"));

  return {
    clientId: getRequiredEnvValue("STRAVA_CLIENT_ID"),
    clientSecret: getRequiredEnvValue("STRAVA_CLIENT_SECRET"),
    appUrl,
    callbackUrl: `${appUrl}/api/strava/callback`,
  };
}
