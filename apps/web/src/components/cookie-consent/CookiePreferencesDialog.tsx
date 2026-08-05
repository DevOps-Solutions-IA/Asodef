import { useEffect, useState } from "react";
import { Button, Checkbox, Dialog } from "@asodef/ui";
import { useCookieConsent } from "../../lib/cookie-consent/cookie-consent-context";
import type { CookieConsentChoices } from "../../lib/cookie-consent/cookie-consent-types";

const DEFAULT_CHOICES: CookieConsentChoices = { preferences: false, analytics: false, marketing: false };

/**
 * US-047: the same "Personalizar" panel reopens from the first-visit
 * banner and from the footer's "Preferencias de cookies" link -
 * pre-filled with the current stored choice when one exists, or all
 * optional categories unchecked (never preselected) on a first visit.
 */
export function CookiePreferencesDialog() {
  const { consent, isPreferencesOpen, closePreferences, savePreferences } = useCookieConsent();
  const [draft, setDraft] = useState<CookieConsentChoices>(consent ?? DEFAULT_CHOICES);

  useEffect(() => {
    if (isPreferencesOpen) {
      setDraft(consent ?? DEFAULT_CHOICES);
    }
  }, [isPreferencesOpen, consent]);

  return (
    <Dialog
      open={isPreferencesOpen}
      onClose={closePreferences}
      title="Preferencias de cookies"
      description="Elige qué categorías de cookies no esenciales quieres permitir. Puedes cambiar tu elección en cualquier momento."
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-border-soft p-4">
          <div>
            <p className="font-medium text-text-main">Estrictamente necesarias</p>
            <p className="mt-1 text-sm text-text-muted">
              Indispensables para el funcionamiento del sitio. No se pueden desactivar.
            </p>
          </div>
          <Checkbox checked disabled aria-label="Cookies estrictamente necesarias (siempre activas)" />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-2xl border border-border-soft p-4">
          <div>
            <p className="font-medium text-text-main">Preferencias</p>
            <p className="mt-1 text-sm text-text-muted">Recuerdan tus opciones para personalizar tu experiencia.</p>
          </div>
          <Checkbox
            checked={draft.preferences}
            onChange={(e) => setDraft((prev) => ({ ...prev, preferences: e.target.checked }))}
            aria-label="Cookies de preferencias"
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-2xl border border-border-soft p-4">
          <div>
            <p className="font-medium text-text-main">Analíticas</p>
            <p className="mt-1 text-sm text-text-muted">Ayudan a entender cómo se usa el sitio para mejorarlo.</p>
          </div>
          <Checkbox
            checked={draft.analytics}
            onChange={(e) => setDraft((prev) => ({ ...prev, analytics: e.target.checked }))}
            aria-label="Cookies analíticas"
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-2xl border border-border-soft p-4">
          <div>
            <p className="font-medium text-text-main">Marketing</p>
            <p className="mt-1 text-sm text-text-muted">Usadas para mostrar contenido relevante en otros sitios.</p>
          </div>
          <Checkbox
            checked={draft.marketing}
            onChange={(e) => setDraft((prev) => ({ ...prev, marketing: e.target.checked }))}
            aria-label="Cookies de marketing"
          />
        </div>

        <Button type="button" onClick={() => savePreferences(draft)}>
          Guardar preferencias
        </Button>
      </div>
    </Dialog>
  );
}
