import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { SecurityEventService } from "../../common/security-events/security-event.service";
import { ROLE_NAMES, type RoleName } from "../../database/rbac-catalog";

const SAFE_FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción.";
const SAFE_LAST_SUPER_ADMIN_MESSAGE = "No se puede eliminar el último SUPER_ADMIN de la plataforma.";
const SAFE_SELF_LOCKOUT_MESSAGE = "No puedes quitarte a ti mismo el rol SUPER_ADMIN.";
const SAFE_REASON_MESSAGE = "Debes indicar un motivo para este cambio de gobernanza.";
const SAFE_UNKNOWN_ROLE_MESSAGE = "Rol desconocido.";

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
  ) {}

  async assignRole(
    actor: GovernanceActor,
    targetUserId: string,
    roleName: string,
    reason: string,
    options: RoleChangeOptions = {},
  ): Promise<RoleChangeResult> {
    await this.assertActorIsSuperAdmin(actor, "assignRole", targetUserId, roleName);
    this.assertValidReason(reason);
    const role = await this.assertKnownRole(roleName);

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

    if (applied) {
      await this.securityEventService.record({
        type: "ROLE_ASSIGNED",
        userId: actor.actorId,
        metadata: { targetUserId, roleName, reason },
      });
    }

    return { applied, alreadyAssigned: !applied };
  }

  async removeRole(
    actor: GovernanceActor,
    targetUserId: string,
    roleName: string,
    reason: string,
    options: RoleChangeOptions = {},
  ): Promise<RoleChangeResult> {
    await this.assertActorIsSuperAdmin(actor, "removeRole", targetUserId, roleName);
    this.assertValidReason(reason);
    const role = await this.assertKnownRole(roleName);

    if (roleName === "SUPER_ADMIN") {
      if (actor.actorId === targetUserId) {
        throw new ForbiddenException(SAFE_SELF_LOCKOUT_MESSAGE);
      }
      const targetHasRole = await this.prisma.userRole.findUnique({
        where: { userId_roleId: { userId: targetUserId, roleId: role.id } },
      });
      if (targetHasRole) {
        const superAdminCount = await this.prisma.userRole.count({ where: { roleId: role.id } });
        if (superAdminCount <= 1) {
          throw new ConflictException(SAFE_LAST_SUPER_ADMIN_MESSAGE);
        }
      }
    }

    if (options.preview) {
      return { applied: false };
    }

    const result = await this.prisma.userRole.deleteMany({ where: { userId: targetUserId, roleId: role.id } });
    if (result.count === 0) {
      return { applied: false, alreadyAbsent: true };
    }

    await this.securityEventService.record({
      type: "ROLE_REMOVED",
      userId: actor.actorId,
      metadata: { targetUserId, roleName, reason },
    });

    return { applied: true };
  }

  private async assertActorIsSuperAdmin(
    actor: GovernanceActor,
    action: string,
    targetUserId: string,
    roleName: string,
  ): Promise<void> {
    if (actor.actorRoles.includes("SUPER_ADMIN")) return;

    await this.securityEventService.record({
      type: "GOVERNANCE_CHANGE_ATTEMPTED",
      userId: actor.actorId,
      metadata: { action, targetUserId, roleName, result: "denied" },
    });
    throw new ForbiddenException(SAFE_FORBIDDEN_MESSAGE);
  }

  private assertValidReason(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException(SAFE_REASON_MESSAGE);
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
