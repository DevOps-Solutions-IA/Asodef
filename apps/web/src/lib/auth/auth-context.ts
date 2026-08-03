import { createContext, useContext } from "react";
import type { CurrentUser } from "./auth-types";

/**
 * The context value never contains a token - only the safe CurrentUser
 * shape (id/email/fullName/status/roles/permissions/session metadata)
 * that GET /auth/me already returns. Tokens live exclusively in httpOnly
 * cookies this code never touches. Split into its own file (rather than
 * living in AuthProvider.tsx) purely so that file can stay a
 * component-only export for Fast Refresh.
 */
export interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  /** Prefer this over hasRole/hasAnyRole wherever a specific permission
   * exists - US-010 section 8: "never infer permissions from role names
   * when explicit permissions are available." */
  hasPermission: (permission: string) => boolean;
  refetchUser: () => Promise<unknown>;
  notifyLoggedIn: () => Promise<CurrentUser | null>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
