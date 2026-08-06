import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { useAuth } from "./auth-context";
import { useQuery } from "@tanstack/react-query";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";

function AuthProbe() {
  const { user, isLoading, isAuthenticated } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="authenticated">{String(isAuthenticated)}</div>
      <div data-testid="user-email">{user?.email ?? "none"}</div>
    </div>
  );
}

function PublicQueryProbe() {
  const query = useQuery({
    queryKey: ["legal-documents", "detail", "public-regression"],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "published";
    },
  });
  return <div data-testid="public-query">{query.data ?? (query.isLoading ? "loading" : "error")}</div>;
}

describe("AuthProvider session discovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("settles to logged-out exactly once when there is no session, without looping /auth/me forever", async () => {
    // Regression test: a real backend 401s both GET /auth/me and POST
    // /auth/refresh when there is no valid session. A previous bug called
    // queryClient.clear() from inside the session-invalidated handler,
    // which runs synchronously from within meQuery's own in-flight
    // queryFn on this exact path - clearing the query's own in-flight
    // cache entry corrupted its lifecycle and caused an infinite re-fetch
    // loop (confirmed via a real browser trace: 600+ GET /auth/me calls
    // in ~3 seconds).
    const fetchMock = mockAuthFetch(null);
    renderWithAuth(<AuthProbe />);

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");

    // Give any runaway loop a real chance to manifest.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const meCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/auth/me"));
    expect(meCalls).toHaveLength(1);
  });

  it("still exposes the authenticated user normally when a session exists", async () => {
    mockAuthFetch(buildCurrentUser({ email: "someone@asodef.test", roles: ["CUSTOMER"] }));
    renderWithAuth(<AuthProbe />);

    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("true"));
    expect(screen.getByTestId("user-email")).toHaveTextContent("someone@asodef.test");
  });

  it("does not delete an in-flight public legal query when anonymous session discovery returns 401", async () => {
    mockAuthFetch(null);
    renderWithAuth(<><AuthProbe /><PublicQueryProbe /></>);

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    await waitFor(() => expect(screen.getByTestId("public-query")).toHaveTextContent("published"));
  });
});
