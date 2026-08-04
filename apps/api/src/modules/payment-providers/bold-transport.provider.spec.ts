import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
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

describe("boldTransportProvider (US-022 Negative case: fails startup without mock mode or real credentials)", () => {
  const mockTransport = new MockBoldTransport();

  it("BOLD_MODE=mock always resolves to MockBoldTransport, regardless of credentials", () => {
    const configService = buildConfigService({ BOLD_MODE: "mock", BOLD_IDENTITY_KEY: "" });
    const transport = (boldTransportProvider.useFactory as (...args: unknown[]) => unknown)(configService, mockTransport);
    expect(transport).toBe(mockTransport);
  });

  it("BOLD_MODE=sandbox without BOLD_IDENTITY_KEY throws BoldConfigurationError - never silently attempts a live call", () => {
    const configService = buildConfigService({ BOLD_MODE: "sandbox", BOLD_IDENTITY_KEY: "" });
    expect(() => (boldTransportProvider.useFactory as (...args: unknown[]) => unknown)(configService, mockTransport)).toThrow(
      BoldConfigurationError,
    );
  });

  it("BOLD_MODE=production without BOLD_IDENTITY_KEY throws BoldConfigurationError", () => {
    const configService = buildConfigService({ BOLD_MODE: "production", BOLD_IDENTITY_KEY: "" });
    expect(() => (boldTransportProvider.useFactory as (...args: unknown[]) => unknown)(configService, mockTransport)).toThrow(
      BoldConfigurationError,
    );
  });

  it("the configuration error message never echoes the (absent) credential value", () => {
    const configService = buildConfigService({ BOLD_MODE: "production", BOLD_IDENTITY_KEY: "" });
    try {
      (boldTransportProvider.useFactory as (...args: unknown[]) => unknown)(configService, mockTransport);
      throw new Error("expected boldTransportProvider to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BoldConfigurationError);
      expect((error as Error).message).not.toMatch(/[a-zA-Z0-9]{16,}/); // no secret-looking token embedded
    }
  });

  it("BOLD_MODE=sandbox with BOLD_IDENTITY_KEY configured resolves to a real HttpBoldTransport", () => {
    const configService = buildConfigService({ BOLD_MODE: "sandbox", BOLD_IDENTITY_KEY: "sandbox-test-key" });
    const transport = (boldTransportProvider.useFactory as (...args: unknown[]) => unknown)(configService, mockTransport);
    expect(transport).toBeInstanceOf(HttpBoldTransport);
  });

  it("BOLD_MODE=production with BOLD_IDENTITY_KEY configured resolves to a real HttpBoldTransport", () => {
    const configService = buildConfigService({ BOLD_MODE: "production", BOLD_IDENTITY_KEY: "production-test-key" });
    const transport = (boldTransportProvider.useFactory as (...args: unknown[]) => unknown)(configService, mockTransport);
    expect(transport).toBeInstanceOf(HttpBoldTransport);
  });
});
