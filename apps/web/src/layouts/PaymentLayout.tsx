import { useRef } from "react";
import { Link, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { BrandLogo } from "./shared/BrandLogo";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";

/**
 * Centro de Pagos: deliberately separated from the marketing site's
 * chrome per the master prompt - simpler, institutional, transactional.
 * No marketing nav; a minimal header communicating "this is the secure
 * payment area" plus a way back to the main site.
 */
export function PaymentLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-surface-canvas">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_75%_10%,rgba(251,152,58,0.13),transparent_32%),linear-gradient(135deg,rgba(22,24,51,0.07),transparent_58%)]" />
      <SkipToContent targetId="main-content" />
      <header className="relative z-10 border-b border-white/10 bg-brand-deep text-white shadow-e3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
          {/* icon-only: the wordmark is low-contrast on this dark
              header - see BrandLogo's own doc comment. */}
          <Link to="/" aria-label={ASODEF_COMPANY.legalName}>
            <BrandLogo variant="icon" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/" className="hidden items-center gap-1.5 text-xs font-medium text-white/70 transition-colors hover:text-white sm:inline-flex">
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Volver al sitio
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 shadow-inner-highlight backdrop-blur-sm">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-brand-light" />
              Entorno protegido
            </span>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="relative mx-auto w-full max-w-6xl flex-1 px-5 py-10 focus:outline-none sm:px-8 lg:px-10 lg:py-14"
      >
        <Outlet />
      </main>

      <footer className="relative border-t border-border-soft bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <span className="inline-flex items-center gap-2 text-text-muted"><LockKeyhole aria-hidden="true" className="h-4 w-4 text-brand-orange" /> Consulta y gestión transaccional ASODEF</span>
          <Link to="/legal" className="font-medium text-brand-dark hover:underline">Centro legal</Link>
        </div>
      </footer>
    </div>
  );
}
