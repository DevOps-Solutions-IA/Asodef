import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { NotFoundPage } from "../../pages/errors/NotFoundPage";
import { ForbiddenPage } from "../../pages/errors/ForbiddenPage";
import { ServiceUnavailablePage } from "../../pages/errors/ServiceUnavailablePage";

/**
 * Wired as `errorElement` on every top-level route group. Never renders
 * error.message, error.stack, or anything else from the caught value -
 * only a status-appropriate, pre-written safe page.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) return <NotFoundPage />;
    if (error.status === 403) return <ForbiddenPage />;
  }

  return <ServiceUnavailablePage onRetry={() => window.location.reload()} />;
}
