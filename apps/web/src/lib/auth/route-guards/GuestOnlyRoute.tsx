import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spinner } from "@asodef/ui";
import { useAuth } from "../auth-context";
import { resolveLandingPath } from "../role-routing";
import { isSafeInternalPath } from "../safe-redirect";

interface LocationState {
  from?: unknown;
}

/**
 * Wraps /iniciar-sesion, /recuperar-clave, /restablecer-clave: an already
 * authenticated visitor is sent to their real landing area (the same
 * centralized resolveLandingPath() every other post-login redirect uses)
 * instead of seeing the login form again.
 *
 * Bug fix (found while verifying US-060's Negative case - "returns to the
 * originally requested page after login"): this component re-renders the
 * instant notifyLoggedIn() flips isAuthenticated to true, firing its own
 * Navigate in a race against LoginPage's onSuccess handler. Whichever one
 * wins decided the final destination, and this one never knew about the
 * preserved `from` location, so it silently discarded it in real browser
 * runs (LoginPage.test.tsx never caught this since it renders LoginPage in
 * isolation, without GuestOnlyRoute wrapping it - a composition-only bug).
 * Now both paths resolve the same target the same way.
 */
export function GuestOnlyRoute() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" label="Cargando…" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    const fromState = (location.state as LocationState | null)?.from;
    const target = isSafeInternalPath(fromState) ? fromState : resolveLandingPath(user.roles);
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
}
