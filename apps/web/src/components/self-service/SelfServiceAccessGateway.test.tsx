import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AffiliateAccessInput, CompanyAccessInput, SelfServiceSessionController, SelfServiceSessionState } from "../../lib/self-service";
import { SelfServiceAccessGateway } from "./SelfServiceAccessGateway";

function controller<LookupInput = AffiliateAccessInput>(state: SelfServiceSessionState): SelfServiceSessionController<LookupInput> {
  return { state, startLookup: vi.fn(async () => undefined), requestCode: vi.fn(async () => undefined), resendCode: vi.fn(async () => undefined), verifyCode: vi.fn(async () => false), refreshSession: vi.fn(async () => undefined), endSession: vi.fn(async () => undefined), reset: vi.fn() };
}

describe("SelfServiceAccessGateway", () => {
  it("shows only the holder document and maps it to the existing document lookup contract", async () => {
    const session = controller({ status: "anonymous" });
    const user = userEvent.setup();
    render(<MemoryRouter><SelfServiceAccessGateway scope="affiliate" controller={session} makeInput={(identifier) => ({ identifier, identifierMode: "DOCUMENT" as const, documentType: "CC" as const })} /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Acceso de afiliados" })).toBeInTheDocument();
    expect(screen.getByText("Ingresa el número de documento del titular para validar tu acceso de forma segura.")).toBeInTheDocument();
    const documentInput=screen.getByLabelText("Número de documento del titular");
    expect(documentInput).toHaveAttribute("placeholder", "Ingresa el número de documento");
    expect(documentInput).toBeRequired();
    expect(documentInput).toHaveAttribute("inputmode", "numeric");
    expect(screen.queryByText("Identificarme con")).not.toBeInTheDocument();
    expect(screen.queryByText("Número de titular")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/correo/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();

    await user.type(documentInput, "1020.3040");
    const submit=screen.getByRole("button", { name: "Verificar" });
    expect(submit).toHaveClass("min-h-12");
    await user.click(submit);
    expect(session.startLookup).toHaveBeenCalledWith({ identifier: "1020.3040", identifierMode: "DOCUMENT", documentType: "CC" });
  });

  it("shows only the registered NIT for company access", async () => {
    const session = controller<CompanyAccessInput>({ status: "anonymous" });
    const user = userEvent.setup();
    render(<MemoryRouter><SelfServiceAccessGateway scope="company" controller={session} makeInput={(nit) => ({ nit })} /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Acceso de empresas" })).toBeInTheDocument();
    expect(screen.getByText("Ingresa el NIT registrado para validar el acceso de la empresa de forma segura.")).toBeInTheDocument();
    expect(screen.getByLabelText("NIT de la empresa")).toHaveAttribute("placeholder", "Ingresa el NIT");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("NIT de la empresa"), "900.123.456-7");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(session.startLookup).toHaveBeenCalledWith({ nit: "900.123.456-7" });
  });

  it("translates provider availability failures into user-facing language", () => {
    const session = controller({ status: "provider_unavailable", message: "EXTERNAL_CORE_NOT_CONFIGURED" });
    render(<MemoryRouter><SelfServiceAccessGateway scope="affiliate" controller={session} makeInput={(identifier) => ({ identifier, identifierMode: "DOCUMENT" as const, documentType: "CC" as const })} /></MemoryRouter>);
    expect(screen.getByText("El servicio de verificación no está disponible en este momento. Intenta nuevamente más tarde.")).toBeInTheDocument();
    expect(screen.queryByText("EXTERNAL_CORE_NOT_CONFIGURED")).not.toBeInTheDocument();
  });

  it("only sends an OTP to an enabled masked provider channel", async () => {
    const session = controller({ status: "challenge_required", providerReference: "provider", channels: [
      { id: "mail", kind: "email", maskedDestination: "m***@dominio.co", enabled: true, available: true, providerReference: "provider-mail" },
      { id: "sms", kind: "sms", maskedDestination: "***1234", enabled: false, available: true },
    ] });
    const user = userEvent.setup();
    render(<MemoryRouter><SelfServiceAccessGateway scope="affiliate" controller={session} makeInput={(identifier) => ({ identifier, identifierMode: "DOCUMENT" as const, documentType: "CC" as const })} /></MemoryRouter>);
    expect(screen.getByText("m***@dominio.co")).toBeInTheDocument();
    expect(screen.queryByText("***1234")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /correo electrónico/i }));
    await user.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(session.requestCode).toHaveBeenCalledWith("mail");
  });
});
