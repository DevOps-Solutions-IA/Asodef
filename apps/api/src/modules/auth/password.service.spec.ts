import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { PasswordService } from "./password.service";
import { validateEnv } from "../../config/env.validation";

describe("PasswordService (real argon2, no mocking)", () => {
  let service: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv })],
      providers: [PasswordService],
    }).compile();
    service = moduleRef.get(PasswordService);
  });

  it("hashes a password using argon2id", async () => {
    const hash = await service.hash("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it("produces a different hash each time (random salt) for the same password", async () => {
    const [a, b] = await Promise.all([service.hash("same-password"), service.hash("same-password")]);
    expect(a).not.toBe(b);
  });

  it("verifies a correct password against its hash", async () => {
    const hash = await service.hash("correct horse battery staple");
    expect(await service.verify(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects an incorrect password against a real hash", async () => {
    const hash = await service.hash("correct horse battery staple");
    expect(await service.verify(hash, "wrong password")).toBe(false);
  });

  it("never stores or returns the plaintext password anywhere in the hash", async () => {
    const plaintext = "super-secret-plaintext-marker";
    const hash = await service.hash(plaintext);
    expect(hash).not.toContain(plaintext);
  });

  it("treats a malformed/foreign hash string as a non-match rather than throwing", async () => {
    await expect(service.verify("not-a-real-argon2-hash", "anything")).resolves.toBe(false);
  });

  it("does not flag a hash produced with the current parameters as needing rehash", async () => {
    const hash = await service.hash("correct horse battery staple");
    expect(service.needsRehash(hash)).toBe(false);
  });

  it("flags a hash produced with weaker parameters as needing rehash", async () => {
    // Simulate a hash created before ARGON2_MEMORY_COST was raised in
    // config: a hash with deliberately lower parameters, checked against
    // the service's current (stronger) configured minimums.
    const argon2 = await import("argon2");
    const weakHash = await argon2.hash("correct horse battery staple", {
      type: argon2.argon2id,
      memoryCost: 8192,
      timeCost: 2,
      parallelism: 1,
    });

    expect(service.needsRehash(weakHash)).toBe(true);
  });
});
