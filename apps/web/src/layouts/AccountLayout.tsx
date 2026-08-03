import { useRef } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";

const NAV_ITEMS = [
  { to: "/mi-cuenta", label: "Resumen", end: true },
  { to: "/mi-cuenta/perfil", label: "Perfil" },
  { to: "/mi-cuenta/pagos", label: "Pagos" },
  { to: "/mi-cuenta/documentos", label: "Documentos" },
  { to: "/mi-cuenta/contratos", label: "Contratos" },
  { to: "/mi-cuenta/notificaciones", label: "Notificaciones" },
];

/** Customer self-service account shell (/mi-cuenta/*). Real authentication
 * and permission enforcement land in later stories - this establishes the
 * stable layout/nav structure those stories build inside. */
export function AccountLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef);

  return (
    <div className="flex min-h-screen flex-col bg-bg-base sm:flex-row">
      <SkipToContent targetId="main-content" />
      <aside className="border-b border-border-soft bg-white sm:w-64 sm:shrink-0 sm:border-b-0 sm:border-r">
        <div className="px-5 py-5">
          <Link to="/" className="font-display text-base font-semibold text-brand-dark">
            {ASODEF_COMPANY.legalName}
          </Link>
          <p className="mt-0.5 text-xs text-text-muted">Mi cuenta</p>
        </div>
        <nav aria-label="Cuenta">
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
      </aside>

      <main id="main-content" ref={mainRef} tabIndex={-1} className="flex-1 px-5 py-8 focus:outline-none sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
