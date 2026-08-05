import { useRef } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { useAuth } from "../lib/auth/auth-context";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";
import { LogoutButton } from "./shared/LogoutButton";

// US-060's literal nav list. `permission` is the key required to SHOW the
// item (and matches the PermissionRoute guarding its route in router.tsx -
// see that file for the "usuarios stays users.read, not the AC Example's
// users.manage" note). Items with no `permission` (Dashboard, Planes,
// Consentimientos) render for every internal-staff role that already
// cleared the outer RoleRoute gate - no permission key exists for them and
// none is invented.
interface AdminNavItem {
  to: string;
  label: string;
  end?: true;
  permission: string | null;
}

const NAV_ITEMS: AdminNavItem[] = [
  { to: "/admin", label: "Dashboard", end: true, permission: null },
  { to: "/admin/crm", label: "CRM", permission: "crm.manage" },
  { to: "/admin/empresas-y-aliados", label: "Empresas y aliados", permission: "companies.read" },
  { to: "/admin/planes", label: "Planes", permission: null },
  { to: "/admin/contratos", label: "Contratos", permission: "contracts.read" },
  { to: "/admin/pagos", label: "Pagos", permission: "payments.read" },
  { to: "/admin/conciliacion", label: "Conciliación", permission: "payments.reconcile" },
  { to: "/admin/legal", label: "Legal", permission: "legal.approve" },
  { to: "/admin/consentimientos", label: "Consentimientos", permission: null },
  { to: "/admin/solicitudes-de-datos", label: "Solicitudes de datos", permission: "data.manage" },
  { to: "/admin/pqr", label: "PQR", permission: "pqr.manage" },
  { to: "/admin/aprobaciones", label: "Aprobaciones", permission: "approvals.manage" },
  { to: "/admin/reportes", label: "Reportes", permission: "reports.read" },
  { to: "/admin/auditoria", label: "Auditoría", permission: "audit.read" },
  { to: "/admin/usuarios", label: "Usuarios", permission: "users.read" },
];

/**
 * Administrative platform shell (/admin/*). This is the widest nav of the
 * three authenticated portals, always lazy-loaded (see routes/router.tsx)
 * since it's never needed on first paint of the public site.
 *
 * US-060: the outer RoleRoute (router.tsx) gates who reaches /admin/* at
 * all; this component additionally hides nav items the current user lacks
 * permission for (AC1's "render only the navigation sections the current
 * user's permissions allow"). Hiding the nav item is a UX nicety only -
 * direct navigation to a hidden section is independently blocked by that
 * section's own PermissionRoute, which renders ForbiddenPage, per AC1's
 * explicit "not just a hidden nav item" requirement.
 */
export function AdminLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef);
  const { hasPermission } = useAuth();
  const visibleNavItems = NAV_ITEMS.filter((item) => item.permission === null || hasPermission(item.permission));

  return (
    <div className="flex min-h-screen flex-col bg-bg-base sm:flex-row">
      <SkipToContent targetId="main-content" />
      <aside className="border-b border-border-soft bg-white sm:w-60 sm:shrink-0 sm:overflow-y-auto sm:border-b-0 sm:border-r">
        <div className="px-5 py-5">
          <Link to="/" className="font-display text-base font-semibold text-brand-dark">
            {ASODEF_COMPANY.legalName}
          </Link>
          <p className="mt-0.5 text-xs text-text-muted">Panel administrativo</p>
        </div>
        <nav aria-label="Administración">
          <ul className="flex flex-col gap-1 px-3 pb-5 text-sm">
            {visibleNavItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `block rounded-xl px-3 py-2 transition-colors ${
                      isActive ? "bg-brand-dark/10 font-medium text-brand-dark" : "text-text-main hover:bg-bg-soft"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-border-soft px-3 py-3">
          <LogoutButton className="w-full justify-center" />
        </div>
      </aside>

      <main id="main-content" ref={mainRef} tabIndex={-1} className="flex-1 px-5 py-8 focus:outline-none sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
