import { randomBytes } from "node:crypto";

export const STRAVA_OAUTH_STATE_COOKIE_NAME = "strava_oauth_state";
export const STRAVA_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export function createStravaOAuthState(): string {
  return randomBytes(32).toString("hex");
}

export function isValidStravaOAuthState(
  receivedState: string | null,
  expectedState: string | null,
): boolean {
  return Boolean(
    receivedState &&
      expectedState &&
      receivedState.length >= 32 &&
      receivedState === expectedState,
  );
}
