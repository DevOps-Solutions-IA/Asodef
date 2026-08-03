import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-error";

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    // Retrying an auth/permission/validation/not-found failure can't
    // possibly succeed without something else changing first.
    if (
      error.kind === "unauthorized" ||
      error.kind === "forbidden" ||
      error.kind === "not_found" ||
      error.kind === "validation"
    ) {
      return false;
    }
    // One retry only for rate limiting - the caller is expected to also
    // respect error.retryAfterSeconds for anything more deliberate.
    if (error.kind === "rate_limited") {
      return failureCount < 1;
    }
  }
  // Network/server errors: a couple of retries with backoff is reasonable.
  return failureCount < 2;
}

function retryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 10_000);
}

/**
 * Production-oriented defaults:
 *  - queries: bounded, error-aware retries (see shouldRetryQuery) and a
 *    30s staleTime so navigating back to an already-fetched screen
 *    doesn't immediately re-fetch; refetchOnWindowFocus disabled for a
 *    calmer UX (opt back in per-query where genuinely useful).
 *  - mutations: retry disabled by default. This is deliberate and
 *    non-negotiable for auth/payment flows - an automatically-retried
 *    login or payment-order creation could double-submit; individual
 *    mutations that are provably idempotent may opt into retry
 *    explicitly at the call site, but the default must stay off.
 *
 * Query keys always come from lib/query-keys.ts's central factory -
 * never inline array literals - so invalidation stays consistent:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.health.ready() })
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
