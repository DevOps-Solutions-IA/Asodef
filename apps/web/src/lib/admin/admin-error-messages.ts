import { ApiError } from "../api-error";

/**
 * Admin/operational surfaces are different from the public auth flows
 * (LoginPage etc.): those deliberately collapse every failure into one
 * generic message to avoid account enumeration. Here, the backend's own
 * `envelope.message` is already a safe, translated string (produced by
 * GlobalExceptionFilter/each service's SAFE_* constants - e.g. "Ya existe
 * un usuario con este correo electrónico.") - showing it directly gives
 * an administrator actually useful feedback without ever exposing a raw
 * stack trace, SQL error, or internal field name.
 */
export function getAdminErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // GlobalExceptionFilter deliberately lets an unexpected (non-
    // HttpException) error's raw message through to envelope.message
    // whenever NODE_ENV !== "production", to help debugging - so a
    // genuine 5xx must NEVER be trusted here even though it's a string;
    // only 4xx responses come from a controller deliberately throwing a
    // hand-written SAFE_* message (duplicate email, hierarchy, reason
    // required, etc.). envelope.message is also `unknown` because
    // class-validator sometimes produces an array instead of a string.
    const isControlledClientError = error.status !== null && error.status < 500;
    if (isControlledClientError && typeof error.envelope?.message === "string") {
      return error.envelope.message;
    }
    return error.message;
  }
  return "Ocurrió un problema inesperado. Intenta nuevamente.";
}
