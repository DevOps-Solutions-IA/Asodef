import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { PrismaService } from "../../database/prisma.service";
import { APPROVAL_GATE_CATALOG } from "../../database/approval-gate-catalog";
import { boldTransportProvider, BoldConfigurationError } from "./bold-transport.provider";
import { MockBoldTransport } from "./mock-bold.transport";
import { HttpBoldTransport } from "./http-bold.transport";

type Overrides = Partial<Pick<EnvConfig, "BOLD_MODE" | "BOLD_IDENTITY_KEY" | "BOLD_WEBHOOK_SECRET" | "BOLD_BASE_URL">>;

function buildConfigService(overrides: Overrides): ConfigService<EnvConfig, true> {
  const values: Overrides = {
    BOLD_MODE: "mock",
    BOLD_IDENTITY_KEY: "",
    BOLD_WEBHOOK_SECRET: "",
    BOLD_BASE_URL: "https://api.online.payments.bold.co",
    ...overrides,
  };
  return { get: (key: keyof Overrides) => values[key] } as unknown as ConfigService<EnvConfig, true>;
}

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

describe("boldTransportProvider", () => {
  const mockTransport = new MockBoldTransport();

  it("BOLD_MODE=mock always resolves to MockBoldTransport", async () => {
    const configService = buildConfigService({ BOLD_MODE: "mock", BOLD_IDENTITY_KEY: "" });
    await expect(callFactory(configService, buildPrismaStub(false), mockTransport)).resolves.toBe(mockTransport);
  });

  it("BOLD_MODE=sandbox without BOLD_IDENTITY_KEY fails closed", async () => {
    const configService = buildConfigService({ BOLD_MODE: "sandbox", BOLD_IDENTITY_KEY: "" });
    await expect(callFactory(configService, buildPrismaStub(false), mockTransport)).rejects.toThrow(BoldConfigurationError);
  });

  it("BOLD_MODE=production without BOLD_IDENTITY_KEY fails closed", async () => {
    const configService = buildConfigService({ BOLD_MODE: "production", BOLD_IDENTITY_KEY: "" });
    await expect(callFactory(configService, buildPrismaStub(false), mockTransport)).rejects.toThrow(BoldConfigurationError);
  });

  it("BOLD_MODE=sandbox permits Bold's test webhook key contract independently of production", async () => {
    const configService = buildConfigService({ BOLD_MODE: "sandbox", BOLD_IDENTITY_KEY: "sandbox-test-key", BOLD_WEBHOOK_SECRET: "" });
    const transport = await callFactory(configService, buildPrismaStub(false), mockTransport);
    expect(transport).toBeInstanceOf(HttpBoldTransport);
  });

  it("BOLD_MODE=production refuses startup when BOLD_WEBHOOK_SECRET is missing", async () => {
    const configService = buildConfigService({
      BOLD_MODE: "production",
      BOLD_IDENTITY_KEY: "production-test-key",
      BOLD_WEBHOOK_SECRET: "",
    });
    await expect(callFactory(configService, buildPrismaStub(true), mockTransport)).rejects.toThrow(/BOLD_WEBHOOK_SECRET/);
  });

  it("BOLD_MODE=production with credentials, webhook secret and all gates approved resolves to HttpBoldTransport", async () => {
    const configService = buildConfigService({
      BOLD_MODE: "production",
      BOLD_IDENTITY_KEY: "production-test-key",
      BOLD_WEBHOOK_SECRET: "production-webhook-test-secret",
    });
    const transport = await callFactory(configService, buildPrismaStub(true), mockTransport);
    expect(transport).toBeInstanceOf(HttpBoldTransport);
  });

  it("BOLD_MODE=production still fails when approval gates are incomplete", async () => {
    const configService = buildConfigService({
      BOLD_MODE: "production",
      BOLD_IDENTITY_KEY: "production-test-key",
      BOLD_WEBHOOK_SECRET: "production-webhook-test-secret",
    });
    await expect(callFactory(configService, buildPrismaStub(false), mockTransport)).rejects.toThrow(BoldConfigurationError);
  });
});
