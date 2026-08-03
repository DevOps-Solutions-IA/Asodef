import { Navigate, Outlet } from "react-router-dom";
import { Spinner } from "@asodef/ui";
import { useAuth } from "../auth-context";
import { resolveLandingPath } from "../role-routing";

/**
 * Wraps /iniciar-sesion, /recuperar-clave, /restablecer-clave: an already
 * authenticated visitor is sent to their real landing area (the same
 * centralized resolveLandingPath() every other post-login redirect uses)
 * instead of seeing the login form again.
 */
export function GuestOnlyRoute() {
  const { isLoading, isAuthenticated, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" label="Cargando…" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <Navigate to={resolveLandingPath(user.roles)} replace />;
  }

  return <Outlet />;
}
