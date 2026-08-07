import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AffiliateAccessInput, SelfServiceSessionController, SelfServiceSessionState } from "../../lib/self-service";
import { SelfServiceAccessGateway } from "./SelfServiceAccessGateway";

function controller(state: SelfServiceSessionState): SelfServiceSessionController<AffiliateAccessInput> {
  return { state, startLookup: vi.fn(async () => undefined), requestCode: vi.fn(async () => undefined), resendCode: vi.fn(async () => undefined), verifyCode: vi.fn(async () => false), refreshSession: vi.fn(async () => undefined), endSession: vi.fn(async () => undefined), reset: vi.fn() };
}

describe("SelfServiceAccessGateway", () => {
  it("uses holder/document identification and never asks for email or password", async () => {
    const session = controller({ status: "anonymous" });
    const user = userEvent.setup();
    render(<MemoryRouter><SelfServiceAccessGateway scope="affiliate" controller={session} makeInput={(identifier, options) => ({ identifier, identifierMode: options.identifierMode, documentType: options.documentType })} /></MemoryRouter>);

    expect(screen.getByRole("combobox", { name: "Identificarme con" })).toHaveValue("TITULAR_NUMBER");
    expect(screen.getByLabelText("Número de titular")).toBeInTheDocument();
    expect(screen.queryByLabelText(/correo/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Identificarme con" }), "DOCUMENT");
    expect(screen.getByRole("combobox", { name: "Tipo de documento" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Número de documento"), "1020.3040");
    await user.click(screen.getByRole("button", { name: "Consultar opciones de verificación" }));
    expect(session.startLookup).toHaveBeenCalledWith({ identifier: "1020.3040", identifierMode: "DOCUMENT", documentType: "CC" });
  });

  it("only sends an OTP to an enabled masked provider channel", async () => {
    const session = controller({ status: "challenge_required", providerReference: "provider", channels: [
      { id: "mail", kind: "email", maskedDestination: "m***@dominio.co", enabled: true, available: true, providerReference: "provider-mail" },
      { id: "sms", kind: "sms", maskedDestination: "***1234", enabled: false, available: true },
    ] });
    const user = userEvent.setup();
    render(<MemoryRouter><SelfServiceAccessGateway scope="affiliate" controller={session} makeInput={(identifier, options) => ({ identifier, identifierMode: options.identifierMode })} /></MemoryRouter>);
    expect(screen.getByText("m***@dominio.co")).toBeInTheDocument();
    expect(screen.queryByText("***1234")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /correo electrónico/i }));
    await user.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(session.requestCode).toHaveBeenCalledWith("mail");
  });
});
