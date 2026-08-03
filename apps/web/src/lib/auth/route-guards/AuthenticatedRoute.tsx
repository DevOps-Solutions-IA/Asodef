import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spinner } from "@asodef/ui";
import { useAuth } from "../auth-context";

/**
 * US-010 section 6: protected pages must not briefly render before
 * authentication resolves - this renders an accessible loading state
 * (Spinner already exposes role="status") while session discovery is in
 * flight, then either the real route (via <Outlet/>) or a redirect to
 * /iniciar-sesion, never a flash of protected content.
 *
 * The return location is preserved only as React Router navigation
 * `state` (never a URL query string, never localStorage) - see
 * safe-redirect.ts for how LoginPage validates it before ever using it.
 */
export function AuthenticatedRoute() {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" label="Verificando tu sesión…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/iniciar-sesion" state={{ from: `${location.pathname}${location.search}` }} replace />;
  }

  return <Outlet />;
}
