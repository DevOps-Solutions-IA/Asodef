import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { PublicLayout } from "./PublicLayout";
import { CookieConsentProvider } from "../lib/cookie-consent/CookieConsentContext";
import { CookieConsentBanner } from "../components/cookie-consent/CookieConsentBanner";

/** Skips the Drawer's own 200ms exit-transition delay (Drawer.tsx's
 * EXIT_TRANSITION_MS) so DOM-removal assertions resolve promptly
 * instead of needing a slow real-time wait - same helper pattern as
 * Hero.test.tsx. */
function mockPrefersReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderPublicLayout(initialEntries: string[] = ["/"]) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <PublicLayout />,
        children: [
          { index: true, element: <div>Contenido de la página</div> },
          { path: "beneficios", element: <div>Contenido de beneficios</div> },
        ],
      },
    ],
    { initialEntries },
  );
  return render(
    <CookieConsentProvider>
      <RouterProvider router={router} />
      <CookieConsentBanner />
    </CookieConsentProvider>,
  );
}

describe("PublicLayout", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    );
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders the footer's navigation links (US-018)", () => {
    renderPublicLayout();
    const footerNav = within(screen.getByRole("navigation", { name: "Pie de página" }));
    for (const label of ["Quiénes somos", "Beneficios", "Portafolio", "Cobertura", "Pagos", "Contacto"]) {
      expect(footerNav.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("renders the approved footer contact info verbatim", () => {
    renderPublicLayout();
    expect(screen.getByText("Juan Pablo Filigrana, Director Comercial")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp 323 273 3927")).toBeInTheDocument();
    expect(screen.getByText("Cali, Colombia")).toBeInTheDocument();
  });

  it("renders legal placeholder links pointing to real, existing routes", () => {
    renderPublicLayout();
    // Scoped to the footer - the first-visit cookie banner (rendered by
    // default here, since no consent is stored) also links to the same
    // "Política de cookies" page in its disclosure text, and would
    // otherwise collide on accessible name with the footer's own link.
    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "Centro legal" })).toHaveAttribute("href", "/legal");
    expect(footer.getByRole("link", { name: "Términos y condiciones" })).toHaveAttribute(
      "href",
      "/legal/terminos-y-condiciones",
    );
    expect(footer.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute(
      "href",
      "/legal/politica-de-privacidad",
    );
    expect(footer.getByRole("link", { name: "Política de cookies" })).toHaveAttribute(
      "href",
      "/legal/politica-de-cookies",
    );
  });

  it("US-047: the footer's 'Preferencias de cookies' control reopens the cookie preferences dialog", async () => {
    const user = userEvent.setup();
    renderPublicLayout();

    // The first-visit banner's own "Personalizar" already opens it -
    // dismiss that path first so this test exercises the footer control
    // specifically.
    await user.click(screen.getByRole("button", { name: "Rechazar opcionales" }));
    expect(screen.queryByRole("dialog", { name: "Preferencias de cookies" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preferencias de cookies" }));
    expect(screen.getByRole("dialog", { name: "Preferencias de cookies" })).toBeInTheDocument();
  });

  it("renders the dynamic copyright year", () => {
    renderPublicLayout();
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()}`))).toBeInTheDocument();
  });

  it("renders the floating WhatsApp button site-wide, not homepage-only", () => {
    renderPublicLayout();
    const link = screen.getByRole("link", { name: "Contactar por WhatsApp (se abre en una pestaña nueva)" });
    expect(link).toHaveAttribute("href", "https://wa.me/573232733927");
  });

  describe("mobile drawer (US-011/US-033)", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("is not present until the hamburger button is activated", () => {
      renderPublicLayout();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens and lists every nav item plus a WhatsApp contact link", async () => {
      const user = userEvent.setup();
      renderPublicLayout();

      await user.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));

      const dialog = await screen.findByRole("dialog");
      const dialogScope = within(dialog);
      for (const label of ["Inicio", "Quiénes somos", "Beneficios", "Portafolio", "Cobertura", "Pagos", "Contacto"]) {
        expect(dialogScope.getByRole("link", { name: label })).toBeInTheDocument();
      }
      expect(dialogScope.getByRole("link", { name: "Escríbenos por WhatsApp" })).toHaveAttribute(
        "href",
        "https://wa.me/573232733927",
      );
    });

    it("Example (AC): pressing Escape while open removes the drawer from the DOM and returns focus to the hamburger button", async () => {
      const user = userEvent.setup();
      renderPublicLayout();

      const hamburger = screen.getByRole("button", { name: "Abrir menú de navegación" });
      await user.click(hamburger);
      await screen.findByRole("dialog");

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(hamburger).toHaveFocus();
    });

    it("closes when a nav link inside it is activated (route selection)", async () => {
      mockPrefersReducedMotion(true); // skip Drawer's 200ms exit transition
      const user = userEvent.setup();
      renderPublicLayout();

      await user.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));
      const dialog = await screen.findByRole("dialog");

      await user.click(within(dialog).getByRole("link", { name: "Beneficios" }));

      expect(await screen.findByText("Contenido de beneficios")).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("Negative case (AC): opening the drawer moves focus inside it, off whatever triggered it", async () => {
      // Full native Tab-cycle containment (the real mechanism behind
      // the AC's "focus trap holds") comes from the browser's own
      // <dialog>.showModal() top-layer/inert semantics, which jsdom
      // does not implement (verified empirically - Tab events in this
      // environment do not respect it, unlike a real browser). Neither
      // of this project's own Dialog.test.tsx/Drawer.test.tsx attempt
      // that assertion either, for the same reason. What *is*
      // meaningfully testable here - and is the actual entry condition
      // for a trap to do anything - is that opening the drawer moves
      // focus into it rather than leaving it on the page behind.
      const user = userEvent.setup();
      renderPublicLayout();

      const hamburger = screen.getByRole("button", { name: "Abrir menú de navegación" });
      await user.click(hamburger);
      const dialog = await screen.findByRole("dialog");

      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      expect(hamburger).not.toHaveFocus();
    });
  });
});
