import { BadRequestException } from "@nestjs/common";
import { SelfServicePortal } from "@prisma/client";
import { AffiliateSelfServiceController } from "./affiliate-self-service.controller";

describe("AffiliateSelfServiceController document boundary", () => {
  const principal = { sessionId: "session", portal: SelfServicePortal.AFFILIATE, subjectRef: "subject", scopes: ["affiliate:beneficiaries:request"], assurance: "OTP" as const, csrfTokenHash: "hash", expiresAt: new Date() };

  it("rejects unsupported multipart content before invoking the provider", () => {
    const mutate = jest.fn();
    const gateway = { assertScope: jest.fn(), mutate, core: { uploadAffiliateBeneficiaryChangeDocument: jest.fn() } };
    const controller = new AffiliateSelfServiceController({} as never, {} as never, {} as never, gateway as never, {} as never);
    const file = { mimetype: "text/html", size: 20, originalname: "evidence.html", buffer: Buffer.from("unsafe") } as Express.Multer.File;
    expect(() => controller.uploadDocument({ selfService: principal } as never, "request-1", { documentType: "identity" }, file, "idempotency-key-123")).toThrow(BadRequestException);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("passes validated multipart bytes only to the configured provider contract", async () => {
    const providerResult = { status: "NOT_CONFIGURED", error: { code: "EXTERNAL_CORE_NOT_CONFIGURED", message: "No configurado", retryable: false } };
    const provider = jest.fn(async () => providerResult);
    const gateway = {
      assertScope: jest.fn(),
      mutate: jest.fn(async (_principal, _operation, _key, _payload, action: () => Promise<unknown>) => action()),
      core: { uploadAffiliateBeneficiaryChangeDocument: provider },
    };
    const controller = new AffiliateSelfServiceController({} as never, {} as never, {} as never, gateway as never, {} as never);
    const file = { mimetype: "application/pdf", size: 4, originalname: "evidence.pdf", buffer: Buffer.from("test") } as Express.Multer.File;
    await expect(controller.uploadDocument({ selfService: principal } as never, "request-1", { documentType: "identity" }, file, "idempotency-key-123")).resolves.toEqual(providerResult);
    expect(provider).toHaveBeenCalledWith("subject", "request-1", expect.objectContaining({ documentType: "identity", mimeType: "application/pdf", buffer: file.buffer }), "idempotency-key-123");
  });
});
