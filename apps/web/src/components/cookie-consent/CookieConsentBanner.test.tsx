import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CookieConsentProvider } from "../../lib/cookie-consent/CookieConsentContext";
import { getStoredCookieConsent, setStoredCookieConsent } from "../../lib/cookie-consent/cookie-consent-storage";
import { CookieConsentBanner } from "./CookieConsentBanner";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

/** Deliberately no Router wrapper - CookieConsentBanner is mounted
 * outside the router in App.tsx (see its own doc comment) and must
 * never depend on Router context. */
function renderBanner() {
  return render(
    <CookieConsentProvider>
      <CookieConsentBanner />
    </CookieConsentProvider>,
  );
}

describe("CookieConsentBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(204, undefined)));
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("appears on first visit with none of the optional categories preselected", async () => {
    renderBanner();

    expect(screen.getByRole("region", { name: "Preferencias de cookies" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceptar todas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rechazar opcionales" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Personalizar" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Personalizar" }));

    expect(screen.getByRole("checkbox", { name: "Cookies estrictamente necesarias (siempre activas)" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Cookies estrictamente necesarias (siempre activas)" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Cookies de preferencias" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Cookies analíticas" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Cookies de marketing" })).not.toBeChecked();
  });

  it("does not appear when a decision was already stored", () => {
    setStoredCookieConsent({ preferences: true, analytics: true, marketing: true, method: "accept_all", decidedAt: new Date().toISOString() });

    renderBanner();

    expect(screen.queryByRole("region", { name: "Preferencias de cookies" })).not.toBeInTheDocument();
  });

  it("Example (AC): 'Aceptar todas' persists GRANTED for every optional category and closes the banner", async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByRole("button", { name: "Aceptar todas" }));

    expect(screen.queryByRole("region", { name: "Preferencias de cookies" })).not.toBeInTheDocument();
    expect(getStoredCookieConsent()).toMatchObject({ preferences: true, analytics: true, marketing: true, method: "accept_all" });
  });

  it("Negative case (AC): 'Rechazar opcionales' persists DENIED (false) for every optional category", async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByRole("button", { name: "Rechazar opcionales" }));

    expect(getStoredCookieConsent()).toMatchObject({ preferences: false, analytics: false, marketing: false, method: "reject_optional" });
  });

  it("'Personalizar' saves only the categories the visitor checked", async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByRole("button", { name: "Personalizar" }));
    await user.click(screen.getByRole("checkbox", { name: "Cookies analíticas" }));
    await user.click(screen.getByRole("button", { name: "Guardar preferencias" }));

    expect(getStoredCookieConsent()).toMatchObject({ preferences: false, analytics: true, marketing: false, method: "customize" });
  });

  it("never blocks the visitor's choice when the backend call fails (e.g. no published cookie policy yet)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(400, { statusCode: 400, error: "Bad Request", message: "No hay política publicada." })));
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByRole("button", { name: "Aceptar todas" }));

    expect(screen.queryByRole("region", { name: "Preferencias de cookies" })).not.toBeInTheDocument();
    expect(getStoredCookieConsent()).toMatchObject({ preferences: true, analytics: true, marketing: true });
  });
});
