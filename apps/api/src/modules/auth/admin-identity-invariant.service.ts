import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../database/prisma.service";
import { AdminIdentityPolicy } from "./admin-identity.policy";

const PRIVILEGED_ROLE_NAMES = ["ADMIN", "SUPER_ADMIN"];

export type AdminIdentityInvariantCode =
  | "OFFICIAL_ACCOUNT_MISSING"
  | "OFFICIAL_ACCOUNT_NOT_ACTIVE"
  | "OFFICIAL_RECOVERY_MISMATCH"
  | "OFFICIAL_PRIVILEGE_MISSING"
  | "UNAUTHORIZED_PRIVILEGED_IDENTITY"
  | "RECOVERY_IDENTITY_EXISTS"
  | "PREFLIGHT_UNAVAILABLE";

export class AdminIdentityInvariantError extends Error {
  constructor(readonly code: AdminIdentityInvariantCode) {
    super(`Administrative identity invariant failed (${code}).`);
    this.name = "AdminIdentityInvariantError";
  }
}

/**
 * Production startup preflight for the closed-system administrator identity.
 * It performs one serializable, read-only snapshot and never repairs data:
 * migrations/backfills must already have completed before the new API starts.
 * NODE_ENV=test skips only the lifecycle hook so narrow unit modules need no
 * database; dedicated tests call verify() explicitly.
 */
@Injectable()
export class AdminIdentityInvariantService implements OnApplicationBootstrap {
  private verifiedAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AdminIdentityPolicy,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get("NODE_ENV", { infer: true }) === "test") return;
    await this.verify();
  }

  async verify(): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const configuredIdentities = await tx.user.findMany({
          where: { email: { in: [this.policy.accountEmail, this.policy.recoveryEmail] } },
          select: {
            email: true,
            recoveryEmail: true,
            status: true,
            roles: { select: { role: { select: { name: true } } } },
          },
        });
        const privilegedUsers = await tx.user.findMany({
          where: { roles: { some: { role: { name: { in: PRIVILEGED_ROLE_NAMES } } } } },
          select: { email: true },
        });

        const official = configuredIdentities.find((user) => this.policy.isPrivilegedAdminEmail(user.email));
        if (!official) throw new AdminIdentityInvariantError("OFFICIAL_ACCOUNT_MISSING");
        if (official.status !== "ACTIVE") throw new AdminIdentityInvariantError("OFFICIAL_ACCOUNT_NOT_ACTIVE");
        if (official.recoveryEmail?.trim().toLowerCase() !== this.policy.recoveryEmail) {
          throw new AdminIdentityInvariantError("OFFICIAL_RECOVERY_MISMATCH");
        }
        const officialRoles = new Set(official.roles.map(({ role }) => role.name));
        if (!PRIVILEGED_ROLE_NAMES.some((roleName) => officialRoles.has(roleName))) {
          throw new AdminIdentityInvariantError("OFFICIAL_PRIVILEGE_MISSING");
        }
        if (privilegedUsers.some((user) => !this.policy.isPrivilegedAdminEmail(user.email))) {
          throw new AdminIdentityInvariantError("UNAUTHORIZED_PRIVILEGED_IDENTITY");
        }
        if (configuredIdentities.some((user) => this.policy.isRecoveryOnlyEmail(user.email))) {
          throw new AdminIdentityInvariantError("RECOVERY_IDENTITY_EXISTS");
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AdminIdentityInvariantError) throw error;
      // Database/serialization errors can contain connection details. Startup
      // still fails closed, but only this stable code crosses the boundary.
      throw new AdminIdentityInvariantError("PREFLIGHT_UNAVAILABLE");
    }
    this.verifiedAt = new Date();
  }

  getStatus(): { status: "VERIFIED" | "NOT_VERIFIED"; verifiedAt: string | null } {
    return {
      status: this.verifiedAt ? "VERIFIED" : "NOT_VERIFIED",
      verifiedAt: this.verifiedAt?.toISOString() ?? null,
    };
  }
}
