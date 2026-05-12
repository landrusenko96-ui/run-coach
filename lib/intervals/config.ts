export type IntervalsServerConfig = {
  athleteId: string | null;
  apiKey: string;
};

export type IntervalsEnvStatus = {
  athleteIdConfigured: boolean;
  apiKeyConfigured: boolean;
};

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Intervals.icu API credentials can only be read on the server.");
  }
}

function getOptionalEnvValue(name: string): string | null {
  const value = process.env[name]?.trim();

  return value ? value : null;
}

export function getIntervalsServerConfigStatus(): IntervalsEnvStatus {
  assertServerOnly();

  return {
    athleteIdConfigured: getOptionalEnvValue("INTERVALS_ATHLETE_ID") !== null,
    apiKeyConfigured: getOptionalEnvValue("INTERVALS_API_KEY") !== null,
  };
}

export function getIntervalsServerConfig(): IntervalsServerConfig {
  assertServerOnly();

  const apiKey = getOptionalEnvValue("INTERVALS_API_KEY");

  if (!apiKey) {
    throw new Error("Missing INTERVALS_API_KEY server environment variable.");
  }

  return {
    athleteId: getOptionalEnvValue("INTERVALS_ATHLETE_ID"),
    apiKey,
  };
}
