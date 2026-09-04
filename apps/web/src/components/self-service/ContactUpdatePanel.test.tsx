import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  startContactUpdate: vi.fn(),
  requestContactUpdateCode: vi.fn(),
  verifyContactUpdate: vi.fn(),
  getContactUpdateStatus: vi.fn(),
}));

vi.mock("../../lib/self-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/self-service")>();
  return {
    ...original,
    selfServiceApi: api,
    useAffiliateSelfService: () => ({ state: { status: "verified", csrfToken: "csrf", scopes: ["affiliate:contact:manage", "affiliate:profile:update"] } }),
  };
});

import { ContactUpdatePanel } from "./ContactUpdatePanel";

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ContactUpdatePanel /></QueryClientProvider>);
}

describe("ContactUpdatePanel", () => {
  it("verifies the new destination and waits for provider confirmation before saying applied", async () => {
    api.startContactUpdate.mockResolvedValue({ status: "success", data: { requestId: "request-1", status: "DRAFT", maskedDestination: "n***@dominio.com" } });
    api.requestContactUpdateCode.mockResolvedValue({ status: "success", data: { requestId: "request-1", status: "CHALLENGE_PENDING", maskedDestination: "n***@dominio.com" } });
    api.verifyContactUpdate.mockResolvedValue({ status: "success", data: { requestId: "request-1", status: "SUBMITTED" } });
    api.getContactUpdateStatus.mockResolvedValue({ status: "success", data: { requestId: "request-1", status: "APPLIED" } });
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("Nuevo destino"), "nuevo@dominio.com");
    await user.click(screen.getByRole("button", { name: "Verificar nuevo dato" }));
    expect(await screen.findByText(/código de seis dígitos enviado/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Código de verificación"), "123456");
    await user.click(screen.getByRole("button", { name: "Confirmar nuevo dato" }));
    expect(await screen.findByText(/permanece pendiente de confirmación/i)).toBeInTheDocument();
    expect(screen.queryByText("El proveedor confirmó la actualización.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Consultar estado" }));
    expect(await screen.findByText("El proveedor confirmó la actualización.")).toBeInTheDocument();
  });
});
