import { useRef } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";

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
      <aside className="border-b border-border-soft bg-brand-deep text-white sm:w-64 sm:shrink-0 sm:border-b-0">
        <div className="px-5 py-5">
          <Link to="/" className="font-display text-base font-semibold">
            {ASODEF_COMPANY.legalName}
          </Link>
          <p className="mt-0.5 text-xs text-white/60">Portal de empresas</p>
        </div>
        <nav aria-label="Empresa">
          <ul className="flex flex-col gap-1 px-3 pb-5 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `block rounded-xl px-3 py-2 transition-colors ${
                      isActive ? "bg-white/15 font-medium text-white" : "text-white/70 hover:bg-white/10"
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
