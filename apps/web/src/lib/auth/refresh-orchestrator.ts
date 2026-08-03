import { onUnauthorized } from "../api-client";
import { refreshSession } from "./auth-api";

/**
 * All refresh-and-retry orchestration lives in exactly this one module
 * (US-010 section 5) - no component ever implements its own retry loop.
 * Importing this module (done once, from AuthProvider) registers the
 * single handler api-client.ts calls on an eligible 401.
 */

// Shared by every concurrent caller - the classic "refresh mutex" so N
// simultaneous 401s trigger exactly one POST /auth/refresh, and every
// caller awaits that same in-flight attempt rather than racing their own
// (US-010: "prevent multiple parallel refresh requests").
let refreshPromise: Promise<boolean> | null = null;

// Set the instant logout is requested and cleared on the next successful
// login - a request that straggles in and 401s right after the user
// clicked "logout" must never trigger a refresh (US-010: "never refresh
// after explicit logout").
let loggedOutIntentionally = false;

let sessionInvalidatedHandler: (() => void) | null = null;

/** Called by AuthProvider so it can react (clear cached user, let route
 * guards redirect) when a refresh attempt itself fails. */
export function registerSessionInvalidatedHandler(handler: () => void): void {
  sessionInvalidatedHandler = handler;
}

export function markLoggedOut(): void {
  loggedOutIntentionally = true;
}

export function markLoggedIn(): void {
  loggedOutIntentionally = false;
}

async function performRefresh(): Promise<boolean> {
  try {
    await refreshSession();
    return true;
  } catch {
    sessionInvalidatedHandler?.();
    return false;
  }
}

function handleUnauthorized(): Promise<boolean> {
  if (loggedOutIntentionally) {
    return Promise.resolve(false);
  }
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

onUnauthorized(handleUnauthorized);
