import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";

export interface RecoveryIdentity {
  email: string;
  recoveryEmail?: string | null;
}

export class PrivilegedRecoveryConfigurationError extends Error {
  constructor() {
    super("Privileged administrator recovery configuration is unavailable.");
    this.name = "PrivilegedRecoveryConfigurationError";
  }
}

export type AdminIdentityViolationCode =
  | "PRIVILEGED_EMAIL_IMMUTABLE"
  | "RECOVERY_EMAIL_RESERVED"
  | "PRIVILEGED_RECOVERY_REQUIRED"
  | "PRIVILEGED_ACCOUNT_REQUIRED";

export class AdminIdentityPolicyViolation extends Error {
  constructor(readonly code: AdminIdentityViolationCode) {
    super("The requested change violates the privileged administrator identity policy.");
    this.name = "AdminIdentityPolicyViolation";
  }
}

const PRIVILEGED_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);

/**
 * Single source of truth for the one privileged ASODEF administrator and
 * its recovery-only channel. Ordinary stored staff identities retain their
 * existing login semantics; the configured recovery address is never an
 * authentication alias, even if a User row with that email exists.
 */
@Injectable()
export class AdminIdentityPolicy {
  readonly accountEmail: string;
  readonly recoveryEmail: string;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.accountEmail = normalizeEmail(configService.get("ADMIN_ACCOUNT_EMAIL", { infer: true }));
    this.recoveryEmail = normalizeEmail(configService.get("ADMIN_RECOVERY_EMAIL", { infer: true }));
  }

  isPrivilegedAdminEmail(email: string): boolean {
    return normalizeEmail(email) === this.accountEmail;
  }

  isRecoveryOnlyEmail(email: string): boolean {
    return normalizeEmail(email) === this.recoveryEmail;
  }

  mayAuthenticate(email: string): boolean {
    return !this.isRecoveryOnlyEmail(email);
  }

  resolvePasswordRecoveryRecipient(identity: RecoveryIdentity): string {
    if (!this.isPrivilegedAdminEmail(identity.email)) {
      return normalizeEmail(identity.email);
    }

    if (!identity.recoveryEmail || normalizeEmail(identity.recoveryEmail) !== this.recoveryEmail) {
      throw new PrivilegedRecoveryConfigurationError();
    }
    return this.recoveryEmail;
  }

  assertMayChangePrivilegedEmail(currentEmail: string, nextEmail: string): void {
    const current = normalizeEmail(currentEmail);
    const next = normalizeEmail(nextEmail);
    if ((current === this.accountEmail && next !== this.accountEmail) ||
        (current !== this.accountEmail && next === this.accountEmail)) {
      throw new AdminIdentityPolicyViolation("PRIVILEGED_EMAIL_IMMUTABLE");
    }
    if (next === this.recoveryEmail) {
      throw new AdminIdentityPolicyViolation("RECOVERY_EMAIL_RESERVED");
    }
  }

  assertMayChangePrivilegedRecovery(currentEmail: string, nextRecovery: string | null | undefined): void {
    if (!this.isPrivilegedAdminEmail(currentEmail)) return;
    if (!nextRecovery || normalizeEmail(nextRecovery) !== this.recoveryEmail) {
      throw new AdminIdentityPolicyViolation("PRIVILEGED_RECOVERY_REQUIRED");
    }
  }

  assertMayDeactivate(email: string): void {
    if (this.isPrivilegedAdminEmail(email)) {
      throw new AdminIdentityPolicyViolation("PRIVILEGED_ACCOUNT_REQUIRED");
    }
  }

  assertMayHoldPrivilegedRole(email: string, roleName: string): void {
    if (PRIVILEGED_ROLES.has(roleName) && !this.isPrivilegedAdminEmail(email)) {
      throw new AdminIdentityPolicyViolation("PRIVILEGED_ACCOUNT_REQUIRED");
    }
  }

  assertMayRemoveRole(email: string, roleName: string): void {
    if (this.isPrivilegedAdminEmail(email) && PRIVILEGED_ROLES.has(roleName)) {
      throw new AdminIdentityPolicyViolation("PRIVILEGED_ACCOUNT_REQUIRED");
    }
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
