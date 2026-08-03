import { useRef } from "react";
import { Link, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";

const NAV_LINKS = [
  { to: "/quienes-somos", label: "Quiénes somos" },
  { to: "/beneficios", label: "Beneficios" },
  { to: "/portafolio", label: "Portafolio" },
  { to: "/cobertura", label: "Cobertura" },
  { to: "/pagos", label: "Pagos" },
  { to: "/contacto", label: "Contacto" },
];

/**
 * Public marketing site shell. The real polished Navbar (glass, scroll
 * behavior, mobile drawer) is US-011's job - this is the structural
 * scaffold: header/nav placement, main landmark, footer, skip link, and
 * route-change focus management, all real and functional today.
 */
export function PublicLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef);

  return (
    <div className="flex min-h-screen flex-col bg-bg-base">
      <SkipToContent targetId="main-content" />
      <header className="border-b border-border-soft bg-bg-base">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
          <Link to="/" className="font-display text-lg font-semibold text-brand-dark">
            {ASODEF_COMPANY.legalName}
          </Link>
          <nav aria-label="Principal">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-main">
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="hover:text-brand-dark hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-5 focus:outline-none sm:px-8 lg:px-12"
      >
        <Outlet />
      </main>

      <footer className="border-t border-border-soft bg-brand-deep text-white">
        <div className="mx-auto max-w-7xl px-5 py-10 text-sm sm:px-8 lg:px-12">
          <p className="font-display text-lg font-semibold">{ASODEF_COMPANY.legalName}</p>
          <p className="mt-1 text-white/70">{ASODEF_COMPANY.tagline}</p>
          <p className="mt-6 text-white/50">
            © {new Date().getFullYear()} {ASODEF_COMPANY.legalName} Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
