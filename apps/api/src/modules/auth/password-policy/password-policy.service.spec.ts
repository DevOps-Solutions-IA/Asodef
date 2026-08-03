import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { PasswordPolicyService } from "./password-policy.service";
import { PasswordService } from "../password.service";
import { validateEnv } from "../../../config/env.validation";

async function buildPolicyService(envOverrides: Record<string, string> = {}): Promise<{
  policy: PasswordPolicyService;
  passwordService: PasswordService;
}> {
  const original = { ...process.env };
  Object.assign(process.env, envOverrides);

  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv })],
    providers: [PasswordPolicyService, PasswordService],
  }).compile();

  process.env = original;
  return { policy: moduleRef.get(PasswordPolicyService), passwordService: moduleRef.get(PasswordService) };
}

describe("PasswordPolicyService", () => {
  describe("validateShape", () => {
    it("rejects a password shorter than the configured minimum length", async () => {
      const { policy } = await buildPolicyService({ PASSWORD_MIN_LENGTH: "12" });
      expect(policy.validateShape("short7!", { email: "a@example.com" })).toContain("TOO_SHORT");
    });

    it("accepts a password at exactly the configured minimum length", async () => {
      const { policy } = await buildPolicyService({ PASSWORD_MIN_LENGTH: "12" });
      const exactlyMin = "a".repeat(12);
      expect(policy.validateShape(exactlyMin, { email: "somebody@example.com" })).not.toContain("TOO_SHORT");
    });

    it("rejects a password longer than the configured maximum length (never silently truncates)", async () => {
      const { policy } = await buildPolicyService({ PASSWORD_MAX_LENGTH: "20" });
      const tooLong = "a".repeat(21);
      expect(policy.validateShape(tooLong, { email: "a@example.com" })).toContain("TOO_LONG");
    });

    it("rejects a common/breached password even when it satisfies length rules", async () => {
      const { policy } = await buildPolicyService({ PASSWORD_MIN_LENGTH: "8" });
      expect(policy.validateShape("password123", { email: "someone@example.com" })).toContain("COMMON_PASSWORD");
    });

    it("rejects a password equal to the user's full email address", async () => {
      const { policy } = await buildPolicyService({ PASSWORD_MIN_LENGTH: "8" });
      expect(policy.validateShape("user@example.com", { email: "user@example.com" })).toContain("CONTAINS_EMAIL");
    });

    it("rejects a password equal to the user's email local-part", async () => {
      const { policy } = await buildPolicyService({ PASSWORD_MIN_LENGTH: "8" });
      expect(policy.validateShape("user1234567", { email: "user1234567@example.com" })).toContain("CONTAINS_EMAIL");
    });

    it("accepts a long, uncommon, unrelated-to-email password with no violations", async () => {
      const { policy } = await buildPolicyService();
      const violations = policy.validateShape("Correct-Horse-Battery-Staple-99!", { email: "someone@example.com" });
      expect(violations).toEqual([]);
    });

    it("never returns or leaks the password itself in its result", async () => {
      const { policy } = await buildPolicyService();
      const distinctivePassword = "totally-unique-marker-password-value";
      const violations = policy.validateShape(distinctivePassword, { email: "a@example.com" });
      expect(JSON.stringify(violations)).not.toContain(distinctivePassword);
    });

    it("handles Unicode normalization consistently (NFKC-equivalent forms behave the same)", async () => {
      const { policy } = await buildPolicyService({ PASSWORD_MIN_LENGTH: "5" });
      // A precomposed \u00e9 (U+00E9) vs. "e" + a combining acute accent
      // (U+0065 U+0301) render identically but are different code-point
      // sequences until NFKC-normalized - built via \u escapes so the two
      // forms are unambiguously distinct going in.
      const precomposed = "caf\u00e9-Segura-99";
      const decomposed = "cafe\u0301-Segura-99";
      expect(precomposed).not.toBe(decomposed);
      expect(policy.validateShape(precomposed, { email: "a@example.com" })).toEqual(
        policy.validateShape(decomposed, { email: "a@example.com" }),
      );
    });
  });

  describe("isReused", () => {
    it("flags a candidate that matches the current password hash", async () => {
      const { policy, passwordService } = await buildPolicyService();
      const currentHash = await passwordService.hash("MyCurrentPassword99!");
      expect(await policy.isReused("MyCurrentPassword99!", currentHash, [])).toBe(true);
    });

    it("flags a candidate that matches one of the historical password hashes", async () => {
      const { policy, passwordService } = await buildPolicyService();
      const currentHash = await passwordService.hash("CurrentOne99!");
      const historyHash = await passwordService.hash("OlderPassword88!");
      expect(await policy.isReused("OlderPassword88!", currentHash, [historyHash])).toBe(true);
    });

    it("does not flag a genuinely new password not present in current or history hashes", async () => {
      const { policy, passwordService } = await buildPolicyService();
      const currentHash = await passwordService.hash("CurrentOne99!");
      const historyHash = await passwordService.hash("OlderPassword88!");
      expect(await policy.isReused("Brand-New-Password-77!", currentHash, [historyHash])).toBe(false);
    });
  });
});
