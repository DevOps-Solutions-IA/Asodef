import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { MasterPaymentSelectionTokenService } from "./master-payment-selection-token.service";

function service(ttlMinutes = 30): MasterPaymentSelectionTokenService {
  const config = {
    get: (key: keyof EnvConfig) => {
      if (key === "ENCRYPTION_KEY") return "test-encryption-key-that-is-long-enough-123456";
      if (key === "PAYMENT_ORDER_TTL_MINUTES") return ttlMinutes;
      throw new Error(`Unexpected config key ${String(key)}`);
    },
  } as unknown as ConfigService<EnvConfig, true>;
  return new MasterPaymentSelectionTokenService(config);
}

describe("MasterPaymentSelectionTokenService", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("round-trips a Master selection through opaque randomized tokens", () => {
    const tokens = service();
    const selection = { personId: "1012345678", contractId: "900001", installmentId: "42" };

    const token = tokens.issue(selection);
    const secondToken = tokens.issue(selection);

    expect(token).toMatch(/^master\.v1\.[A-Za-z0-9_-]+$/);
    expect(secondToken).toMatch(/^master\.v1\.[A-Za-z0-9_-]+$/);
    expect(secondToken).not.toBe(token);
    expect(tokens.verify(token)).toEqual(selection);
    expect(tokens.verify(secondToken)).toEqual(selection);
  });

  it("fails closed when the encrypted token is modified", () => {
    const tokens = service();
    const token = tokens.issue({ personId: "1", contractId: "2", installmentId: "3" });
    const encoded = token.slice("master.v1.".length);
    const packed = Buffer.from(encoded, "base64url");
    const lastIndex = packed.length - 1;
    packed[lastIndex] = packed[lastIndex]! ^ 0x01;
    const tampered = `master.v1.${packed.toString("base64url")}`;

    expect(tokens.verify(tampered)).toBeNull();
  });

  it("rejects an expired selection", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-04T03:00:00.000Z"));
    const tokens = service(1);
    const token = tokens.issue({ personId: "1", contractId: "2", installmentId: "3" });

    jest.setSystemTime(new Date("2026-09-04T03:01:01.000Z"));
    expect(tokens.verify(token)).toBeNull();
  });

  it("rejects non-Master tokens", () => {
    expect(service().verify("not-a-master-selection")).toBeNull();
  });
});
