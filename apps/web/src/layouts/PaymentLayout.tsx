import { useRef } from "react";
import { Link, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { ShieldCheck } from "lucide-react";
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
    <div className="flex min-h-screen flex-col bg-bg-soft">
      <SkipToContent targetId="main-content" />
      <header className="bg-brand-deep text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          {/* icon-only: the wordmark is low-contrast on this dark
              header - see BrandLogo's own doc comment. */}
          <Link to="/" aria-label={ASODEF_COMPANY.legalName}>
            <BrandLogo variant="icon" className="h-9 w-auto" />
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Centro de Pagos seguro
          </span>
        </div>
      </header>

      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 focus:outline-none sm:px-8"
      >
        <Outlet />
      </main>

      <footer className="border-t border-border-soft bg-white">
        <div className="mx-auto max-w-4xl px-5 py-4 text-sm sm:px-8">
          <Link to="/legal" className="font-medium text-brand-dark hover:underline">
            Centro legal
          </Link>
        </div>
      </footer>
    </div>
  );
}
