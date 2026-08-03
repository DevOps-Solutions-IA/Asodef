import { ApiError, classifyStatus, type ApiErrorEnvelope } from "./api-error";

/**
 * Base origin comes from environment config, never hardcoded - empty
 * string in production means "same origin" (Nginx proxies /api there).
 */
const API_ORIGIN = import.meta.env.VITE_API_URL ?? "";
const API_PREFIX = "/api/v1";

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registered by the auth module (a later story) to react to a 401 - e.g.
 * attempt a token refresh or redirect to /iniciar-sesion. Kept here rather
 * than baked into apiRequest so this client has no auth-flow knowledge. */
export function onUnauthorized(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function safeParseJson(response: Response): Promise<ApiErrorEnvelope | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as ApiErrorEnvelope;
  } catch {
    return null;
  }
}

/**
 * Central typed API client. Every request:
 *  - is prefixed with the configured base URL + /api/v1
 *  - sends JSON with a generated X-Request-Id (the API trusts/echoes it,
 *    see requestIdMiddleware server-side, giving end-to-end correlation)
 *  - includes credentials so httpOnly session cookies flow (US-006+)
 *  - supports AbortSignal passthrough for TanStack Query cancellation
 *  - throws a single ApiError type with a safe, translated message -
 *    never a raw fetch/DOM exception or the server's raw error text
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const requestId = createRequestId();
  let response: Response;

  try {
    response = await fetch(`${API_ORIGIN}${API_PREFIX}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Request-Id": requestId,
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (cause) {
    // fetch() itself throws for network failures/CORS/abort - AbortError
    // is re-thrown as-is so TanStack Query's own cancellation handling
    // (which specifically checks for that) keeps working.
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw cause;
    }
    throw new ApiError({ kind: "network", status: null, envelope: null, requestId, cause });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const envelope = await safeParseJson(response);

  if (!response.ok) {
    const kind = classifyStatus(response.status);
    if (kind === "unauthorized") {
      unauthorizedHandler?.();
    }
    const retryAfterHeader = response.headers.get("Retry-After");
    throw new ApiError({
      kind,
      status: response.status,
      envelope,
      requestId: envelope?.requestId ?? requestId,
      retryAfterSeconds: retryAfterHeader ? Number(retryAfterHeader) : undefined,
    });
  }

  return envelope as T;
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};
