import { Navigate, Outlet } from "react-router-dom";
import { Spinner } from "@asodef/ui";
import { useAuth } from "../auth-context";
import { ForbiddenPage } from "../../../pages/errors/ForbiddenPage";

export interface RoleRouteProps {
  /** Any one of these roles is sufficient - matches the backend
   * RolesGuard's own "requires at least one of the declared role names"
   * semantics, reserved for platform-governance-style gating rather than
   * general authorization (prefer PermissionRoute when a specific
   * permission exists - US-010 section 8). */
  roles: string[];
}

export function RoleRoute({ roles }: RoleRouteProps) {
  const { isLoading, isAuthenticated, hasAnyRole } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" label="Verificando permisos…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/iniciar-sesion" replace />;
  }

  if (!hasAnyRole(roles)) {
    return <ForbiddenPage />;
  }

  return <Outlet />;
}
