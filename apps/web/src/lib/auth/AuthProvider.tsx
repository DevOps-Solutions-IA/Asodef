import { useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { ApiError } from "../api-error";
import { fetchCurrentUser, logout as logoutRequest, logoutAll as logoutAllRequest } from "./auth-api";
import type { CurrentUser } from "./auth-types";
import { markLoggedIn, markLoggedOut, registerSessionInvalidatedHandler } from "./refresh-orchestrator";
import { broadcastLogout, subscribeToLogoutBroadcast } from "./cross-tab-logout";
import { AuthContext, type AuthContextValue } from "./auth-context";

/**
 * The one centralized authentication/session layer (US-010 section 4).
 * TanStack Query is the authoritative server-state mechanism for the
 * session itself (queryKeys.auth.me()) - there is deliberately no second
 * copy of "is the user logged in" in a separate store (e.g. Redux/Zustand/
 * plain useState mirroring the query) - every consumer reads through
 * useAuth() (see auth-context.ts), which reads through this one query.
 */
async function fetchSessionOrNull(signal?: AbortSignal): Promise<CurrentUser | null> {
  try {
    return await fetchCurrentUser(signal);
  } catch (error) {
    // Unauthenticated is a normal, expected outcome of session discovery
    // (no cookie, or refresh itself failed) - not a query error. Any
    // other failure (network/server) is left to throw so isError/isLoading
    // reflect a real problem instead of silently looking "logged out".
    if (error instanceof ApiError && error.kind === "unauthorized") {
      return null;
    }
    throw error;
  }
}

/**
 * Purges cached protected query domains, then writes the given session
 * value directly. US-010 requires that no stale protected data survive
 * a logout or a failed session refresh - but
 * `queryClient.clear()` would remove *every* cache entry, including
 * meQuery's own, and the session-invalidated handler in particular runs
 * synchronously from inside meQuery's own in-flight queryFn call (GET
 * /auth/me -> 401 -> refresh attempt -> also 401 -> this handler).
 * Wiping that query's cache entry out from under its own still-running
 * fetch corrupts its lifecycle in TanStack Query: the observer never
 * receives the eventually-settled result, so isLoading gets stuck at
 * `true` forever (reproduced and confirmed - see AuthProvider.test.tsx).
 * Excluding the auth key from the purge avoids the self-interference.
 * Restricting the purge to authenticated domains also prevents a normal
 * anonymous 401 from deleting in-flight public legal/content queries and
 * leaving their observers stuck in a loading state.
 */
function purgeProtectedDataAndSetSession(
  queryClient: ReturnType<typeof useQueryClient>,
  session: CurrentUser | null,
): void {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === "admin" || query.queryKey[0] === "me" });
  queryClient.setQueryData(queryKeys.auth.me(), session);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: ({ signal }) => fetchSessionOrNull(signal),
    retry: false,
  });

  useEffect(() => {
    registerSessionInvalidatedHandler(() => {
      purgeProtectedDataAndSetSession(queryClient, null);
    });
  }, [queryClient]);

  useEffect(
    () =>
      subscribeToLogoutBroadcast(() => {
        markLoggedOut();
        purgeProtectedDataAndSetSession(queryClient, null);
      }),
    [queryClient],
  );

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      // Always clear locally, whether the API call itself succeeded,
      // failed, or the session was already revoked server-side (US-010
      // section 7: "remain safe when the backend session is already
      // revoked" / "do not expose internal logout errors").
      markLoggedOut();
      purgeProtectedDataAndSetSession(queryClient, null);
      broadcastLogout();
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: logoutAllRequest,
    onSettled: () => {
      markLoggedOut();
      purgeProtectedDataAndSetSession(queryClient, null);
      broadcastLogout();
    },
  });

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync().catch(() => undefined);
  }, [logoutMutation]);

  const logoutAll = useCallback(async () => {
    await logoutAllMutation.mutateAsync().catch(() => undefined);
  }, [logoutAllMutation]);

  const refetchUser = useCallback(() => meQuery.refetch(), [meQuery]);

  /** Called by LoginPage immediately after a successful POST /auth/login
   * - login's own response is just the safe user, never roles/permissions,
   * so /auth/me must be (re-)fetched before any role-based redirect
   * decision can be made (US-010 section 1). */
  const notifyLoggedIn = useCallback(async () => {
    markLoggedIn();
    const result = await meQuery.refetch();
    return result.data ?? null;
  }, [meQuery]);

  const user = meQuery.data ?? null;

  const hasRole = useCallback((role: string) => !!user?.roles.includes(role), [user]);
  const hasAnyRole = useCallback((roles: string[]) => !!user && roles.some((role) => user.roles.includes(role)), [user]);
  const hasPermission = useCallback((permission: string) => !!user?.permissions.includes(permission), [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: meQuery.isLoading,
      isAuthenticated: !!user,
      hasRole,
      hasAnyRole,
      hasPermission,
      refetchUser,
      notifyLoggedIn,
      logout,
      logoutAll,
    }),
    [user, meQuery.isLoading, hasRole, hasAnyRole, hasPermission, refetchUser, notifyLoggedIn, logout, logoutAll],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
