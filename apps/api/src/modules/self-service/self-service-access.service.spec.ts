import { SelfServicePortal } from "@prisma/client";
import type { ExternalCoreProvider, SelfServiceMessageProvider } from "./external-core.provider";
import { SelfServiceAccessService } from "./self-service-access.service";
import { SelfServiceCryptoService } from "./self-service-crypto.service";

describe("SelfServiceAccessService security boundary", () => {
  const crypto = {
    fingerprint: (value: string) => `fp:${value}`,
    generateOtp: () => "123456",
    encrypt: (value: string) => `encrypted:${value}`,
    hashOtp: (id: string, code: string) => `hash:${id}:${code}`,
    hash: (value: string) => `hash:${value}`,
    matches: (expected: string, actual: string) => expected === actual,
    decrypt: (value: string) => value.replace("encrypted:", ""),
  } as unknown as SelfServiceCryptoService;
  const context = { ipAddress: "127.0.0.1", userAgent: "test", requestId: "request" };
  const delivered = { status: "VERIFIED", data: { delivered: true } } as const;
  const operationalChannel = { enabled: true, verified: true, lastUpdatedAt: "2026-08-06T12:00:00.000Z", operationalCommunicationPermission: true } as const;

  function build(coreOverrides: Record<string, unknown> = {}, messageResult: unknown = delivered) {
    const prisma = {
      selfServiceAccessLookup: {
        create: jest.fn(async (input: { data: Record<string, unknown> }) => input.data),
        findUnique: jest.fn(),
      },
      selfServiceOtpChallenge: {
        create: jest.fn(async (input: { data: Record<string, unknown> }) => input.data),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      selfServiceAuditEvent: { create: jest.fn(async () => ({})) },
    };
    const core = {
      startAffiliateLookup: jest.fn(),
      startCompanyLookupByNit: jest.fn(),
      getAffiliateVerificationChannels: jest.fn(),
      getAffiliateContactDestinations: jest.fn(),
      getCompanyVerificationChannels: jest.fn(),
      getCompanyContactDestinations: jest.fn(),
      ...coreOverrides,
    } as unknown as ExternalCoreProvider;
    const messages = { deliverOtp: jest.fn(async () => messageResult) } as unknown as SelfServiceMessageProvider;
    const service = new SelfServiceAccessService(
      prisma as never,
      crypto,
      { create: jest.fn() } as never,
      { checkAndIncrement: jest.fn(async () => ({ limited: false, remaining: 2, retryAfterSeconds: 0 })) } as never,
      core,
      messages,
      { get: (key: string) => ({ SELF_SERVICE_OTP_TTL_MINUTES: 10, SELF_SERVICE_OTP_MAX_ATTEMPTS: 5, SELF_SERVICE_OTP_COOLDOWN_SECONDS: 60 })[key as "SELF_SERVICE_OTP_TTL_MINUTES"] } as never,
    );
    return { service, prisma, messages };
  }

  it("propagates NOT_CONFIGURED without persisting a lookup or delivering a code", async () => {
    const { service, prisma, messages } = build({
      startAffiliateLookup: jest.fn(async () => ({ status: "NOT_CONFIGURED", error: { code: "NOT_CONFIGURED", message: "Not configured", retryable: false } })),
    });
    const result = await service.startAffiliate({ identifierMode: "TITULAR_NUMBER", identifier: "10000001" }, context);
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(messages.deliverOtp).not.toHaveBeenCalled();
    expect(prisma.selfServiceAccessLookup.create).not.toHaveBeenCalled();
  });

  it("returns the same public response for undisclosed NOT_FOUND and recovery failures", async () => {
    const notFound = build({
      startAffiliateLookup: jest.fn(async () => ({ status: "NOT_FOUND", disclosureAllowed: false, error: { code: "NOT_FOUND", message: "No existe", retryable: false } })),
    }).service;
    const unavailable = build({
      startAffiliateLookup: jest.fn(async () => ({ status: "UNAVAILABLE", disclosureAllowed: false, error: { code: "CORE_DOWN", message: "Core caído", retryable: true } })),
    }).service;
    const input = { identifierMode: "TITULAR_NUMBER", identifier: "10000001" } as const;
    await expect(notFound.startAffiliate(input, context)).resolves.toEqual(await unavailable.startAffiliate(input, context));
  });

  it("discovers masked channels while keeping full destinations encrypted and backend-only", async () => {
    const { service, prisma, messages } = build({
      startAffiliateLookup: jest.fn(async () => ({ status: "VERIFIED", data: { subjectRef: "subject-1" } })),
      getAffiliateVerificationChannels: jest.fn(async () => ({ status: "VERIFIED", data: [
        { id: "email-1", type: "email", masked: "p***@example.com", ...operationalChannel },
        { id: "whatsapp-1", type: "whatsapp", masked: "***1234", ...operationalChannel },
      ] })),
      getAffiliateContactDestinations: jest.fn(async () => ({ status: "VERIFIED", data: [
        { id: "email-1", type: "email", destination: "person@example.com", ...operationalChannel },
        { id: "whatsapp-1", type: "whatsapp", destination: "+573001231234", ...operationalChannel },
      ] })),
    });
    const result = await service.startAffiliate({ identifierMode: "DOCUMENT", documentType: "CC", identifier: "10000001" }, context);
    expect(result).toMatchObject({
      status: "CHALLENGE_REQUIRED",
      channels: [
        { providerReference: "email-1", channel: "email", maskedDestination: "p***@example.com", availability: "AVAILABLE" },
        { providerReference: "whatsapp-1", channel: "whatsapp", maskedDestination: "***1234", availability: "AVAILABLE" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("subject-1");
    expect(JSON.stringify(result)).not.toContain("person@example.com");
    expect(JSON.stringify(result)).not.toContain("+573001231234");
    expect(messages.deliverOtp).not.toHaveBeenCalled();
    const persisted = prisma.selfServiceAccessLookup.create.mock.calls[0]?.[0].data;
    expect(persisted).toBeDefined();
    if (!persisted) throw new Error("Expected persisted lookup");
    expect(persisted.destinationsEncrypted).toContain("encrypted:");
    expect(persisted.channels).not.toEqual(expect.stringContaining("person@example.com"));
  });

  it("delivers a code only after channel selection and persists only the OTP hash", async () => {
    const { service, prisma, messages } = build();
    prisma.selfServiceAccessLookup.findUnique.mockResolvedValue({
      id: "0f30dbef-f1c4-4a58-a013-3c6e59f17db4",
      portal: SelfServicePortal.AFFILIATE,
      lookupHash: "lookup-hash",
      subjectRefEncrypted: "encrypted:subject-1",
      browserBindingHash: "fp:127.0.0.1|test",
      channels: [{ id: "email-1", type: "email", masked: "p***@example.com", ...operationalChannel }],
      destinationsEncrypted: `encrypted:${JSON.stringify([{ id: "email-1", type: "email", destination: "person@example.com", ...operationalChannel }])}`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await service.requestCode(SelfServicePortal.AFFILIATE, "0f30dbef-f1c4-4a58-a013-3c6e59f17db4", "email-1", context);
    expect(result).toMatchObject({ status: "CHALLENGE_REQUIRED", channel: "email", maskedDestination: "p***@example.com" });
    expect(JSON.stringify(result)).not.toContain("person@example.com");
    expect(messages.deliverOtp).toHaveBeenCalledWith(expect.objectContaining({ destination: "person@example.com", code: "123456" }));
    const persisted = prisma.selfServiceOtpChallenge.create.mock.calls[0]?.[0].data;
    expect(persisted).toBeDefined();
    if (!persisted) throw new Error("Expected persisted challenge");
    expect(persisted).toMatchObject({ accessLookupId: "0f30dbef-f1c4-4a58-a013-3c6e59f17db4", channelReference: "email-1" });
    expect(persisted.codeHash).toContain("hash:");
    expect(persisted.codeHash).not.toBe("123456");
    expect(JSON.stringify(persisted)).not.toContain("person@example.com");
  });

  it("does not persist a challenge when OTP delivery is not configured", async () => {
    const { service, prisma } = build({}, { status: "NOT_CONFIGURED", error: { code: "OTP_DELIVERY_NOT_CONFIGURED", message: "Not configured", retryable: false } });
    prisma.selfServiceAccessLookup.findUnique.mockResolvedValue({
      id: "41b9a47a-4851-44da-afd8-ea592da5a89a",
      portal: SelfServicePortal.COMPANY,
      lookupHash: "lookup-hash",
      subjectRefEncrypted: "encrypted:company-1",
      browserBindingHash: "fp:127.0.0.1|test",
      channels: [{ id: "sms-1", type: "sms", masked: "***1234", ...operationalChannel }],
      destinationsEncrypted: `encrypted:${JSON.stringify([{ id: "sms-1", type: "sms", destination: "+573001231234", ...operationalChannel }])}`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await service.requestCode(SelfServicePortal.COMPANY, "41b9a47a-4851-44da-afd8-ea592da5a89a", "sms-1", context);
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(prisma.selfServiceOtpChallenge.create).not.toHaveBeenCalled();
  });

  it("rejects channel selection from a different browser binding", async () => {
    const { service, prisma, messages } = build();
    prisma.selfServiceAccessLookup.findUnique.mockResolvedValue({
      id: "41b9a47a-4851-44da-afd8-ea592da5a89a",
      portal: SelfServicePortal.AFFILIATE,
      browserBindingHash: "fp:another-device",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await service.requestCode(SelfServicePortal.AFFILIATE, "41b9a47a-4851-44da-afd8-ea592da5a89a", "email-1", context);
    expect(result).toMatchObject({ status: "UNAVAILABLE", error: { code: "INVALID_OR_EXPIRED_ACCESS" } });
    expect(messages.deliverOtp).not.toHaveBeenCalled();
    expect(prisma.selfServiceOtpChallenge.create).not.toHaveBeenCalled();
  });

  it("honors the resend cooldown without sending another code", async () => {
    const { service, prisma, messages } = build();
    prisma.selfServiceOtpChallenge.findUnique.mockResolvedValue({
      id: "challenge",
      portal: SelfServicePortal.AFFILIATE,
      status: "PENDING",
      browserBindingHash: "fp:127.0.0.1|test",
      channel: "email",
      channelReference: "email-1",
      destinationMasked: "p***@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      retryAvailableAt: new Date(Date.now() + 30_000),
      accessLookup: { expiresAt: new Date(Date.now() + 60_000), destinationsEncrypted: "encrypted:[]" },
    });
    const result = await service.resend(SelfServicePortal.AFFILIATE, "challenge", context);
    expect(result).toMatchObject({ status: "CHALLENGE_REQUIRED", challengeId: "challenge" });
    expect(messages.deliverOtp).not.toHaveBeenCalled();
    expect(prisma.selfServiceOtpChallenge.updateMany).not.toHaveBeenCalled();
  });

  it("locks a challenge after the configured number of failed attempts", async () => {
    const { service, prisma } = build();
    prisma.selfServiceOtpChallenge.findUnique.mockResolvedValue({ id: "challenge", portal: SelfServicePortal.AFFILIATE, status: "PENDING", browserBindingHash: "fp:127.0.0.1|test", expiresAt: new Date(Date.now() + 60_000), codeHash: "different", attempts: 4, maxAttempts: 5, subjectRefEncrypted: "encrypted:subject" });
    const result = await service.verify(SelfServicePortal.AFFILIATE, "challenge", "123456", context);
    expect(result.status).toBe("UNAVAILABLE");
    expect(prisma.selfServiceOtpChallenge.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attempts: 5, status: "LOCKED" }) }));
  });
});
