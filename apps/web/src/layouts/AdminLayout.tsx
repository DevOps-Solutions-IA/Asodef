import { useRef } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";
import { LogoutButton } from "./shared/LogoutButton";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/clientes", label: "Clientes" },
  { to: "/admin/afiliados", label: "Afiliados" },
  { to: "/admin/empresas", label: "Empresas" },
  { to: "/admin/aliados", label: "Aliados" },
  { to: "/admin/planes", label: "Planes" },
  { to: "/admin/pagos", label: "Pagos" },
  { to: "/admin/conciliacion", label: "Conciliación" },
  { to: "/admin/contratos", label: "Contratos" },
  { to: "/admin/legal", label: "Legal" },
  { to: "/admin/pqr", label: "PQR" },
  { to: "/admin/reportes", label: "Reportes" },
  { to: "/admin/auditoria", label: "Auditoría" },
  { to: "/admin/usuarios", label: "Usuarios" },
  { to: "/admin/configuracion", label: "Configuración" },
];

/**
 * Administrative platform shell (/admin/*). This is the widest nav of the
 * three authenticated portals (matches the master prompt's full admin
 * navigation), always lazy-loaded (see routes/router.tsx) since it's
 * never needed on first paint of the public site. Real RBAC-driven
 * nav filtering and route guarding land in a later story (US-060); today
 * every item renders, unguarded.
 */
export function AdminLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef);

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
            {NAV_ITEMS.map((item) => (
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
