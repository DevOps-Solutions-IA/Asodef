import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AffiliateSelfServiceContext, selfServiceApi, type SelfServiceSessionController, type AffiliateAccessInput } from "../../lib/self-service";
import { BeneficiaryChangeCreatePage, BeneficiaryChangeDetailPage } from "./BeneficiaryChangePages";

const session: SelfServiceSessionController<AffiliateAccessInput> = {
  state: { status: "verified", csrfToken: "csrf", scopes: ["affiliate:beneficiaries:request"] },
  startLookup: vi.fn(async () => undefined), requestCode: vi.fn(async () => undefined), resendCode: vi.fn(async () => undefined), verifyCode: vi.fn(async () => true), refreshSession: vi.fn(async () => undefined), endSession: vi.fn(async () => undefined), reset: vi.fn(),
};

function renderPage(element: React.ReactNode, path = "/mi-cuenta/beneficiarios/nueva-solicitud") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AffiliateSelfServiceContext.Provider value={session}><MemoryRouter initialEntries={[path]}><Routes><Route path="/mi-cuenta/beneficiarios/nueva-solicitud" element={element} /><Route path="/mi-cuenta/beneficiarios/solicitudes/:requestId" element={element} /></Routes></MemoryRouter></AffiliateSelfServiceContext.Provider></QueryClientProvider>);
}

afterEach(() => vi.restoreAllMocks());

describe("beneficiary change workflow", () => {
  it("keeps the form unavailable when provider rules are not configured", async () => {
    vi.spyOn(selfServiceApi, "getBeneficiaryRules").mockResolvedValue({ status: "not_configured", message: "Reglas no configuradas" });
    renderPage(<BeneficiaryChangeCreatePage />);
    expect(await screen.findByText("Integración no configurada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar borrador" })).not.toBeInTheDocument();
  });

  it("distinguishes provider approval from an applied beneficiary change", async () => {
    vi.spyOn(selfServiceApi, "getBeneficiaryChangeRequest").mockResolvedValue({ status: "success", data: { id: "request-1", operation: "ADD", status: "APPROVED" } });
    renderPage(<BeneficiaryChangeDetailPage />, "/mi-cuenta/beneficiarios/solicitudes/request-1");
    expect(await screen.findByText("Solicitud aprobada")).toBeInTheDocument();
    expect(screen.getByText(/no significa que el cambio ya fue aplicado/i)).toBeInTheDocument();
  });
});
