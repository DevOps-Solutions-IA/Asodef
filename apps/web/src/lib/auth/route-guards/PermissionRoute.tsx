import { Navigate, Outlet } from "react-router-dom";
import { Spinner } from "@asodef/ui";
import { useAuth } from "../auth-context";
import { ForbiddenPage } from "../../../pages/errors/ForbiddenPage";

export interface PermissionRouteProps {
  /** All of these must be present - matches the backend PermissionsGuard's
   * own "requires ALL declared permissions" semantics (US-006/US-008), so
   * frontend and backend never disagree about what a route requires. */
  permissions: string[];
}

/**
 * US-010 section 8: "never infer permissions from role names when
 * explicit permissions are available" - prefer this over RoleRoute
 * wherever a specific permission exists. Renders ForbiddenPage in place
 * (same convention NotFoundPage already uses for unmatched routes - no
 * separate "/403" URL) rather than redirecting, since the user *is*
 * authenticated and the URL itself is valid; they simply lack access.
 *
 * This is a UX control only - the backend's own PermissionsGuard remains
 * the authoritative enforcement (US-010 section 6).
 */
export function PermissionRoute({ permissions }: PermissionRouteProps) {
  const { isLoading, isAuthenticated, hasPermission } = useAuth();

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

  const hasAllPermissions = permissions.every((permission) => hasPermission(permission));
  if (!hasAllPermissions) {
    return <ForbiddenPage />;
  }

  return <Outlet />;
}
