import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";
import { PasswordService, normalize } from "../password.service";
import { COMMON_PASSWORDS } from "./common-passwords";

export type PasswordShapeViolation = "TOO_SHORT" | "TOO_LONG" | "COMMON_PASSWORD" | "CONTAINS_EMAIL";

/**
 * Centralized, configurable password policy (US-007). Deliberately does
 * *not* force character-class composition rules ("must contain a
 * symbol") - modern guidance (e.g. NIST SP 800-63B) favors length plus
 * blocklisting over composition rules, which mostly push users toward
 * predictable substitutions ("password" -> "P@ssw0rd1") without adding
 * real entropy. Common/breached-password rejection is checked against a
 * local static blocklist (see common-passwords.ts) rather than a live
 * third-party breach-check API - `isCommonPassword` is the seam a future
 * HaveIBeenPwned-style k-anonymity integration would replace.
 */
@Injectable()
export class PasswordPolicyService {
  readonly minLength: number;
  readonly maxLength: number;
  readonly historyLimit: number;

  constructor(
    private readonly passwordService: PasswordService,
    configService: ConfigService<EnvConfig, true>,
  ) {
    this.minLength = configService.get("PASSWORD_MIN_LENGTH", { infer: true });
    this.maxLength = configService.get("PASSWORD_MAX_LENGTH", { infer: true });
    this.historyLimit = configService.get("PASSWORD_HISTORY_LIMIT", { infer: true });
  }

  /**
   * Pure, synchronous shape/content checks - no DB access. Never logs or
   * returns the password itself, only violation codes. A too-long
   * password is rejected outright (never silently truncated) before
   * anything is hashed.
   */
  validateShape(password: string, context: { email: string }): PasswordShapeViolation[] {
    const normalized = normalize(password);
    const violations: PasswordShapeViolation[] = [];

    if (normalized.length < this.minLength) violations.push("TOO_SHORT");
    if (normalized.length > this.maxLength) violations.push("TOO_LONG");

    // Content checks only make sense once length itself is sane.
    if (violations.length === 0) {
      if (this.isCommonPassword(normalized)) violations.push("COMMON_PASSWORD");
      if (this.matchesEmail(normalized, context.email)) violations.push("CONTAINS_EMAIL");
    }

    return violations;
  }

  private isCommonPassword(password: string): boolean {
    return COMMON_PASSWORDS.has(password.toLowerCase());
  }

  private matchesEmail(password: string, email: string): boolean {
    const normalizedPassword = password.toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const localPart = normalizedEmail.split("@")[0] ?? "";
    return normalizedPassword === normalizedEmail || (localPart.length >= 3 && normalizedPassword === localPart);
  }

  /**
   * True if `candidate` would hash identically to the user's current
   * password or any of their most recent `historyLimit` prior passwords -
   * i.e. this is a rejected reuse under the password-history policy.
   */
  async isReused(candidate: string, currentHash: string, historyHashes: string[]): Promise<boolean> {
    for (const hash of [currentHash, ...historyHashes]) {
      if (await this.passwordService.verify(hash, candidate)) return true;
    }
    return false;
  }
}
