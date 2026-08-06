import { useRef } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { BrandLogo } from "./shared/BrandLogo";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";
import { LogoutButton } from "./shared/LogoutButton";

const NAV_ITEMS = [
  { to: "/empresa", label: "Panel", end: true },
  { to: "/empresa/dashboard", label: "Dashboard" },
  { to: "/empresa/beneficios", label: "Beneficios" },
  { to: "/empresa/contratos", label: "Contratos" },
  { to: "/empresa/reportes", label: "Reportes" },
];

/** Business-partner self-service portal (/empresa/*). Distinct accent
 * (brand-green) from AccountLayout/AdminLayout so the three authenticated
 * areas remain visually distinguishable, not one reused shell. */
export function CompanyLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef);

  return (
    <div className="flex min-h-screen flex-col bg-bg-base sm:flex-row">
      <SkipToContent targetId="main-content" />
      <aside className="relative z-10 border-b border-border-soft bg-brand-deep text-white shadow-e2 sm:w-64 sm:shrink-0 sm:border-b-0">
        <div className="px-5 py-5">
          {/* icon-only: the wordmark is low-contrast on this dark
              sidebar - see BrandLogo's own doc comment. */}
          <Link to="/" aria-label={ASODEF_COMPANY.legalName}>
            <BrandLogo variant="icon" className="h-9 w-auto" />
          </Link>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-white/60">Portal de empresas</p>
        </div>
        <nav aria-label="Empresa">
          <ul className="flex flex-col gap-0.5 px-3 pb-5 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `relative block rounded-lg py-2 pl-4 pr-3 transition-colors duration-150 ${
                      isActive
                        ? "bg-white/10 font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-orange"
                        : "text-white/70 hover:bg-white/5"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-white/10 px-3 py-3">
          <div className="mb-3 flex flex-col gap-1 px-2 text-xs text-white/65">
            <Link to="/legal/condiciones-portal-empresarial" className="hover:text-white hover:underline">Condiciones del portal</Link>
            <Link to="/legal/tratamiento-de-datos" className="hover:text-white hover:underline">Tratamiento de datos</Link>
            <Link to="/legal/politica-comunicaciones-electronicas" className="hover:text-white hover:underline">Comunicaciones</Link>
          </div>
          <LogoutButton className="w-full justify-center text-white/70 hover:bg-white/10 hover:text-white" />
        </div>
      </aside>

      <main id="main-content" ref={mainRef} tabIndex={-1} className="flex-1 px-5 py-8 focus:outline-none sm:px-8 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
