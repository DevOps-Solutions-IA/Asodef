import { NavLink } from "react-router-dom";
import { useAuth } from "../../lib/auth/auth-context";

export interface UserDetailTabsProps {
  userId: string;
}

const TAB_CLASS =
  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors data-[active=true]:bg-brand-dark data-[active=true]:text-white data-[active=true]:shadow-e1 data-[active=false]:text-text-muted data-[active=false]:hover:bg-bg-soft";

/** Shared sub-navigation between the pages that all describe one user
 * (detail/edit/roles/sessions/security) - each tab is only shown if the
 * viewer actually holds the permission that page requires, so the nav
 * never advertises an action that would just 403. */
export function UserDetailTabs({ userId }: UserDetailTabsProps) {
  const { hasPermission } = useAuth();
  const base = `/admin/usuarios/${userId}`;

  const tabs = [
    { to: base, label: "Perfil", end: true, show: true },
    { to: `${base}/editar`, label: "Editar", end: false, show: hasPermission("users.update") },
    { to: `${base}/roles`, label: "Roles", end: false, show: hasPermission("users.roles.manage") },
    { to: `${base}/sesiones`, label: "Sesiones", end: false, show: hasPermission("users.sessions.read") },
    { to: `${base}/seguridad`, label: "Seguridad", end: false, show: hasPermission("users.security.read") },
  ].filter((tab) => tab.show);

  return (
    <nav aria-label="Secciones del usuario" className="flex flex-wrap gap-1.5 border-b border-border-soft pb-4">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className="inline-block">
          {({ isActive }) => (
            <span data-active={isActive} className={TAB_CLASS}>
              {tab.label}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
