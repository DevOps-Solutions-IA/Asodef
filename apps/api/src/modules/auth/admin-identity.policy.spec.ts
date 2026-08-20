import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { AdminIdentityPolicy, PrivilegedRecoveryConfigurationError } from "./admin-identity.policy";

function policy(): AdminIdentityPolicy {
  const values: Partial<EnvConfig> = {
    ADMIN_ACCOUNT_EMAIL: "admin@asodef.com.co",
    ADMIN_RECOVERY_EMAIL: "asodefsas@gmail.com",
  };
  const config = { get: (key: keyof EnvConfig) => values[key] } as ConfigService<EnvConfig, true>;
  return new AdminIdentityPolicy(config);
}

describe("AdminIdentityPolicy", () => {
  it("recognizes the official administrator after safe email normalization", () => {
    expect(policy().isPrivilegedAdminEmail("  ADMIN@ASODEF.COM.CO ")).toBe(true);
  });

  it("keeps ordinary stored staff identities login-capable", () => {
    expect(policy().mayAuthenticate("operaciones@asodef.com.co")).toBe(true);
  });

  it("never permits the recovery-only address to authenticate", () => {
    expect(policy().mayAuthenticate(" ASODEFSAS@GMAIL.COM ")).toBe(false);
  });

  it("routes privileged recovery only to the matching persisted recovery channel", () => {
    expect(policy().resolvePasswordRecoveryRecipient({
      email: "admin@asodef.com.co",
      recoveryEmail: "ASODEFSAS@GMAIL.COM",
    })).toBe("asodefsas@gmail.com");
  });

  it("fails closed when the privileged recovery channel is missing or mismatched", () => {
    expect(() => policy().resolvePasswordRecoveryRecipient({ email: "admin@asodef.com.co", recoveryEmail: null }))
      .toThrow(PrivilegedRecoveryConfigurationError);
    expect(() => policy().resolvePasswordRecoveryRecipient({
      email: "admin@asodef.com.co",
      recoveryEmail: "otro@example.com",
    })).toThrow(PrivilegedRecoveryConfigurationError);
  });

  it("preserves the existing recovery destination for non-privileged staff", () => {
    expect(policy().resolvePasswordRecoveryRecipient({ email: " Staff@Asodef.com.co " }))
      .toBe("staff@asodef.com.co");
  });

  it("protects the official email, recovery channel, account status, and privileged roles", () => {
    const subject = policy();
    expect(() => subject.assertMayChangePrivilegedEmail("admin@asodef.com.co", "other@asodef.com.co")).toThrow();
    expect(() => subject.assertMayChangePrivilegedEmail("other@asodef.com.co", "admin@asodef.com.co")).toThrow();
    expect(() => subject.assertMayChangePrivilegedEmail("other@asodef.com.co", "asodefsas@gmail.com")).toThrow();
    expect(() => subject.assertMayChangePrivilegedRecovery("admin@asodef.com.co", null)).toThrow();
    expect(() => subject.assertMayDeactivate("admin@asodef.com.co")).toThrow();
    expect(() => subject.assertMayHoldPrivilegedRole("other@asodef.com.co", "SUPER_ADMIN")).toThrow();
    expect(() => subject.assertMayRemoveRole("admin@asodef.com.co", "SUPER_ADMIN")).toThrow();
  });

  it("does not interfere with ordinary staff profile and non-privileged role operations", () => {
    const subject = policy();
    expect(() => subject.assertMayChangePrivilegedEmail("one@asodef.com.co", "two@asodef.com.co")).not.toThrow();
    expect(() => subject.assertMayChangePrivilegedRecovery("staff@asodef.com.co", null)).not.toThrow();
    expect(() => subject.assertMayDeactivate("staff@asodef.com.co")).not.toThrow();
    expect(() => subject.assertMayHoldPrivilegedRole("staff@asodef.com.co", "FINANCE")).not.toThrow();
    expect(() => subject.assertMayRemoveRole("staff@asodef.com.co", "FINANCE")).not.toThrow();
  });
});
