import { ApiError } from "../api-error";
import type { PasswordRecoveryErrorCode } from "./auth-types";

/**
 * Centralized, safe, user-facing authentication error categories
 * (US-010 section 9). Never render `error.envelope` or any raw backend
 * field directly - only ever these fixed, translated messages. The
 * backend already returns safe messages of its own, but this frontend
 * mapping exists so no page ever needs to reach into `error.envelope`
 * itself (which would risk one day rendering something unsafe if the
 * backend's shape ever changes) and so every page uses one shared
 * vocabulary instead of inventing its own strings.
 */
export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "SESSION_EXPIRED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_RESET_TOKEN"
  | "EXPIRED_RESET_TOKEN"
  | "USED_RESET_TOKEN"
  | "WEAK_PASSWORD"
  | "PASSWORD_REUSED"
  | "CURRENT_PASSWORD_INVALID"
  | "SERVICE_UNAVAILABLE"
  | "GENERIC_ERROR";

export interface AuthErrorPresentation {
  code: AuthErrorCode;
  message: string;
}

const MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_CREDENTIALS: "Credenciales inválidas.",
  RATE_LIMITED: "Demasiados intentos. Intenta nuevamente en unos minutos.",
  SESSION_EXPIRED: "Tu sesión expiró. Por favor inicia sesión nuevamente.",
  UNAUTHENTICATED: "Debes iniciar sesión para continuar.",
  FORBIDDEN: "No tienes permisos para realizar esta acción.",
  // INVALID_RESET_TOKEN and EXPIRED_RESET_TOKEN deliberately render the
  // *same* text: the backend itself collapses "invalid" and "expired"
  // into a single INVALID_OR_EXPIRED_TOKEN code (US-007's own anti-
  // enumeration-adjacent design - see password-recovery.service.ts) so
  // there is nothing more specific to say here without contradicting
  // that already-approved backend decision.
  INVALID_RESET_TOKEN: "Este enlace de recuperación no es válido o ha expirado. Solicita uno nuevo.",
  EXPIRED_RESET_TOKEN: "Este enlace de recuperación no es válido o ha expirado. Solicita uno nuevo.",
  USED_RESET_TOKEN: "Este enlace ya fue utilizado. Solicita uno nuevo.",
  WEAK_PASSWORD: "La contraseña no cumple con la política de seguridad.",
  PASSWORD_REUSED: "No puedes reutilizar una contraseña reciente.",
  CURRENT_PASSWORD_INVALID: "La contraseña actual no es válida.",
  SERVICE_UNAVAILABLE: "El servicio no está disponible en este momento. Intenta nuevamente más tarde.",
  GENERIC_ERROR: "Ocurrió un problema inesperado. Intenta nuevamente.",
};

function present(code: AuthErrorCode): AuthErrorPresentation {
  return { code, message: MESSAGES[code] };
}

function mapPasswordRecoveryCode(code: PasswordRecoveryErrorCode | undefined): AuthErrorCode | null {
  switch (code) {
    case "INVALID_OR_EXPIRED_TOKEN":
      return "INVALID_RESET_TOKEN";
    case "TOKEN_ALREADY_USED":
      return "USED_RESET_TOKEN";
    case "WEAK_PASSWORD":
      return "WEAK_PASSWORD";
    case "PASSWORD_REUSED":
      return "PASSWORD_REUSED";
    case "CURRENT_PASSWORD_INVALID":
      return "CURRENT_PASSWORD_INVALID";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "NOTIFICATION_UNAVAILABLE":
      return "SERVICE_UNAVAILABLE";
    case "GENERIC_FAILURE":
      return "GENERIC_ERROR";
    default:
      return null;
  }
}

/** Login always shows one generic message for every failure reason -
 * unknown email, wrong password, locked, inactive, suspended are all
 * indistinguishable 401s from the backend already (US-006), and this
 * mapping preserves that: any 401 here is INVALID_CREDENTIALS, never
 * "session expired" (there was no session to expire). */
export function getLoginErrorMessage(error: unknown): AuthErrorPresentation {
  if (error instanceof ApiError) {
    if (error.kind === "rate_limited") return present("RATE_LIMITED");
    if (error.kind === "unauthorized") return present("INVALID_CREDENTIALS");
    if (error.kind === "network" || error.kind === "server") return present("SERVICE_UNAVAILABLE");
  }
  return present("GENERIC_ERROR");
}

/** reset-password's error responses carry a specific safe `code` field
 * (see auth-types.ts's PasswordRecoveryErrorCode) - prefer that over the
 * generic HTTP-status-based classification. */
export function getResetPasswordErrorMessage(error: unknown): AuthErrorPresentation {
  if (error instanceof ApiError) {
    const backendCode = error.envelope?.code as PasswordRecoveryErrorCode | undefined;
    const mapped = mapPasswordRecoveryCode(backendCode);
    if (mapped) return present(mapped);
    if (error.kind === "rate_limited") return present("RATE_LIMITED");
    if (error.kind === "network" || error.kind === "server") return present("SERVICE_UNAVAILABLE");
  }
  return present("GENERIC_ERROR");
}

export function getChangePasswordErrorMessage(error: unknown): AuthErrorPresentation {
  // Same backend error-code contract as reset-password.
  return getResetPasswordErrorMessage(error);
}

/** For any other protected-data request failing (route guards, generic
 * pages) - not specific to a single auth form. */
export function getSessionErrorMessage(error: unknown): AuthErrorPresentation {
  if (error instanceof ApiError) {
    if (error.kind === "unauthorized") return present("SESSION_EXPIRED");
    if (error.kind === "forbidden") return present("FORBIDDEN");
    if (error.kind === "rate_limited") return present("RATE_LIMITED");
    if (error.kind === "network" || error.kind === "server") return present("SERVICE_UNAVAILABLE");
  }
  return present("GENERIC_ERROR");
}
