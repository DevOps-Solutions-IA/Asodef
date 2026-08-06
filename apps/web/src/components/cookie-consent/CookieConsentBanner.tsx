import { Button } from "@asodef/ui";
import { useCookieConsent } from "../../lib/cookie-consent/cookie-consent-context";
import { CookiePreferencesDialog } from "./CookiePreferencesDialog";

/**
 * US-047: appears on first visit (no stored choice yet). None of the 3
 * optional categories are preselected by any action here - "Aceptar
 * todas" and "Rechazar opcionales" are explicit, equally-weighted
 * choices, not a pre-checked default nudging one over the other.
 *
 * Mounted at the app root, above the router (App.tsx) - deliberately
 * outside any layout, so it persists across every route including the
 * 404/error boundary. That means it has no Router context, so its own
 * link to the cookie policy is a plain <a> (full navigation), not
 * react-router's <Link>.
 */
export function CookieConsentBanner() {
  const { isBannerOpen, acceptAll, rejectOptional, openPreferences } = useCookieConsent();

  return (
    <>
      {isBannerOpen && (
        <div
          role="region"
          aria-label="Preferencias de cookies"
          className="fixed inset-x-3 bottom-3 z-40 rounded-xl3 border border-brand-dark/10 bg-white/94 px-4 py-4 shadow-e4 backdrop-blur-xl sm:inset-x-5 sm:px-5"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="max-w-3xl text-xs leading-5 text-text-main sm:text-sm">
              Usamos cookies estrictamente necesarias para el funcionamiento del sitio, y cookies opcionales de
              preferencias, analíticas y marketing solo con tu autorización. Consulta la{" "}
              <a href="/legal/politica-de-cookies" className="font-medium text-brand-dark hover:underline">
                Política de cookies
              </a>
              .
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={openPreferences}>
                Personalizar
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={rejectOptional}>
                Rechazar opcionales
              </Button>
              <Button type="button" size="sm" onClick={acceptAll}>
                Aceptar todas
              </Button>
            </div>
          </div>
        </div>
      )}

      <CookiePreferencesDialog />
    </>
  );
}
