import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import type { EnvConfig } from "../../config/env.validation";

@Injectable()
export class PasswordService {
  private readonly hashOptions: argon2.Options;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.hashOptions = {
      type: argon2.argon2id,
      memoryCost: configService.get("ARGON2_MEMORY_COST", { infer: true }),
      timeCost: configService.get("ARGON2_TIME_COST", { infer: true }),
      parallelism: configService.get("ARGON2_PARALLELISM", { infer: true }),
    };
  }

  /** Argon2id parameters are encoded in the returned hash string (PHC
   * format) - nothing extra needs to be stored alongside it. */
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(normalize(plainPassword), this.hashOptions);
  }

  /** Constant-time comparison is handled internally by argon2's own
   * verify() - never compare hashes with === or a manual loop. */
  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, normalize(plainPassword));
    } catch {
      // A malformed/foreign hash format throws rather than returning
      // false - treat that the same as "did not match".
      return false;
    }
  }

  /**
   * True when the stored hash was created with weaker parameters than
   * the currently-configured ones (e.g. after raising ARGON2_MEMORY_COST
   * in an env change) - callers should re-hash and persist the new hash
   * on the next successful login when this returns true.
   */
  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, this.hashOptions);
  }
}

/**
 * NFKC-normalizes a password before it is ever hashed or compared, so
 * visually-confusable Unicode encodings of "the same" password (e.g. a
 * precomposed vs. combining-character accent) always hash identically
 * instead of silently being treated as different secrets (US-007).
 * Idempotent - normalizing an already-normalized string is a no-op, so
 * callers that also normalize (e.g. PasswordPolicyService, for
 * length/content checks on the raw input) never cause a mismatch.
 */
export function normalize(password: string): string {
  return password.normalize("NFKC");
}
