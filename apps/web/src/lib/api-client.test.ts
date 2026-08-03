import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient, apiRequest, onUnauthorized } from "./api-client";
import { ApiError } from "./api-error";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }),
  );
}

describe("apiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    onUnauthorized(() => {});
  });

  it("returns the parsed JSON body on a successful request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(jsonResponse(200, { status: "ok", timestamp: "2026-01-01T00:00:00.000Z" })),
    );

    const result = await apiClient.get<{ status: string }>("/health");
    expect(result).toEqual({ status: "ok", timestamp: "2026-01-01T00:00:00.000Z" });
  });

  it("sends a generated X-Request-Id header and JSON content type on every request", async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse(200, { status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.post("/leads", { fullName: "María Rojas" });

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("expected fetch to have been called");
    const [, init] = call;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Request-Id"]).toBeTruthy();
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({ fullName: "María Rojas" });
  });

  it("wraps a 4xx/5xx JSON error envelope in an ApiError with the server envelope preserved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        jsonResponse(400, {
          statusCode: 400,
          error: "Bad Request",
          message: "El correo electrónico no es válido",
          path: "/api/v1/leads",
          timestamp: "2026-01-01T00:00:00.000Z",
          requestId: "req-123",
        }),
      ),
    );

    await expect(apiClient.post("/leads", {})).rejects.toMatchObject({
      name: "ApiError",
      kind: "validation",
      status: 400,
      envelope: { message: "El correo electrónico no es válido", requestId: "req-123" },
    });
  });

  it("maps 401 to kind 'unauthorized', shows a safe message, and invokes the registered handler", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(jsonResponse(401, { statusCode: 401, error: "Unauthorized" })));

    const handler = vi.fn();
    onUnauthorized(handler);

    let caught: ApiError | undefined;
    try {
      await apiClient.get("/mi-cuenta/perfil");
    } catch (error) {
      caught = error as ApiError;
    }

    expect(caught?.kind).toBe("unauthorized");
    expect(caught?.message).not.toMatch(/statusCode|Unauthorized/);
    expect(caught?.message).toMatch(/sesión/i);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("maps 403 to kind 'forbidden' with a safe permission message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(jsonResponse(403, { statusCode: 403, error: "Forbidden" })));

    await expect(apiClient.get("/admin/usuarios")).rejects.toMatchObject({
      kind: "forbidden",
      message: expect.stringMatching(/permisos/i),
    });
  });

  it("maps 429 to kind 'rate_limited' and surfaces Retry-After when present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        jsonResponse(429, { statusCode: 429, error: "Too Many Requests" }, { "Retry-After": "30" }),
      ),
    );

    let caught: ApiError | undefined;
    try {
      await apiClient.post("/auth/login", {});
    } catch (error) {
      caught = error as ApiError;
    }

    expect(caught?.kind).toBe("rate_limited");
    expect(caught?.retryAfterSeconds).toBe(30);
  });

  it("maps a fetch/network failure to kind 'network' with a safe message, not the raw fetch error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    let caught: ApiError | undefined;
    try {
      await apiClient.get("/health");
    } catch (error) {
      caught = error as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.kind).toBe("network");
    expect(caught?.message).not.toContain("Failed to fetch");
    expect(caught?.message).toMatch(/conexión/i);
  });

  it("re-throws AbortError as-is so TanStack Query's own cancellation handling still works", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(apiRequest("/health")).rejects.toBe(abortError);
  });

  it("prefixes every request with /api/v1 and the configured base URL", async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse(200, { status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.get("/health/ready");

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("expected fetch to have been called");
    const [url] = call;
    expect(url).toMatch(/\/api\/v1\/health\/ready$/);
  });
});
