import { ErrorState } from "@asodef/ui";
import { useAuth } from "../../lib/auth/auth-context";
import { UserSessionsPage } from "./UserSessionsPage";

/** Current-admin facade over the existing user-scoped session API.
 * Authentication and the users.sessions.* permission guards remain in
 * the router/backend; the browser never supplies an arbitrary target id. */
export function CurrentAdminSessionsPage() {
  const { user } = useAuth();

  if (!user) {
    return <ErrorState description="No fue posible identificar la sesión administrativa actual." />;
  }

  return <UserSessionsPage userId={user.id} userEmail={user.email} currentAccount />;
}
