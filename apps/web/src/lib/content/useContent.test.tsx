import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../query-client";
import { useContent } from "./useContent";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderUseContent() {
  const queryClient = createQueryClient();
  return renderHook(() => useContent(), {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
}

describe("useContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty map before the query resolves - never undefined, never throws", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { result } = renderUseContent();
    expect(result.current).toEqual({});
  });

  it("returns a key -> value map built from the published entries once loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(200, [{ key: "hero.eyebrow", value: "Valor desde la base de datos" }])),
    );
    const { result } = renderUseContent();

    await waitFor(() => {
      expect(result.current).toEqual({ "hero.eyebrow": "Valor desde la base de datos" });
    });
  });

  it("returns an empty map (not a thrown error) when the API responds with a server error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "boom" })));
    const { result } = renderUseContent();

    await waitFor(() => {
      expect(result.current).toEqual({});
    });
  });

  it("returns an empty map (not a thrown error) on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const { result } = renderUseContent();

    await waitFor(() => {
      expect(result.current).toEqual({});
    });
  });
});
