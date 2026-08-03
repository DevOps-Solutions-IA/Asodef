/**
 * Mirrors apps/api's GlobalExceptionFilter envelope
 * (src/common/filters/global-exception.filter.ts). Kept in sync manually
 * for now - both sides are small enough that a generated/shared contracts
 * package would be premature (see packages/contracts note if that
 * changes once the API surface grows).
 */
export interface ApiErrorEnvelope {
  statusCode: number;
  error: string;
  message: unknown;
  path?: string;
  timestamp?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type ApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "validation"
  | "server"
  | "network"
  | "unknown";

const SAFE_MESSAGES: Record<ApiErrorKind, string> = {
  unauthorized: "Tu sesión expiró o no has iniciado sesión. Por favor inicia sesión nuevamente.",
  forbidden: "No tienes permisos para realizar esta acción.",
  not_found: "No encontramos lo que buscabas.",
  rate_limited: "Demasiadas solicitudes. Intenta nuevamente en unos minutos.",
  validation: "Revisa la información ingresada e intenta nuevamente.",
  server: "Ocurrió un problema en el servidor. Intenta nuevamente más tarde.",
  network: "No pudimos conectar con el servidor. Verifica tu conexión a internet.",
  unknown: "Ocurrió un problema inesperado. Intenta nuevamente.",
};

export function classifyStatus(status: number): ApiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500) return "server";
  return "unknown";
}

export interface ApiErrorParams {
  kind: ApiErrorKind;
  status: number | null;
  envelope: ApiErrorEnvelope | null;
  requestId?: string;
  retryAfterSeconds?: number;
  cause?: unknown;
}

/**
 * The only error type presentation components should ever catch from the
 * API client. `message` is always a safe, translated, user-facing string -
 * the raw envelope (with whatever the server actually said) is available
 * on `.envelope` for callers that specifically need it (e.g. field-level
 * validation messages), but must never be rendered directly to an
 * end user without translation.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly envelope: ApiErrorEnvelope | null;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(params: ApiErrorParams) {
    super(SAFE_MESSAGES[params.kind]);
    this.name = "ApiError";
    this.kind = params.kind;
    this.status = params.status;
    this.envelope = params.envelope;
    this.requestId = params.requestId;
    this.retryAfterSeconds = params.retryAfterSeconds;
    if (params.cause !== undefined) {
      this.cause = params.cause;
    }
  }
}
