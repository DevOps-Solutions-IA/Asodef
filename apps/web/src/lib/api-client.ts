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
  /**
   * Set on the auth endpoints that must never trigger a refresh-and-retry
   * cycle (login, refresh itself, logout, forgot-password, reset-password)
   * - see auth-api.ts. Also set internally on the single retry attempt
   * apiRequest makes after a successful refresh, so that retry's own 401
   * (if any) can never recurse into another refresh (US-010 section 5:
   * "do not enter infinite refresh loops").
   */
  skipAuthRefresh?: boolean;
  /** Optional response observer for protocol metadata such as rotated CSRF
   * tokens. It runs before the body is consumed and must not mutate the
   * response. */
  onResponse?: (response: Response) => void;
}

/** Returns true if a refresh just succeeded (safe to retry the original
 * request once), false otherwise. Registered by AuthProvider (US-010) so
 * this client keeps zero auth-flow knowledge of its own - it only knows
 * "ask the handler, retry once if it says so". */
type UnauthorizedHandler = () => Promise<boolean>;
let unauthorizedHandler: UnauthorizedHandler | null = null;

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
  const formBody = typeof FormData !== "undefined" && options.body instanceof FormData;

  try {
    response = await fetch(`${API_ORIGIN}${API_PREFIX}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      signal: options.signal,
      headers: {
        ...(formBody ? {} : { "Content-Type": "application/json" }),
        Accept: "application/json",
        "X-Request-Id": requestId,
        ...options.headers,
      },
      body: options.body !== undefined
        ? formBody
          ? (options.body as FormData)
          : JSON.stringify(options.body)
        : undefined,
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

  options.onResponse?.(response);

  if (response.status === 204) {
    return undefined as T;
  }

  const envelope = await safeParseJson(response);

  if (!response.ok) {
    const kind = classifyStatus(response.status);

    if (kind === "unauthorized" && !options.skipAuthRefresh && unauthorizedHandler) {
      const refreshed = await unauthorizedHandler();
      if (refreshed) {
        // Retry exactly once - the caller passes skipAuthRefresh so a
        // second 401 on the retry itself is never eligible to trigger
        // yet another refresh attempt (prevents an infinite loop).
        return apiRequest<T>(path, { ...options, skipAuthRefresh: true });
      }
    }

    // The backend never sets a Retry-After *header* for 429s (see
    // RateLimiterService/AuthController) - retryAfterSeconds travels in
    // the JSON body instead. The header is still checked first in case a
    // future story adds one, but the body is the real source today.
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader
      ? Number(retryAfterHeader)
      : typeof envelope?.retryAfterSeconds === "number"
        ? envelope.retryAfterSeconds
        : undefined;

    throw new ApiError({
      kind,
      status: response.status,
      envelope,
      requestId: envelope?.requestId ?? requestId,
      retryAfterSeconds,
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
