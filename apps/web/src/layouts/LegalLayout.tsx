import { useRef } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { LEGAL_CATALOG } from "../lib/legal/legal-catalog";
import { PublicHeader } from "./shared/PublicHeader";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";
import { useScrollToHash } from "./shared/useScrollToHash";

/** Public, content-focused legal center (/legal/*) with the canonical public
 * navigation plus a dedicated table of contents and reading-width column. */
export function LegalLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef, { preventScroll: true });
  useScrollToHash();

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-surface-canvas">
      <SkipToContent targetId="main-content" />
      <PublicHeader />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8 sm:py-10 lg:flex-row">
        <details className="rounded-2xl border border-brand-dark/10 bg-white/85 p-4 shadow-e1 backdrop-blur lg:hidden">
          <summary className="cursor-pointer font-display text-sm font-semibold text-brand-dark">Explorar documentos</summary>
          <nav aria-label="Documentos legales móviles" className="mt-3 max-h-72 overflow-y-auto">
            <ul className="flex flex-col gap-1 text-sm">
              {LEGAL_CATALOG.map((entry) => <li key={entry.slug}><NavLink to={`/legal/${entry.slug}`} className={({ isActive }) => `block rounded-lg px-3 py-2 ${isActive ? "bg-brand-dark-50 font-semibold text-brand-dark" : "text-text-main hover:bg-bg-soft"}`}>{entry.title}</NavLink></li>)}
            </ul>
          </nav>
        </details>

        <nav aria-label="Documentos legales" className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl3 border border-brand-dark/10 bg-white/72 p-4 shadow-e1 backdrop-blur-xl">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-text-muted">
            Centro legal
          </h2>
          <ul className="mt-3 flex flex-col gap-1 text-[13px]">
            {LEGAL_CATALOG.map((entry) => (
              <li key={entry.slug}>
                <NavLink
                  to={`/legal/${entry.slug}`}
                  className={({ isActive }) =>
                    `relative block rounded-lg py-1.5 pl-3.5 pr-3 transition-colors duration-150 ${
                      isActive
                        ? "bg-brand-dark-50 font-semibold text-brand-dark before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-orange"
                        : "text-text-main hover:bg-bg-soft"
                    }`
                  }
                >
                  {entry.title}
                </NavLink>
              </li>
            ))}
          </ul>
          </div>
        </nav>

        <main id="main-content" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <Outlet />
        </main>
      </div>

      <footer className="border-t border-border-soft bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-6 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© {new Date().getFullYear()} {ASODEF_COMPANY.legalName}</span>
          <span>Información legal oficial · Colombia</span>
        </div>
      </footer>
    </div>
  );
}
