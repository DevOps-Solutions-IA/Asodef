import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@asodef/ui";
import { LogOut } from "lucide-react";
import { useAuth } from "../../lib/auth/auth-context";

export interface LogoutButtonProps {
  className?: string;
}

/** Shared logout entry point for every private layout (US-010 section 7).
 * Disables itself while pending to prevent repeated clicks, and always
 * redirects to /iniciar-sesion once AuthProvider's logout() settles -
 * that call itself never throws to the caller and already clears
 * session/query state regardless of whether the backend call succeeded,
 * so there is nothing further to handle here. */
export function LogoutButton({ className }: LogoutButtonProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    await logout();
    navigate("/iniciar-sesion", { replace: true });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      loading={isLoggingOut}
      disabled={isLoggingOut}
      iconLeft={<LogOut className="h-4 w-4" aria-hidden="true" />}
      className={className}
    >
      Cerrar sesión
    </Button>
  );
}
