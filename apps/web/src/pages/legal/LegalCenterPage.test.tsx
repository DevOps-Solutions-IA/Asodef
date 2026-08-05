import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { LEGAL_CATALOG } from "../../lib/legal/legal-catalog";
import { LegalCenterPage } from "./LegalCenterPage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderLegalCenterPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LegalCenterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LegalCenterPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Negative case (AC): before any document is published, all 12 categories render in 'Aún no publicado' state without erroring", async () => {
    const fetchMock = vi.fn(() => jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No encontrado." }));
    renderLegalCenterPage(fetchMock);

    for (const entry of LEGAL_CATALOG) {
      expect(await screen.findByRole("link", { name: new RegExp(entry.title) })).toBeInTheDocument();
    }
    expect(await screen.findAllByText("Aún no publicado")).toHaveLength(LEGAL_CATALOG.length);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Example (AC): a published document shows a Publicado badge instead", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/legal-documents/terminos-y-condiciones")) {
        return jsonResponse(200, {
          slug: "terminos-y-condiciones",
          type: "terms_and_conditions",
          title: "Términos y condiciones",
          version: 1,
          content: { sections: [{ heading: "Identificación de la empresa", body: "ASODEF S.A.S." }] },
          effectiveDate: null,
          publicationDate: "2026-08-01T00:00:00.000Z",
        });
      }
      return jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No encontrado." });
    });
    renderLegalCenterPage(fetchMock);

    const row = await screen.findByRole("link", { name: /Términos y condiciones/ });
    expect(await screen.findByText("Publicado")).toBeInTheDocument();
    expect(row).toHaveAttribute("href", "/legal/terminos-y-condiciones");
  });

  it("filters the list by title via the search input", async () => {
    const fetchMock = vi.fn(() => jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No encontrado." }));
    const user = userEvent.setup();
    renderLegalCenterPage(fetchMock);

    await screen.findByRole("link", { name: /PQR/ });
    await user.type(screen.getByLabelText("Buscar documento legal"), "cookies");

    expect(screen.getByRole("link", { name: /Política de cookies/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^PQR/ })).not.toBeInTheDocument();
  });
});
