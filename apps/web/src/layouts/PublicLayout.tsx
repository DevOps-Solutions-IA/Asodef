import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { Drawer, IconButton } from "@asodef/ui";
import { Menu } from "lucide-react";
import { useCookieConsent } from "../lib/cookie-consent/cookie-consent-context";
import { BrandLogo } from "./shared/BrandLogo";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";
import { useScrollToHash } from "./shared/useScrollToHash";
import { WhatsAppFloatingButton } from "./shared/WhatsAppFloatingButton";

/**
 * US-011's own AC also names "Cifras" (linking to the statistics
 * section) - now restored: US-014 was reopened via a corporate-data
 * update once real, sourced figures became available, so the section
 * it points to (#cifras, StatisticsSection on the homepage) is real,
 * not empty/nonexistent.
 *
 * Public-frontend correction: "Quiénes somos"/"Beneficios"/"Portafolio"/
 * "Cobertura"/"Contacto" now use the same /#anchor pattern as "Cifras",
 * not a separate route - each of these already has a real, fully-built
 * section on HomePage with a matching id (AboutSection/CompanyBenefits/
 * BenefitPortfolio/CoverageSection/ContactSection). They were
 * incorrectly wired as separate route links, which resolved to
 * long-orphaned RoutePlaceholder stubs instead of the real content -
 * a nav-composition bug, not missing content. router.tsx now redirects
 * those bare paths back to these same anchors for direct visits/refreshes.
 */
const NAV_LINKS = [
  { to: "/", label: "Inicio" },
  { to: "/#quienes-somos", label: "Quiénes somos" },
  { to: "/#beneficios", label: "Beneficios" },
  { to: "/#portafolio", label: "Portafolio" },
  { to: "/#cifras", label: "Cifras" },
  { to: "/#cobertura", label: "Cobertura" },
  { to: "/pagos", label: "Pagos" },
  { to: "/#contacto", label: "Contacto" },
];

// US-018: verbatim from the approved acceptance criteria.
const WHATSAPP_NUMBER = "573232733927";

const LEGAL_LINKS = [
  { to: "/legal", label: "Centro legal" },
  { to: "/legal/terminos-y-condiciones", label: "Términos y condiciones" },
  { to: "/legal/politica-de-privacidad", label: "Política de privacidad" },
  { to: "/legal/politica-de-cookies", label: "Política de cookies" },
];

const NAV_LINK_CLASS =
  "relative pb-0.5 after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-brand-dark after:transition-all after:duration-200 hover:text-brand-dark hover:after:w-full";

/**
 * Public marketing site shell (US-011): header transitions from
 * transparent to a translucent scrolled state, desktop nav with
 * animated hover underlines, and a mobile drawer (reusing the shared
 * Drawer primitive - native <dialog>-based focus trap + Escape-close +
 * reduced-motion-aware transition "for free" - rather than a bespoke
 * AnimatePresence implementation, since the *observable* behavior the
 * AC actually tests is identical either way).
 */
export function PublicLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef);
  useScrollToHash();
  const { openPreferences: openCookiePreferences } = useCookieConsent();

  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close on route selection (AC, verbatim) - also covers browser
  // back/forward while the drawer happens to be open. Keyed on hash too:
  // "Quiénes somos"/"Beneficios"/"Portafolio"/"Cifras"/"Cobertura"/
  // "Contacto" are same-page /#anchor links (nav-composition fix), so
  // activating one from "/" changes only the hash, not the pathname.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.hash]);

  function closeDrawer() {
    setDrawerOpen(false);
    // Explicit, not left to the browser's own (inconsistent) dialog
    // focus-restore behavior - guarantees "closing returns focus to
    // the hamburger button" (AC, verbatim) regardless of how the
    // dialog was closed (Escape, backdrop click, or a nav link).
    hamburgerRef.current?.focus();
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-base">
      <SkipToContent targetId="main-content" />
      <header
        className={
          "sticky top-0 z-40 border-b transition-colors duration-200 " +
          (scrolled ? "border-border-soft bg-[#F4F5F1]/85 backdrop-blur-xl" : "border-transparent bg-transparent")
        }
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
          <Link to="/" aria-label={ASODEF_COMPANY.legalName}>
            <BrandLogo className="h-9 w-auto sm:h-10" />
          </Link>

          <nav aria-label="Principal" className="hidden sm:block">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-main">
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className={NAV_LINK_CLASS}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <IconButton
            ref={hamburgerRef}
            aria-label="Abrir menú de navegación"
            icon={<Menu className="h-5 w-5" />}
            className="sm:hidden"
            onClick={() => setDrawerOpen(true)}
          />
        </div>
      </header>

      <Drawer open={drawerOpen} onClose={closeDrawer} title="Menú" side="right">
        <BrandLogo className="mb-4 h-8 w-auto" />
        <nav aria-label="Principal (móvil)">
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="block rounded-xl px-3 py-2.5 text-base font-medium text-text-main hover:bg-bg-soft hover:text-brand-dark"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block rounded-xl px-3 py-2.5 text-base font-medium text-brand-dark hover:bg-bg-soft"
        >
          Escríbenos por WhatsApp
        </a>
      </Drawer>

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
            {/* The interim logo asset has a flat white background (no
                alpha - see BrandLogo's own doc comment), so it needs a
                light backdrop of its own against this dark footer rather
                than a color filter, which would misrender it. */}
            <div className="inline-block rounded-lg bg-white px-3 py-2">
              {/* "full" variant already includes the tagline baked into
                  the image - no separate <p> needed alongside it. */}
              <BrandLogo variant="full" className="h-14 w-auto" />
            </div>
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
              <li>
                <button
                  type="button"
                  onClick={openCookiePreferences}
                  className="text-white/60 hover:text-white hover:underline"
                >
                  Preferencias de cookies
                </button>
              </li>
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
