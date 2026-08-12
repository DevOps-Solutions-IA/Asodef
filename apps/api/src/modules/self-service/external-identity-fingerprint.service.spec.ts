import { ServiceUnavailableException } from "@nestjs/common";
import { ExternalIdentityFingerprintService } from "./external-identity-fingerprint.service";

describe("ExternalIdentityFingerprintService", () => {
  function service(values: Record<string, unknown>) {
    return new ExternalIdentityFingerprintService({
      get: (key: string) => values[key],
    } as never);
  }

  it("fails closed without its dedicated key and never reads ENCRYPTION_KEY", () => {
    const get = jest.fn((key: string) =>
      key === "ENCRYPTION_KEY" ? "unrelated-encryption-secret-that-is-long-enough" : undefined,
    );
    const fingerprint = new ExternalIdentityFingerprintService({ get } as never);
    expect(() => fingerprint.fingerprints("subject")).toThrow(ServiceUnavailableException);
    expect(get).not.toHaveBeenCalledWith("ENCRYPTION_KEY", expect.anything());
  });

  it("computes case-sensitive fingerprints for active and transition keys", () => {
    const fingerprint = service({
      EXTERNAL_IDENTITY_HMAC_KEY_ID: "2026-08",
      EXTERNAL_IDENTITY_HMAC_KEY: "active-dedicated-key-that-is-at-least-32-characters",
      EXTERNAL_IDENTITY_HMAC_PREVIOUS_KEYS: {
        "2026-01": "previous-dedicated-key-that-is-at-least-32-characters",
      },
    });
    const upper = fingerprint.fingerprints("Subject-ABC");
    const lower = fingerprint.fingerprints("subject-abc");
    expect(upper.map(({ keyId }) => keyId)).toEqual(["2026-08", "2026-01"]);
    expect(upper[0]?.active).toBe(true);
    expect(upper[1]?.active).toBe(false);
    expect(upper[0]?.subjectRefHash).not.toBe(lower[0]?.subjectRefHash);
  });
});
