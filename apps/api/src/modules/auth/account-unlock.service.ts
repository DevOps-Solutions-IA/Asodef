import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { SecurityEventService } from "../../common/security-events/security-event.service";
import type { RequestContext } from "./auth.service";

const SAFE_FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción.";
const SAFE_REASON_MESSAGE = "Debes indicar un motivo para desbloquear esta cuenta.";
const SAFE_NOT_FOUND_MESSAGE = "Usuario no encontrado.";
const SAFE_CONCURRENT_UPDATE_MESSAGE = "La cuenta cambió durante la operación. Intenta nuevamente.";

export interface AccountUnlockActor {
  actorId: string;
  actorPermissions: string[];
}

export interface AccountUnlockResult {
  applied: boolean;
  /** true when the account was already unlocked - a safe, idempotent
   * no-op, not a failure (US-009: "repeated unlock is safely handled"). */
  alreadyUnlocked?: boolean;
}

export interface AccountUnlockOptions {
  /** Validates everything and reports what *would* happen, without
   * writing anything or recording a security event. */
  preview?: boolean;
}

/**
 * The only supported way to manually clear an account lockout (US-009
 * section 7). Gated by the users.unlock permission (SUPER_ADMIN-only in
 * the current matrix - see rbac-catalog.ts), checked here in addition to
 * whatever route guard a future admin-platform story adds, the same
 * defense-in-depth pattern RoleAssignmentService established in US-008.
 *
 * Deliberately touches only failedLoginAttempts/lockedUntil - never
 * `status`. Unlocking a lockout must never reactivate a SUSPENDED or
 * INACTIVE account (US-009 section 8): a suspended/inactive user stays
 * rejected by AuthService.classifyLoginFailure's status check regardless
 * of lockout state, so there is nothing extra to guard against here -
 * the guarantee is structural (this service has no code path that can
 * write to `status` at all), not a runtime check that could be forgotten.
 */
@Injectable()
export class AccountUnlockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEventService: SecurityEventService,
  ) {}

  async unlockAccount(
    actor: AccountUnlockActor,
    targetUserId: string,
    reason: string,
    context: RequestContext,
    options: AccountUnlockOptions = {},
  ): Promise<AccountUnlockResult> {
    if (!actor.actorPermissions.includes("users.unlock")) {
      await this.securityEventService.record({
        type: "GOVERNANCE_CHANGE_ATTEMPTED",
        userId: actor.actorId,
        actorUserId: actor.actorId,
        result: "DENIED",
        reason: "MISSING_USERS_UNLOCK_PERMISSION",
        requestId: context.requestId,
        correlationId: context.correlationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { action: "unlockAccount", targetUserId, result: "denied" },
      });
      throw new ForbiddenException(SAFE_FORBIDDEN_MESSAGE);
    }

    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException(SAFE_REASON_MESSAGE);
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      await this.securityEventService.record({
        type: "ACCOUNT_UNLOCK_FAILED",
        userId: actor.actorId,
        actorUserId: actor.actorId,
        result: "FAILURE",
        reason: "TARGET_NOT_FOUND",
        requestId: context.requestId,
        correlationId: context.correlationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { targetUserId, reason: "target_not_found" },
      });
      throw new NotFoundException(SAFE_NOT_FOUND_MESSAGE);
    }

    const isCurrentlyLocked = !!target.lockedUntil && target.lockedUntil.getTime() > Date.now();
    if (!isCurrentlyLocked && target.failedLoginAttempts === 0) {
      // Nothing to do - the desired end state already holds. Not a
      // failure, and idempotent: calling this twice in a row is safe.
      if (!options.preview) {
        await this.prisma.$transaction((tx) => this.securityEventService.recordRequired(tx, {
          type: "ADMINISTRATIVE_UNLOCK",
          userId: actor.actorId,
          actorUserId: actor.actorId,
          subjectUserId: targetUserId,
          result: "NO_OP",
          reason,
          requestId: context.requestId,
          correlationId: context.correlationId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { targetUserId, reason, alreadyUnlocked: true },
        }));
      }
      return { applied: false, alreadyUnlocked: true };
    }

    if (options.preview) {
      return { applied: false };
    }

    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: {
          id: targetUserId,
          version: target.version,
          failedLoginAttempts: target.failedLoginAttempts,
          lockedUntil: target.lockedUntil,
        },
        data: { failedLoginAttempts: 0, lockedUntil: null, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException(SAFE_CONCURRENT_UPDATE_MESSAGE);

      await this.securityEventService.recordRequired(tx, {
        type: "ADMINISTRATIVE_UNLOCK",
        userId: actor.actorId,
        actorUserId: actor.actorId,
        subjectUserId: targetUserId,
        result: "SUCCESS",
        reason,
        requestId: context.requestId,
        correlationId: context.correlationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { targetUserId, reason },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { applied: true };
  }
}
