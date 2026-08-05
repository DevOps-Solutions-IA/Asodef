import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LegalDocumentPage } from "./LegalDocumentPage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderLegalDocumentPage(fetchMock: ReturnType<typeof vi.fn>, props = { slug: "terminos-y-condiciones", title: "Términos y condiciones" }) {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LegalDocumentPage {...props} />
    </QueryClientProvider>,
  );
}

describe("LegalDocumentPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Example (AC): renders the published document's sections when found", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(200, {
        slug: "terminos-y-condiciones",
        type: "terms_and_conditions",
        title: "Términos y condiciones",
        version: 1,
        content: { sections: [{ heading: "Identificación de la empresa", body: "ASODEF S.A.S." }] },
        effectiveDate: "2026-08-01T00:00:00.000Z",
        publicationDate: "2026-08-01T00:00:00.000Z",
      }),
    );
    renderLegalDocumentPage(fetchMock);

    expect(await screen.findByRole("heading", { level: 1, name: "Términos y condiciones" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Identificación de la empresa" })).toBeInTheDocument();
    expect(screen.getByText("ASODEF S.A.S.")).toBeInTheDocument();
  });

  it("Negative case (AC): shows an 'Aún no publicado' state, not an error or blank page, for a 404", async () => {
    const fetchMock = vi.fn(() => jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No encontrado." }));
    renderLegalDocumentPage(fetchMock);

    expect(await screen.findByRole("heading", { level: 1, name: "Términos y condiciones" })).toBeInTheDocument();
    expect(await screen.findByText("Aún no publicado")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("never renders a raw API error body for a server error", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "SQL error: relation does not exist" }),
    );
    renderLegalDocumentPage(fetchMock);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/SQL|relation/i);
  });
});
