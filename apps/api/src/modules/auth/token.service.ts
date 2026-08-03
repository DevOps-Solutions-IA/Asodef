import { randomBytes, createHmac } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { EnvConfig } from "../../config/env.validation";

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

/** What jwtService.verify() actually returns: jsonwebtoken always adds
 * `iat`/`exp` to the decoded payload when the token was signed with
 * `expiresIn` (as signAccessToken does), regardless of the payload shape
 * passed to sign(). `iat` is what JwtAuthGuard compares against
 * User.passwordChangedAt (US-007) to reject an already-issued access
 * token after a password reset/change. */
export interface VerifiedAccessTokenPayload extends AccessTokenPayload {
  iat: number;
  exp: number;
}

/**
 * Access tokens are short-lived signed JWTs (stateless, verified without a
 * DB hit). Refresh tokens are opaque high-entropy random strings, never
 * JWTs - a JWT gives an attacker who steals the DB no benefit here since
 * only a hash is ever stored, and a plain HMAC-SHA256 (not Argon2) is the
 * correct, fast choice for hashing a 256-bit random value: Argon2's slow
 * hashing exists specifically to resist brute-forcing a *low-entropy*
 * human-chosen secret, which does not apply to a value this random.
 * Hashing is keyed (HMAC, not plain SHA-256) using JWT_REFRESH_SECRET as a
 * pepper, so a leaked database alone still isn't enough to forge a valid
 * lookup hash.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get("JWT_SECRET", { infer: true }),
      expiresIn: this.configService.get("JWT_ACCESS_TTL", { infer: true }),
    });
  }

  /** Throws if the token is missing, malformed, expired, or has an
   * invalid signature - callers must catch and map to a safe 401. */
  verifyAccessToken(token: string): VerifiedAccessTokenPayload {
    return this.jwtService.verify<VerifiedAccessTokenPayload>(token, {
      secret: this.configService.get("JWT_SECRET", { infer: true }),
    });
  }

  generateRefreshToken(): string {
    return randomBytes(32).toString("base64url");
  }

  hashRefreshToken(rawToken: string): string {
    const pepper = this.configService.get("JWT_REFRESH_SECRET", { infer: true });
    return createHmac("sha256", pepper).update(rawToken).digest("hex");
  }

  getRefreshTtlMs(): number {
    return parseDurationToMs(this.configService.get("JWT_REFRESH_TTL", { infer: true }));
  }
}

/** Parses "15m" / "7d" / "30s" / "1h" style durations (also accepts a bare
 * number of milliseconds). Kept minimal and dependency-free rather than
 * pulling in a duration-parsing library for four unit suffixes. */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Invalid duration string: "${duration}"`);
  }
  const value = Number(match[1]);
  const unit = match[2] ?? "ms";
  const unitMs = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  } as const satisfies Record<string, number>;
  const multiplier = unitMs[unit as keyof typeof unitMs];
  return value * multiplier;
}
