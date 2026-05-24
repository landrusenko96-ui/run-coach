import type { IntervalsEnvStatus } from "./intervals/config.ts";

export const INTERVALS_NOT_CONFIGURED_MESSAGE =
  "Intervals.icu export is not configured. Set INTERVALS_ATHLETE_ID and INTERVALS_API_KEY in the server environment.";

export const STRAVA_OAUTH_NOT_CONFIGURED_MESSAGE =
  "Strava OAuth is not configured. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and NEXT_PUBLIC_APP_URL in the server environment.";

export const STRAVA_SERVICE_ROLE_NOT_CONFIGURED_MESSAGE =
  "Strava secure server access is not configured. Set SUPABASE_SERVICE_ROLE_KEY in the server environment.";

export const STRAVA_SERVICE_ROLE_UNSAFE_MESSAGE =
  "Supabase service-role configuration is unsafe. Keep SUPABASE_SERVICE_ROLE_KEY server-only and remove any NEXT_PUBLIC service-role variable.";

export const STRAVA_WEBHOOK_NOT_CONFIGURED_MESSAGE =
  "Strava webhooks are not configured. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_WEBHOOK_CALLBACK_URL, and STRAVA_WEBHOOK_VERIFY_TOKEN in the server environment.";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

export function getIntervalsConfigProblem(
  status: IntervalsEnvStatus,
): string | null {
  if (status.athleteIdConfigured && status.apiKeyConfigured) {
    return null;
  }

  return INTERVALS_NOT_CONFIGURED_MESSAGE;
}

export function isIntervalsConfigError(error: unknown): boolean {
  const message = getErrorMessage(error);

  return (
    message.includes("INTERVALS_ATHLETE_ID") ||
    message.includes("INTERVALS_API_KEY")
  );
}

export function isStravaOAuthConfigError(error: unknown): boolean {
  const message = getErrorMessage(error);

  return (
    message.includes("STRAVA_CLIENT_ID") ||
    message.includes("STRAVA_CLIENT_SECRET") ||
    message.includes("NEXT_PUBLIC_APP_URL")
  );
}

export function isStravaWebhookConfigError(error: unknown): boolean {
  const message = getErrorMessage(error);

  return (
    isStravaOAuthConfigError(error) ||
    message.includes("STRAVA_WEBHOOK_CALLBACK_URL") ||
    message.includes("STRAVA_WEBHOOK_VERIFY_TOKEN")
  );
}

export function isSupabaseServiceRoleConfigError(error: unknown): boolean {
  const message = getErrorMessage(error);

  return message.includes("SUPABASE_SERVICE_ROLE_KEY");
}

export function getSupabaseServiceRoleConfigMessage(error: unknown): string {
  const message = getErrorMessage(error);

  if (
    message.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY") ||
    message.includes("NEXT_PUBLIC_")
  ) {
    return STRAVA_SERVICE_ROLE_UNSAFE_MESSAGE;
  }

  return STRAVA_SERVICE_ROLE_NOT_CONFIGURED_MESSAGE;
}
