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
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border-soft bg-white px-5 py-5 shadow-[0_-8px_30px_rgba(6,40,30,0.1)] sm:px-8"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-main">
              Usamos cookies estrictamente necesarias para el funcionamiento del sitio, y cookies opcionales de
              preferencias, analíticas y marketing solo con tu autorización. Consulta la{" "}
              <a href="/legal/politica-de-cookies" className="font-medium text-brand-dark hover:underline">
                Política de cookies
              </a>
              .
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={openPreferences}>
                Personalizar
              </Button>
              <Button type="button" variant="secondary" onClick={rejectOptional}>
                Rechazar opcionales
              </Button>
              <Button type="button" onClick={acceptAll}>
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
