import { useRef } from "react";
import { Link, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";
import { useScrollToHash } from "./shared/useScrollToHash";
import { WhatsAppFloatingButton } from "./shared/WhatsAppFloatingButton";

const NAV_LINKS = [
  { to: "/quienes-somos", label: "Quiénes somos" },
  { to: "/beneficios", label: "Beneficios" },
  { to: "/portafolio", label: "Portafolio" },
  { to: "/cobertura", label: "Cobertura" },
  { to: "/pagos", label: "Pagos" },
  { to: "/contacto", label: "Contacto" },
];

// US-018: verbatim from the approved acceptance criteria.
const WHATSAPP_NUMBER = "573232733927";

const LEGAL_LINKS = [
  { to: "/legal", label: "Centro legal" },
  { to: "/legal/terminos-y-condiciones", label: "Términos y condiciones" },
  { to: "/legal/politica-de-privacidad", label: "Política de privacidad" },
  { to: "/legal/politica-de-cookies", label: "Política de cookies" },
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
  useScrollToHash();

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
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 text-sm sm:px-8 md:grid-cols-3 lg:px-12">
          <div>
            <p className="font-display text-lg font-semibold">{ASODEF_COMPANY.legalName}</p>
            <p className="mt-1 text-white/70">{ASODEF_COMPANY.tagline}</p>
          </div>

          <nav aria-label="Pie de página">
            <p className="font-display text-sm font-semibold tracking-wide text-white/60">Navegación</p>
            <ul className="mt-3 flex flex-col gap-2">
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-white/80 hover:text-white hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="font-display text-sm font-semibold tracking-wide text-white/60">Contacto</p>
            <address className="mt-3 flex flex-col gap-1 not-italic text-white/80">
              <span>Juan Pablo Filigrana, Director Comercial</span>
              <span>WhatsApp 323 273 3927</span>
              <span>Cali, Colombia</span>
            </address>

            <ul className="mt-4 flex flex-col gap-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-white/60 hover:text-white hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <p className="mx-auto max-w-7xl px-5 py-6 text-sm text-white/50 sm:px-8 lg:px-12">
            © {new Date().getFullYear()} {ASODEF_COMPANY.legalName} Todos los derechos reservados.
          </p>
        </div>
      </footer>

      <WhatsAppFloatingButton
        phoneNumber={WHATSAPP_NUMBER}
        tooltip="Escríbenos por WhatsApp"
        ariaLabel="Contactar por WhatsApp (se abre en una pestaña nueva)"
      />
    </div>
  );
}
