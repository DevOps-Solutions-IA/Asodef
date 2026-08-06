import { useRef } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { BrandLogo } from "./shared/BrandLogo";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";
import { LogoutButton } from "./shared/LogoutButton";

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
      <aside className="relative z-10 border-b border-border-soft bg-white shadow-e1 sm:w-64 sm:shrink-0 sm:border-b-0 sm:border-r">
        <div className="px-5 py-5">
          <Link to="/" aria-label={ASODEF_COMPANY.legalName}>
            <BrandLogo className="h-8 w-auto" />
          </Link>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-text-muted">Mi cuenta</p>
        </div>
        <nav aria-label="Cuenta">
          <ul className="flex flex-col gap-0.5 px-3 pb-5 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `relative block rounded-lg py-2 pl-4 pr-3 transition-colors duration-150 ${
                      isActive
                        ? "bg-brand-dark-50 font-semibold text-brand-dark before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-orange"
                        : "text-text-main hover:bg-bg-soft"
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
          <div className="mb-3 flex flex-col gap-1 px-2 text-xs text-text-muted">
            <Link to="/legal/condiciones-portal-afiliado" className="hover:text-brand-dark hover:underline">Condiciones del portal</Link>
            <Link to="/legal/politica-de-privacidad" className="hover:text-brand-dark hover:underline">Privacidad</Link>
          </div>
          <LogoutButton className="w-full justify-center" />
        </div>
      </aside>

      <main id="main-content" ref={mainRef} tabIndex={-1} className="flex-1 px-5 py-8 focus:outline-none sm:px-8 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
