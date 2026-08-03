import { describe, expect, it } from "vitest";
import { createQueryClient } from "./query-client";
import { ApiError } from "./api-error";

describe("createQueryClient retry policy", () => {
  function getQueryRetryFn() {
    const client = createQueryClient();
    const retry = client.getDefaultOptions().queries?.retry;
    if (typeof retry !== "function") {
      throw new Error("expected queries.retry to be a function");
    }
    return retry;
  }

  it("never retries an unauthorized (401) query error", () => {
    const retry = getQueryRetryFn();
    const error = new ApiError({ kind: "unauthorized", status: 401, envelope: null });
    expect(retry(0, error)).toBe(false);
  });

  it("never retries a forbidden (403) query error", () => {
    const retry = getQueryRetryFn();
    const error = new ApiError({ kind: "forbidden", status: 403, envelope: null });
    expect(retry(0, error)).toBe(false);
  });

  it("never retries a validation (400/422) query error", () => {
    const retry = getQueryRetryFn();
    const error = new ApiError({ kind: "validation", status: 400, envelope: null });
    expect(retry(0, error)).toBe(false);
  });

  it("never retries a not_found (404) query error", () => {
    const retry = getQueryRetryFn();
    const error = new ApiError({ kind: "not_found", status: 404, envelope: null });
    expect(retry(0, error)).toBe(false);
  });

  it("retries a rate_limited (429) query error exactly once", () => {
    const retry = getQueryRetryFn();
    const error = new ApiError({ kind: "rate_limited", status: 429, envelope: null });
    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(false);
  });

  it("retries a server (5xx) error up to 2 times", () => {
    const retry = getQueryRetryFn();
    const error = new ApiError({ kind: "server", status: 500, envelope: null });
    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(true);
    expect(retry(2, error)).toBe(false);
  });

  it("retries a network error up to 2 times", () => {
    const retry = getQueryRetryFn();
    const error = new ApiError({ kind: "network", status: null, envelope: null });
    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(true);
    expect(retry(2, error)).toBe(false);
  });

  it("disables mutation retries by default, so a payment/auth mutation is never silently re-submitted", () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it("uses a bounded exponential backoff for query retries", () => {
    const client = createQueryClient();
    const retryDelay = client.getDefaultOptions().queries?.retryDelay;
    if (typeof retryDelay !== "function") {
      throw new Error("expected queries.retryDelay to be a function");
    }
    expect(retryDelay(0, new Error())).toBeLessThan(retryDelay(3, new Error()));
    expect(retryDelay(10, new Error())).toBeLessThanOrEqual(10_000);
  });

  it("sets a non-zero staleTime so repeat navigation doesn't always refetch", () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().queries?.staleTime).toBeGreaterThan(0);
  });
});
