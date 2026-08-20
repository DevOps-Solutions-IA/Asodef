import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { SecurityEventService } from "../../common/security-events/security-event.service";
import { ROLE_NAMES, type RoleName } from "../../database/rbac-catalog";
import { AdminIdentityPolicy, AdminIdentityPolicyViolation } from "../auth/admin-identity.policy";
import type { RequestContext } from "../auth/auth.service";

const SAFE_FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción.";
const SAFE_LAST_SUPER_ADMIN_MESSAGE = "No se puede eliminar el último SUPER_ADMIN de la plataforma.";
const SAFE_SELF_LOCKOUT_MESSAGE = "No puedes quitarte a ti mismo el rol SUPER_ADMIN.";
const SAFE_REASON_MESSAGE = "Debes indicar un motivo para este cambio de gobernanza.";
const SAFE_UNKNOWN_ROLE_MESSAGE = "Rol desconocido.";
const SAFE_ADMIN_IDENTITY_MESSAGE = "La operación viola la política de identidad administrativa protegida.";

export interface GovernanceActor {
  actorId: string;
  actorRoles: string[];
}

export interface RoleChangeResult {
  /** false for a preview/dry-run, or when the change was already a no-op
   * (role already assigned / already absent). */
  applied: boolean;
  alreadyAssigned?: boolean;
  alreadyAbsent?: boolean;
}

export interface RoleChangeOptions {
  /** Validates everything (actor authority, role existence, final-
   * SUPER_ADMIN/self-lockout guards) and reports what *would* happen,
   * without writing anything or recording a security event - the "dry
   * run" support required for a future high-risk admin UI (US-008
   * section 10). */
  preview?: boolean;
  context?: RequestContext;
}

/**
 * The only supported way to change which roles a user holds (US-008
 * section 10). Deliberately does not expose any role/permission
 * *catalog* mutation (creating/deleting a Role or Permission, or
 * changing a Role's permission set) - that catalog is code-defined via
 * rbac-catalog.ts and seeded, never runtime-mutable, which is what
 * prevents the "deletion of a role/permission currently in use" risk
 * section 7 warns about: the capability to delete one simply does not
 * exist anywhere in this service.
 */
@Injectable()
export class RoleAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEventService: SecurityEventService,
    private readonly adminIdentityPolicy: AdminIdentityPolicy,
  ) {}

  /** Transaction-aware initial assignment used by account provisioning.
   * The caller owns the transaction containing the User row, reset token,
   * outbox job and USER_CREATED event. This preserves the same role catalog
   * and protected-admin policy without opening a nested transaction. */
  async assignInitialRolesRequired(
    tx: Prisma.TransactionClient,
    actor: GovernanceActor,
    targetUserId: string,
    targetEmail: string,
    roleNames: readonly string[],
    reason: string,
    context: RequestContext = {},
  ): Promise<void> {
    if (roleNames.length === 0) return;
    await this.assertActorIsSuperAdmin(actor, "assignInitialRoles", targetUserId, roleNames.join(","), context);
    this.assertValidReason(reason);
    for (const roleName of roleNames) {
      if (!ROLE_NAMES.includes(roleName as RoleName)) throw new BadRequestException(SAFE_UNKNOWN_ROLE_MESSAGE);
      this.assertAdminIdentityPolicy(() => this.adminIdentityPolicy.assertMayHoldPrivilegedRole(targetEmail, roleName));
      const role = await tx.role.findUnique({ where: { name: roleName } });
      if (!role) throw new BadRequestException(SAFE_UNKNOWN_ROLE_MESSAGE);
      await tx.userRole.create({ data: { userId: targetUserId, roleId: role.id } });
      await this.securityEventService.recordRequired(tx, {
        type: "ROLE_ASSIGNED",
        userId: actor.actorId,
        actorUserId: actor.actorId,
        subjectUserId: targetUserId,
        result: "SUCCESS",
        reason,
        requestId: context.requestId,
        correlationId: context.correlationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { targetUserId, roleName, reason },
      });
    }
  }

  async assignRole(
    actor: GovernanceActor,
    targetUserId: string,
    roleName: string,
    reason: string,
    options: RoleChangeOptions = {},
  ): Promise<RoleChangeResult> {
    await this.assertActorIsSuperAdmin(actor, "assignRole", targetUserId, roleName, options.context);
    this.assertValidReason(reason);
    const role = await this.assertKnownRole(roleName);
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true } });
    if (!target) throw new BadRequestException(SAFE_FORBIDDEN_MESSAGE);
    this.assertAdminIdentityPolicy(() => this.adminIdentityPolicy.assertMayHoldPrivilegedRole(target.email, roleName));

    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId: targetUserId, roleId: role.id } },
    });
    if (existing) {
      return { applied: false, alreadyAssigned: true };
    }

    if (options.preview) {
      return { applied: false };
    }

    const applied = await this.prisma
      .$transaction(async (tx) => {
        await tx.userRole.create({ data: { userId: targetUserId, roleId: role.id } });
        await this.securityEventService.recordRequired(tx, {
          type: "ROLE_ASSIGNED",
          userId: actor.actorId,
          actorUserId: actor.actorId,
          subjectUserId: targetUserId,
          result: "SUCCESS",
          reason,
          requestId: options.context?.requestId,
          correlationId: options.context?.correlationId,
          ipAddress: options.context?.ipAddress,
          userAgent: options.context?.userAgent,
          metadata: { targetUserId, roleName, reason },
        });
        return true;
      })
      .catch((error: unknown) => {
        // Lost a race with a concurrent identical assignment - the
        // unique (userId, roleId) primary key already protects against
        // a duplicate row, so treat this as a safe no-op rather than a
        // 500. Any other error still propagates.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return false;
        }
        throw error;
      });

    return { applied, alreadyAssigned: !applied };
  }

  async removeRole(
    actor: GovernanceActor,
    targetUserId: string,
    roleName: string,
    reason: string,
    options: RoleChangeOptions = {},
  ): Promise<RoleChangeResult> {
    await this.assertActorIsSuperAdmin(actor, "removeRole", targetUserId, roleName, options.context);
    this.assertValidReason(reason);
    const role = await this.assertKnownRole(roleName);
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true } });
    if (!target) throw new BadRequestException(SAFE_FORBIDDEN_MESSAGE);
    this.assertAdminIdentityPolicy(() => this.adminIdentityPolicy.assertMayRemoveRole(target.email, roleName));

    if (roleName === "SUPER_ADMIN" && actor.actorId === targetUserId) {
      throw new ForbiddenException(SAFE_SELF_LOCKOUT_MESSAGE);
    }

    if (options.preview) {
      if (roleName === "SUPER_ADMIN") {
        await this.assertSuperAdminRemovalIsSafe(this.prisma, targetUserId, role.id);
      }
      return { applied: false };
    }

    const removed = await this.removeRoleAtomically(actor.actorId, targetUserId, role.id, roleName, reason, options.context);
    if (!removed) {
      return { applied: false, alreadyAbsent: true };
    }

    return { applied: true };
  }

  /** Locks the shared SUPER_ADMIN role row before count+delete. Every
   * concurrent removal of this invariant participates in the same lock,
   * so two callers can no longer both observe count=2 and remove both
   * assignments. */
  private async removeRoleAtomically(
    actorId: string,
    targetUserId: string,
    roleId: string,
    roleName: string,
    reason: string,
    context: RequestContext = {},
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        if (roleName === "SUPER_ADMIN") {
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "roles" WHERE "id" = ${roleId}::uuid FOR UPDATE`);
          await this.assertSuperAdminRemovalIsSafe(tx, targetUserId, roleId);
        }
        const result = await tx.userRole.deleteMany({ where: { userId: targetUserId, roleId } });
        if (result.count !== 1) return false;
        await this.securityEventService.recordRequired(tx, {
          type: "ROLE_REMOVED",
          userId: actorId,
          actorUserId: actorId,
          subjectUserId: targetUserId,
          result: "SUCCESS",
          reason,
          requestId: context.requestId,
          correlationId: context.correlationId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { targetUserId, roleName, reason },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertSuperAdminRemovalIsSafe(
    client: Pick<Prisma.TransactionClient, "userRole">,
    targetUserId: string,
    roleId: string,
  ): Promise<void> {
    const targetHasRole = await client.userRole.findUnique({
      where: { userId_roleId: { userId: targetUserId, roleId } },
    });
    if (!targetHasRole) return;

    const superAdminCount = await client.userRole.count({ where: { roleId } });
    if (superAdminCount <= 1) {
      throw new ConflictException(SAFE_LAST_SUPER_ADMIN_MESSAGE);
    }
  }

  private async assertActorIsSuperAdmin(
    actor: GovernanceActor,
    action: string,
    targetUserId: string,
    roleName: string,
    context: RequestContext = {},
  ): Promise<void> {
    if (actor.actorRoles.includes("SUPER_ADMIN")) return;

    await this.securityEventService.record({
      type: "GOVERNANCE_CHANGE_ATTEMPTED",
      userId: actor.actorId,
      actorUserId: actor.actorId,
      subjectUserId: targetUserId,
      result: "DENIED",
      requestId: context.requestId,
      correlationId: context.correlationId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { action, targetUserId, roleName, result: "denied" },
    });
    throw new ForbiddenException(SAFE_FORBIDDEN_MESSAGE);
  }

  private assertValidReason(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException(SAFE_REASON_MESSAGE);
    }
  }

  private assertAdminIdentityPolicy(assertion: () => void): void {
    try {
      assertion();
    } catch (error) {
      if (error instanceof AdminIdentityPolicyViolation) {
        throw new ConflictException(SAFE_ADMIN_IDENTITY_MESSAGE);
      }
      throw error;
    }
  }

  private async assertKnownRole(roleName: string): Promise<{ id: string; name: string }> {
    if (!ROLE_NAMES.includes(roleName as RoleName)) {
      throw new BadRequestException(SAFE_UNKNOWN_ROLE_MESSAGE);
    }
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new BadRequestException(SAFE_UNKNOWN_ROLE_MESSAGE);
    }
    return role;
  }
}
