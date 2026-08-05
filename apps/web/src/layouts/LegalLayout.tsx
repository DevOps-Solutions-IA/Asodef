import { useRef } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { LEGAL_CATALOG } from "../lib/legal/legal-catalog";
import { BrandLogo } from "./shared/BrandLogo";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";

/** Public, content-focused legal center (/legal/*) - a table-of-contents
 * sidebar plus a reading-width main column, distinct from every other
 * layout's chrome since this is long-form reading content, not a dashboard
 * or a marketing page. */
export function LegalLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef);

  return (
    <div className="flex min-h-screen flex-col bg-bg-base">
      <SkipToContent targetId="main-content" />
      <header className="border-b border-border-soft bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/" aria-label={ASODEF_COMPANY.legalName}>
            <BrandLogo className="h-8 w-auto" />
          </Link>
          <Link to="/" className="text-sm text-text-muted hover:text-brand-dark hover:underline">
            Volver al sitio
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-10 sm:flex-row sm:px-8">
        <nav aria-label="Documentos legales" className="sm:w-64 sm:shrink-0">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-text-muted">
            Centro legal
          </h2>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {LEGAL_CATALOG.map((entry) => (
              <li key={entry.slug}>
                <NavLink
                  to={`/legal/${entry.slug}`}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-1.5 transition-colors ${
                      isActive ? "bg-brand-dark/10 font-medium text-brand-dark" : "text-text-main hover:bg-bg-soft"
                    }`
                  }
                >
                  {entry.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main-content" ref={mainRef} tabIndex={-1} className="max-w-2xl flex-1 focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
