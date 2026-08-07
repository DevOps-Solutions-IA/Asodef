import { SelfServiceContactUpdateStatus, SelfServicePortal } from "@prisma/client";
import { SelfServiceContactUpdateService } from "./self-service-contact-update.service";

describe("SelfServiceContactUpdateService", () => {
  const context = { ipAddress: "127.0.0.1", userAgent: "browser", requestId: "request" };
  const principal = {
    sessionId: "session-1",
    portal: SelfServicePortal.AFFILIATE,
    subjectRef: "affiliate-1",
    scopes: ["affiliate:contact:manage"],
    assurance: "OTP" as const,
    csrfTokenHash: "csrf",
    expiresAt: new Date(Date.now() + 60_000),
  };
  const crypto = {
    encrypt: (value: string) => `encrypted:${value}`,
    decrypt: (value: string) => value.replace("encrypted:", ""),
    fingerprint: (value: string) => `fp:${value}`,
    hash: (value: string) => `hash:${value}`,
    generateOtp: () => "123456",
    hashOtp: (id: string, code: string) => `otp:${id}:${code}`,
    matches: (expected: string, actual: string) => expected === actual,
  };

  function build() {
    const prisma = {
      selfServiceSession: { findFirst: jest.fn(async () => ({ id: "session-1" })) },
      selfServiceContactUpdate: {
        create: jest.fn(async (input: { data: Record<string, unknown> }) => ({ id: "update-1", status: "DRAFT", ...input.data })),
        findFirst: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async (input: { where: { id: string }; data: Record<string, unknown> }) => ({ id: input.where.id, channel: "email", destinationMasked: "p***@example.com", expiresAt: new Date(Date.now() + 60_000), ...input.data })),
      },
      selfServiceAuditEvent: { create: jest.fn(async () => ({})) },
    };
    const core = {
      submitAffiliateContactUpdate: jest.fn(),
      getAffiliateContactUpdate: jest.fn(),
    };
    const messages = {
      deliverOtp: jest.fn(),
      notifyContactUpdated: jest.fn(async () => ({ status: "NOT_CONFIGURED", error: { code: "NOT_CONFIGURED", message: "No", retryable: false } })),
    };
    const configValues: Record<string, number> = {
      SELF_SERVICE_OTP_TTL_MINUTES: 10,
      SELF_SERVICE_OTP_MAX_ATTEMPTS: 5,
      SELF_SERVICE_OTP_COOLDOWN_SECONDS: 60,
    };
    const service = new SelfServiceContactUpdateService(prisma as never, crypto as never, core as never, messages as never, { get: (key: string) => configValues[key] } as never);
    return { service, prisma, core, messages };
  }

  it("requires the verified current session and stores the new destination encrypted", async () => {
    const { service, prisma } = build();
    const result = await service.start(principal, "email", "Person@Example.com", context);
    expect(result).toMatchObject({ status: "VERIFIED", data: { requestId: "update-1", status: "DRAFT", channel: "email", maskedDestination: "p***@example.com" } });
    const data = prisma.selfServiceContactUpdate.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ destinationEncrypted: "encrypted:person@example.com", destinationMasked: "p***@example.com", browserBindingHash: "fp:127.0.0.1|browser" });
    expect(JSON.stringify(result)).not.toContain("person@example.com");
  });

  it("does not claim a change when delivery is not configured", async () => {
    const { service, prisma, messages } = build();
    prisma.selfServiceContactUpdate.findFirst.mockResolvedValue({
      id: "update-1", sessionId: "session-1", channel: "whatsapp", destinationEncrypted: "encrypted:+573001231234", destinationMasked: "***1234",
      browserBindingHash: "fp:127.0.0.1|browser", status: "DRAFT", expiresAt: new Date(Date.now() + 60_000), retryAvailableAt: new Date(0),
    });
    messages.deliverOtp.mockResolvedValue({ status: "NOT_CONFIGURED", error: { code: "NOT_CONFIGURED", message: "No", retryable: false } });
    const result = await service.requestCode(principal, "update-1", context);
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(prisma.selfServiceContactUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ data: { retryAvailableAt: expect.any(Date) } }));
    expect(prisma.selfServiceContactUpdate.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CHALLENGE_PENDING" }) }));
  });

  it("keeps the local state VERIFIED when the provider is not configured", async () => {
    const { service, prisma, core } = build();
    prisma.selfServiceContactUpdate.findFirst.mockResolvedValue({
      id: "update-1", sessionId: "session-1", channel: "email", destinationEncrypted: "encrypted:person@example.com", destinationMasked: "p***@example.com",
      browserBindingHash: "fp:127.0.0.1|browser", status: "CHALLENGE_PENDING", codeHash: "otp:update-1:123456", attempts: 0, maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000), retryAvailableAt: new Date(0), providerReference: null,
    });
    core.submitAffiliateContactUpdate.mockResolvedValue({ status: "NOT_CONFIGURED", error: { code: "NOT_CONFIGURED", message: "No", retryable: false } });
    const result = await service.verify(principal, "update-1", "123456", "idempotency-key-123", context);
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(prisma.selfServiceContactUpdate.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: SelfServiceContactUpdateStatus.VERIFIED }) }));
    expect(prisma.selfServiceContactUpdate.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: SelfServiceContactUpdateStatus.APPLIED }) }));
  });

  it("uses SUBMITTED until a later provider status explicitly confirms APPLIED", async () => {
    const { service, prisma, core, messages } = build();
    prisma.selfServiceContactUpdate.findFirst
      .mockResolvedValueOnce({
        id: "update-1", sessionId: "session-1", channel: "email", destinationEncrypted: "encrypted:person@example.com", destinationMasked: "p***@example.com",
        browserBindingHash: "fp:127.0.0.1|browser", status: "VERIFIED", codeHash: null, attempts: 0, maxAttempts: 5,
        expiresAt: new Date(Date.now() + 60_000), retryAvailableAt: new Date(0), providerReference: null,
      })
      .mockResolvedValueOnce({
        id: "update-1", sessionId: "session-1", channel: "email", destinationEncrypted: "encrypted:person@example.com", destinationMasked: "p***@example.com",
        browserBindingHash: "fp:127.0.0.1|browser", status: "SUBMITTED", expiresAt: new Date(Date.now() + 60_000), providerReference: "provider-1",
      });
    core.submitAffiliateContactUpdate.mockResolvedValue({ status: "VERIFIED", data: { providerReference: "provider-1", status: "PENDING" } });
    core.getAffiliateContactUpdate.mockResolvedValue({ status: "VERIFIED", data: { providerReference: "provider-1", status: "APPLIED" } });

    await expect(service.verify(principal, "update-1", "123456", "idempotency-key-123", context)).resolves.toMatchObject({ status: "VERIFIED", data: { status: "SUBMITTED" } });
    await expect(service.status(principal, "update-1")).resolves.toMatchObject({ status: "VERIFIED", data: { status: "APPLIED" } });
    expect(prisma.selfServiceContactUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: SelfServiceContactUpdateStatus.APPLIED }) }));
    expect(messages.notifyContactUpdated).not.toHaveBeenCalled();
    expect(prisma.selfServiceAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ outcome: "SKIPPED_PERMISSION_NOT_CONFIRMED" }) }));
  });
});
