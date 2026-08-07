import { SelfServiceCryptoService } from "./self-service-crypto.service";

describe("SelfServiceCryptoService", () => {
  const service = new SelfServiceCryptoService({ get: () => "test-encryption-key-that-is-at-least-32-characters" } as never);

  it("generates cryptographic opaque tokens and six-digit OTP values", () => {
    const first = service.generateToken();
    const second = service.generateToken();
    expect(first).not.toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(service.generateOtp()).toMatch(/^\d{6}$/);
  });

  it("encrypts external subject references and never stores plaintext", () => {
    const plaintext = "external-subject-reference-123";
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it("binds OTP hashes to the challenge and compares in constant-time form", () => {
    const hash = service.hashOtp("challenge-a", "123456");
    expect(service.matches(hash, service.hashOtp("challenge-a", "123456"))).toBe(true);
    expect(service.matches(hash, service.hashOtp("challenge-b", "123456"))).toBe(false);
  });
});
