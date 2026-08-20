import { ErrorState } from "@asodef/ui";
import { useAuth } from "../../lib/auth/auth-context";
import { UserSecurityPage } from "./UserSecurityPage";
import { AdminMfaPanel } from "./AdminMfaPanel";

/** Current-admin facade over the existing user-scoped security-event API.
 * It derives ownership from the authenticated subject instead of a URL
 * parameter and introduces no parallel security-event implementation. */
export function CurrentAdminSecurityPage() {
  const { user } = useAuth();

  if (!user) {
    return <ErrorState description="No fue posible identificar la sesión administrativa actual." />;
  }

  return (
    <UserSecurityPage
      userId={user.id}
      userEmail={user.email}
      currentAccount
      beforeHistory={user.roles.includes("SUPER_ADMIN") ? <AdminMfaPanel /> : undefined}
    />
  );
}
