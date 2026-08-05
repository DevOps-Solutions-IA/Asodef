import { vi } from "vitest";
import { Suspense } from "react";
import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth/AuthProvider";
import type { CurrentUser } from "../lib/auth/auth-types";
import { CookieConsentProvider } from "../lib/cookie-consent/CookieConsentContext";

/** A believable, complete CurrentUser fixture - override only what a
 * given test actually cares about. */
export function buildCurrentUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "user-1",
    email: "user@example.com",
    fullName: "Test User",
    status: "ACTIVE",
    roles: [],
    permissions: [],
    session: { createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: "2026-01-01T00:00:00.000Z" },
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

/**
 * Stubs global fetch so GET /auth/me resolves as either authenticated
 * (200 + the given CurrentUser) or unauthenticated (401) - exactly what
 * AuthProvider's session-discovery query expects. Any other path falls
 * through to a generic 200 empty body unless the caller supplies
 * `additionalHandlers` for a specific test's own extra expectations
 * (e.g. asserting a POST /auth/login call).
 */
export function mockAuthFetch(
  currentUser: CurrentUser | null,
  additionalHandlers?: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    const handled = additionalHandlers?.(url, init);
    if (handled) return handled;

    if (url.includes("/auth/me")) {
      return currentUser ? jsonResponse(200, currentUser) : jsonResponse(401, { statusCode: 401, error: "Unauthorized", message: "No autenticado." });
    }

    // A real backend rejects /auth/refresh whenever there is no valid
    // refresh cookie to begin with - which is exactly the unauthenticated
    // (currentUser === null) case here. Defaulting this to 200 previously
    // masked a real infinite-loop bug (session-invalidation handling ran
    // on every failed-refresh, clearing and immediately re-triggering the
    // /auth/me query) because it made every refresh attempt look like it
    // had spuriously succeeded. Tests that specifically need a *working*
    // refresh must say so explicitly via additionalHandlers.
    if (url.includes("/auth/refresh")) {
      return currentUser
        ? jsonResponse(200, {})
        : jsonResponse(401, { statusCode: 401, error: "Unauthorized", message: "No autenticado." });
    }

    return jsonResponse(200, {});
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Renders `ui` wrapped with a fresh QueryClientProvider + AuthProvider -
 * the same provider composition App.tsx uses - so any component under
 * test that calls useAuth()/useQuery() behaves exactly as it would in
 * the real app. Callers must call mockAuthFetch() (or stub fetch
 * themselves) before rendering, since AuthProvider immediately queries
 * GET /auth/me on mount. */
export function renderWithAuth(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CookieConsentProvider>
            <Suspense fallback={<div role="status">Cargando…</div>}>{children}</Suspense>
          </CookieConsentProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper }), queryClient };
}
