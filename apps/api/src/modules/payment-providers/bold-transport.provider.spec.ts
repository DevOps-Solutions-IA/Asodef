import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { PrismaService } from "../../database/prisma.service";
import { APPROVAL_GATE_CATALOG } from "../../database/approval-gate-catalog";
import { boldTransportProvider, BoldConfigurationError } from "./bold-transport.provider";
import { MockBoldTransport } from "./mock-bold.transport";
import { HttpBoldTransport } from "./http-bold.transport";

type Overrides = Partial<Pick<EnvConfig, "BOLD_MODE" | "BOLD_IDENTITY_KEY" | "BOLD_BASE_URL">>;

function buildConfigService(overrides: Overrides): ConfigService<EnvConfig, true> {
  const values: Overrides = {
    BOLD_MODE: "mock",
    BOLD_IDENTITY_KEY: "",
    BOLD_BASE_URL: "https://api.online.payments.bold.co",
    ...overrides,
  };
  return { get: (key: keyof Overrides) => values[key] } as unknown as ConfigService<EnvConfig, true>;
}

/** allApproved: true seeds all 16 catalog gates as APPROVED/unexpired
 * (US-058) - false leaves the list empty, simulating "not every gate
 * is approved yet". Only ever consulted when BOLD_MODE=production. */
function buildPrismaStub(allApproved: boolean): PrismaService {
  const gates = allApproved
    ? APPROVAL_GATE_CATALOG.map((entry) => ({ key: entry.key, status: "APPROVED", expirationDate: null }))
    : [];
  return { approvalGate: { findMany: async () => gates } } as unknown as PrismaService;
}

async function callFactory(configService: ConfigService<EnvConfig, true>, prisma: PrismaService, mockTransport: MockBoldTransport) {
  const factory = boldTransportProvider.useFactory as (...args: unknown[]) => Promise<unknown>;
  return factory(configService, mockTransport, prisma);
}

describe("boldTransportProvider (US-022 Negative case: fails startup without mock mode or real credentials)", () => {
  const mockTransport = new MockBoldTransport();

  it("BOLD_MODE=mock always resolves to MockBoldTransport, regardless of credentials", async () => {
    const configService = buildConfigService({ BOLD_MODE: "mock", BOLD_IDENTITY_KEY: "" });
    const transport = await callFactory(configService, buildPrismaStub(false), mockTransport);
    expect(transport).toBe(mockTransport);
  });

  it("BOLD_MODE=sandbox without BOLD_IDENTITY_KEY throws BoldConfigurationError - never silently attempts a live call", async () => {
    const configService = buildConfigService({ BOLD_MODE: "sandbox", BOLD_IDENTITY_KEY: "" });
    await expect(callFactory(configService, buildPrismaStub(false), mockTransport)).rejects.toThrow(BoldConfigurationError);
  });

  it("BOLD_MODE=production without BOLD_IDENTITY_KEY throws BoldConfigurationError", async () => {
    const configService = buildConfigService({ BOLD_MODE: "production", BOLD_IDENTITY_KEY: "" });
    await expect(callFactory(configService, buildPrismaStub(false), mockTransport)).rejects.toThrow(BoldConfigurationError);
  });

  it("the configuration error message never echoes the (absent) credential value", async () => {
    const configService = buildConfigService({ BOLD_MODE: "production", BOLD_IDENTITY_KEY: "" });
    try {
      await callFactory(configService, buildPrismaStub(false), mockTransport);
      throw new Error("expected boldTransportProvider to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BoldConfigurationError);
      expect((error as Error).message).not.toMatch(/[a-zA-Z0-9]{16,}/); // no secret-looking token embedded
    }
  });

  it("BOLD_MODE=sandbox with BOLD_IDENTITY_KEY configured resolves to a real HttpBoldTransport - no approval-gate check for sandbox", async () => {
    const configService = buildConfigService({ BOLD_MODE: "sandbox", BOLD_IDENTITY_KEY: "sandbox-test-key" });
    const transport = await callFactory(configService, buildPrismaStub(false), mockTransport);
    expect(transport).toBeInstanceOf(HttpBoldTransport);
  });

  it("BOLD_MODE=production with credentials AND every ApprovalGate APPROVED resolves to a real HttpBoldTransport", async () => {
    const configService = buildConfigService({ BOLD_MODE: "production", BOLD_IDENTITY_KEY: "production-test-key" });
    const transport = await callFactory(configService, buildPrismaStub(true), mockTransport);
    expect(transport).toBeInstanceOf(HttpBoldTransport);
  });

  it("Negative case (US-058, verbatim): BOLD_MODE=production with real credentials but not every ApprovalGate APPROVED still throws BoldConfigurationError - never silently allows live payments", async () => {
    const configService = buildConfigService({ BOLD_MODE: "production", BOLD_IDENTITY_KEY: "production-test-key" });
    await expect(callFactory(configService, buildPrismaStub(false), mockTransport)).rejects.toThrow(BoldConfigurationError);
  });
});
