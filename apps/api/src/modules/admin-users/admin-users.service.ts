import { randomBytes } from "node:crypto";
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { SecurityEventService } from "../../common/security-events/security-event.service";
import { SessionService } from "../auth/session.service";
import { PasswordService } from "../auth/password.service";
import { PasswordResetTokenService } from "../auth/password-reset-token.service";
import { AccountUnlockService, type AccountUnlockResult } from "../auth/account-unlock.service";
import { RoleAssignmentService, type RoleChangeResult } from "../governance/role-assignment.service";
import { NotificationService } from "../notifications/notification.service";
import { ROLE_NAMES, type RoleName } from "../../database/rbac-catalog";
import type { RequestContext } from "../auth/auth.service";
import type { RequestUser } from "../auth/types/request-user.type";
import type { ListUsersQueryDto } from "./dto/list-users-query.dto";
import type { CreateUserDto } from "./dto/create-user.dto";
import type { UpdateUserDto } from "./dto/update-user.dto";
import type { RevokeSessionDto } from "./dto/revoke-session.dto";
import type { RoleChangeDto } from "./dto/role-change.dto";
import type { SecurityEventsQueryDto } from "./dto/security-events-query.dto";
import {
  toAdminUserDetail,
  toAdminUserSummary,
  toAdminSessionSummary,
  toAdminSecurityEventSummary,
  type AdminUserDetail,
  type AdminUserListResponse,
  type AdminSessionSummary,
  type AdminSecurityEventListResponse,
  type AdminUserRolesResponse,
  type AdminUserStats,
} from "./admin-users.types";
import type { EnvConfig } from "../../config/env.validation";
import { AdminIdentityPolicy, AdminIdentityPolicyViolation } from "../auth/admin-identity.policy";

const SAFE_NOT_FOUND_MESSAGE = "Usuario no encontrado.";
const SAFE_FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción.";
const SAFE_DUPLICATE_EMAIL_MESSAGE = "Ya existe un usuario con este correo electrónico.";
const SAFE_CONCURRENT_UPDATE_MESSAGE = "Este usuario fue modificado por otra persona. Recarga e intenta de nuevo.";
const SAFE_SELF_DEACTIVATE_MESSAGE = "No puedes desactivar tu propia cuenta.";
const SAFE_SUSPENDED_MESSAGE = "No se puede reactivar una cuenta suspendida por esta vía.";
const SAFE_SELF_ROLE_CREATE_MESSAGE = "Solo un SUPER_ADMIN puede asignar roles al crear un usuario.";
const SAFE_SELF_SESSION_MESSAGE = "No puedes revocar tu sesión actual desde aquí. Usa cerrar sesión.";
const SAFE_SESSION_NOT_FOUND_MESSAGE = "Sesión no encontrada o ya revocada.";
const SAFE_ADMIN_IDENTITY_MESSAGE = "La operación viola la política de identidad administrativa protegida.";

/** Holds SUPER_ADMIN or ADMIN - see US-011 section 3: "lower-privileged
 * users must not manage higher-privileged users." */
const PRIVILEGED_ROLES = ["SUPER_ADMIN", "ADMIN"];

type UserWithRoles = Prisma.UserGetPayload<{ include: { roles: { include: { role: true } } } }>;

const USER_WITH_ROLES_INCLUDE = { roles: { include: { role: true } } } as const;

/**
 * Production user-administration domain (US-011). Deliberately does not
 * reimplement any safety rule that already lives elsewhere:
 * RoleAssignmentService remains the only code path that ever writes a
 * UserRole row (final-SUPER_ADMIN/self-lockout/SUPER_ADMIN-only actor
 * checks - US-008), AccountUnlockService remains the only code path that
 * clears a lockout (users.unlock permission check - US-009), and
 * SessionService remains the only code path that revokes a session.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEventService: SecurityEventService,
    private readonly sessionService: SessionService,
    private readonly passwordService: PasswordService,
    private readonly passwordResetTokenService: PasswordResetTokenService,
    private readonly accountUnlockService: AccountUnlockService,
    private readonly roleAssignmentService: RoleAssignmentService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly adminIdentityPolicy: AdminIdentityPolicy,
  ) {}

  async listUsers(query: ListUsersQueryDto): Promise<AdminUserListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.UserWhereInput = {};
    if (query.search && query.search.trim().length > 0) {
      const search = query.search.trim();
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { fullName: { contains: search, mode: "insensitive" } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.role) {
      where.roles = { some: { role: { name: query.role } } };
    }

    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: USER_WITH_ROLES_INCLUDE,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: rows.map(toAdminUserSummary), total, page, pageSize };
  }

  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    const user = await this.findUserWithRolesOrThrow(userId);
    return this.buildDetail(user);
  }

  /** Real aggregate counts for the admin dashboard summary (US-011
   * section 13) - a handful of fast COUNT queries, never a full unbounded
   * user listing. Gated by the same users.read permission as the list/
   * detail views, since it's just an aggregate view of the same data. */
  async getStats(): Promise<AdminUserStats> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [totalUsers, activeUsers, inactiveUsers, suspendedUsers, lockedUsers, recentLoginFailures24h, activeSessions] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { status: "ACTIVE" } }),
        this.prisma.user.count({ where: { status: "INACTIVE" } }),
        this.prisma.user.count({ where: { status: "SUSPENDED" } }),
        this.prisma.user.count({ where: { lockedUntil: { gt: now } } }),
        this.prisma.loginAttempt.count({ where: { success: false, createdAt: { gt: oneDayAgo } } }),
        this.prisma.session.count({ where: { revokedAt: null, rotatedAt: null, expiresAt: { gt: now } } }),
      ]);

    return { totalUsers, activeUsers, inactiveUsers, suspendedUsers, lockedUsers, recentLoginFailures24h, activeSessions };
  }

  /**
   * Creates the account with an unusable, never-disclosed random
   * password hash, then queues a one-time setup link through the
   * existing PasswordReset/notification infrastructure (US-011 section
   * 6, onboarding option A). Initial roles are only ever written via
   * RoleAssignmentService, which independently enforces its own
   * SUPER_ADMIN-only authority check - an ordinary ADMIN requesting
   * initial roles is rejected before any row is written.
   */
  async createUser(actor: RequestUser, dto: CreateUserDto, context: RequestContext): Promise<AdminUserDetail> {
    if (dto.roles && dto.roles.length > 0 && !actor.roles.includes("SUPER_ADMIN")) {
      throw new ForbiddenException(SAFE_SELF_ROLE_CREATE_MESSAGE);
    }

    // Discarded immediately after hashing - never logged, never
    // returned, never derivable by anyone (US-011 section 6: "do not
    // create known default passwords").
    const unusablePassword = randomBytes(32).toString("hex");
    const passwordHash = await this.passwordService.hash(unusablePassword);

    this.assertAdminIdentityPolicy(() => this.adminIdentityPolicy.assertMayChangePrivilegedEmail(dto.email, dto.email));

    let user: Prisma.UserGetPayload<Record<string, never>>;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: dto.email,
            recoveryEmail: this.adminIdentityPolicy.isPrivilegedAdminEmail(dto.email)
              ? this.adminIdentityPolicy.recoveryEmail
              : null,
            fullName: dto.fullName,
            passwordHash,
            status: "ACTIVE",
          },
        });

        await this.roleAssignmentService.assignInitialRolesRequired(
          tx,
          { actorId: actor.id, actorRoles: actor.roles },
          created.id,
          created.email,
          dto.roles ?? [],
          "Asignación inicial al crear el usuario",
        );

        await this.securityEventService.recordRequired(tx, {
          type: "USER_CREATED",
          userId: actor.id,
          actorUserId: actor.id,
          subjectUserId: created.id,
          result: "SUCCESS",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
          correlationId: context.correlationId,
          metadata: { targetUserId: created.id, email: created.email, roles: (dto.roles ?? []).join(","), outcome: "success" },
        });

        const { passwordReset, rawToken } = await this.passwordResetTokenService.createToken(created.id, context, tx);
        await this.notificationService.queueAccountInvitationEmailRequired(tx, {
          recipientEmail: created.email,
          userId: created.id,
          fullName: created.fullName,
          setupUrl: this.buildSetupUrl(rawToken),
          correlationId: context.requestId ?? passwordReset.id,
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(SAFE_DUPLICATE_EMAIL_MESSAGE);
      }
      throw error;
    }

    return this.getUserDetail(user.id);
  }

  async updateUser(actor: RequestUser, targetUserId: string, dto: UpdateUserDto, context: RequestContext): Promise<AdminUserDetail> {
    const target = await this.findUserWithRolesOrThrow(targetUserId);
    this.assertActorMayManageTarget(actor.id, target.id, actor.roles, this.roleNamesOf(target));
    this.assertAdminIdentityPolicy(() => {
      this.adminIdentityPolicy.assertMayChangePrivilegedEmail(target.email, dto.email ?? target.email);
      this.adminIdentityPolicy.assertMayChangePrivilegedRecovery(target.email, target.recoveryEmail);
    });

    if (dto.expectedVersion !== undefined && target.version !== dto.expectedVersion) {
      throw new ConflictException(SAFE_CONCURRENT_UPDATE_MESSAGE);
    }
    if (dto.expectedUpdatedAt) {
      const expected = new Date(dto.expectedUpdatedAt).getTime();
      if (target.updatedAt.getTime() !== expected) {
        throw new ConflictException(SAFE_CONCURRENT_UPDATE_MESSAGE);
      }
    }

    const before = { email: target.email, fullName: target.fullName };
    const data: Prisma.UserUpdateManyMutationInput = { version: { increment: 1 } };
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.email !== undefined) data.email = dto.email;

    try {
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.user.updateMany({
          where: {
            id: targetUserId,
            version: target.version,
            ...(dto.expectedUpdatedAt ? { updatedAt: new Date(dto.expectedUpdatedAt) } : {}),
          },
          data,
        });
        if (result.count !== 1) {
          throw new ConflictException(SAFE_CONCURRENT_UPDATE_MESSAGE);
        }
        const persisted = await tx.user.findUniqueOrThrow({ where: { id: targetUserId } });
        await this.securityEventService.recordRequired(tx, {
          type: "USER_UPDATED",
          userId: actor.id,
          actorUserId: actor.id,
          subjectUserId: targetUserId,
          result: "SUCCESS",
          reason: dto.reason,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
          correlationId: context.correlationId,
          metadata: {
            targetUserId,
            reason: dto.reason,
            before: JSON.stringify(before),
            after: JSON.stringify({ email: persisted.email, fullName: persisted.fullName }),
            outcome: "success",
          },
        });
        return persisted;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(SAFE_DUPLICATE_EMAIL_MESSAGE);
      }
      throw error;
    }

    return this.getUserDetail(targetUserId);
  }

  async deactivateUser(actor: RequestUser, targetUserId: string, reason: string, context: RequestContext): Promise<AdminUserDetail> {
    if (actor.id === targetUserId) {
      throw new ForbiddenException(SAFE_SELF_DEACTIVATE_MESSAGE);
    }

    const target = await this.findUserWithRolesOrThrow(targetUserId);
    this.assertActorMayManageTarget(actor.id, target.id, actor.roles, this.roleNamesOf(target));
    this.assertAdminIdentityPolicy(() => this.adminIdentityPolicy.assertMayDeactivate(target.email));

    if (target.status === "INACTIVE") {
      return this.buildDetail(target);
    }

    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: targetUserId, status: target.status, version: target.version },
        data: { status: "INACTIVE", version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException(SAFE_CONCURRENT_UPDATE_MESSAGE);
      await this.sessionService.revokeUsableSessionsForUser(targetUserId, "ADMIN_ACTION", tx);
      await this.securityEventService.recordRequired(tx, {
        type: "USER_DEACTIVATED",
        userId: actor.id,
        actorUserId: actor.id,
        subjectUserId: targetUserId,
        result: "SUCCESS",
        reason,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        correlationId: context.correlationId,
        metadata: { targetUserId, reason, outcome: "success" },
      });
    });

    return this.getUserDetail(targetUserId);
  }

  async reactivateUser(actor: RequestUser, targetUserId: string, reason: string, context: RequestContext): Promise<AdminUserDetail> {
    const target = await this.findUserWithRolesOrThrow(targetUserId);
    this.assertActorMayManageTarget(actor.id, target.id, actor.roles, this.roleNamesOf(target));

    if (target.status === "SUSPENDED") {
      throw new ConflictException(SAFE_SUSPENDED_MESSAGE);
    }
    if (target.status === "ACTIVE") {
      return this.buildDetail(target);
    }

    // Deliberately does not touch sessions - every session was already
    // revoked at deactivation time and stays revoked (US-011 section 8:
    // "not automatically restore previous sessions").
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: targetUserId, status: "INACTIVE", version: target.version },
        data: { status: "ACTIVE", version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException(SAFE_CONCURRENT_UPDATE_MESSAGE);
      await this.securityEventService.recordRequired(tx, {
        type: "USER_REACTIVATED",
        userId: actor.id,
        actorUserId: actor.id,
        subjectUserId: targetUserId,
        result: "SUCCESS",
        reason,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        correlationId: context.correlationId,
        metadata: { targetUserId, reason, outcome: "success" },
      });
    });

    return this.getUserDetail(targetUserId);
  }

  async unlockUser(actor: RequestUser, targetUserId: string, reason: string, context: RequestContext): Promise<AccountUnlockResult> {
    return this.accountUnlockService.unlockAccount(
      { actorId: actor.id, actorPermissions: actor.permissions },
      targetUserId,
      reason,
      context,
    );
  }

  async getRoles(targetUserId: string): Promise<AdminUserRolesResponse> {
    const target = await this.findUserWithRolesOrThrow(targetUserId);
    return { assigned: this.roleNamesOf(target), available: [...ROLE_NAMES] };
  }

  async assignRole(actor: RequestUser, targetUserId: string, dto: RoleChangeDto): Promise<RoleChangeResult> {
    return this.roleAssignmentService.assignRole(
      { actorId: actor.id, actorRoles: actor.roles },
      targetUserId,
      dto.roleName,
      dto.reason,
      { preview: dto.preview },
    );
  }

  async removeRole(actor: RequestUser, targetUserId: string, dto: RoleChangeDto): Promise<RoleChangeResult> {
    return this.roleAssignmentService.removeRole(
      { actorId: actor.id, actorRoles: actor.roles },
      targetUserId,
      dto.roleName,
      dto.reason,
      { preview: dto.preview },
    );
  }

  async listSessions(actor: RequestUser, targetUserId: string): Promise<AdminSessionSummary[]> {
    await this.findUserWithRolesOrThrow(targetUserId);
    const sessions = await this.sessionService.listSessionsForUser(targetUserId);
    return sessions.map((session) => toAdminSessionSummary(session, actor.sessionId));
  }

  async revokeSessions(
    actor: RequestUser,
    targetUserId: string,
    dto: RevokeSessionDto,
    context: RequestContext,
  ): Promise<{ revokedCount: number }> {
    const target = await this.findUserWithRolesOrThrow(targetUserId);
    this.assertActorMayManageTarget(actor.id, target.id, actor.roles, this.roleNamesOf(target));

    if (dto.sessionId) {
      if (dto.sessionId === actor.sessionId && targetUserId === actor.id) {
        throw new ForbiddenException(SAFE_SELF_SESSION_MESSAGE);
      }
      await this.prisma.$transaction(async (tx) => {
        const revoked = await this.sessionService.revokeUsableSessionForUser(
          dto.sessionId!, targetUserId, "ADMIN_ACTION", tx,
        );
        if (!revoked) throw new NotFoundException(SAFE_SESSION_NOT_FOUND_MESSAGE);
        await this.securityEventService.recordRequired(tx, {
          type: "SESSION_REVOKED",
          userId: targetUserId,
          actorUserId: actor.id,
          subjectUserId: targetUserId,
          sessionId: dto.sessionId,
          result: "SUCCESS",
          reason: dto.reason,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
          correlationId: context.correlationId,
          metadata: { reason: dto.reason, actorId: actor.id, source: "admin" },
        });
      });
      return { revokedCount: 1 };
    }

    // Revoking "all sessions" for one's own account must never revoke the
    // acting administrator's own current session by accident (US-011
    // section 10) - preserve it automatically via the same
    // exclude-current-session primitive change-password already uses,
    // rather than requiring a separate confirmation flag.
    const revokedCount = await this.prisma.$transaction(async (tx) => {
      const count = await this.sessionService.revokeUsableSessionsForUser(
        targetUserId,
        "ADMIN_ACTION",
        tx,
        targetUserId === actor.id ? actor.sessionId : undefined,
      );
      await this.securityEventService.recordRequired(tx, {
        type: "SESSION_REVOKED",
        userId: targetUserId,
        actorUserId: actor.id,
        subjectUserId: targetUserId,
        result: "SUCCESS",
        reason: dto.reason,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        correlationId: context.correlationId,
        metadata: { reason: dto.reason, actorId: actor.id, source: "admin", scope: "all", revokedCount: count },
      });
      return count;
    });
    return { revokedCount };
  }

  async listSecurityEvents(targetUserId: string, query: SecurityEventsQueryDto): Promise<AdminSecurityEventListResponse> {
    await this.findUserWithRolesOrThrow(targetUserId);

    const result = await this.securityEventService.findForUser(targetUserId, {
      type: query.type,
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
      requestId: query.requestId,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: result.items.map(toAdminSecurityEventSummary),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  private async findUserWithRolesOrThrow(userId: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: USER_WITH_ROLES_INCLUDE });
    if (!user) {
      throw new NotFoundException(SAFE_NOT_FOUND_MESSAGE);
    }
    return user;
  }

  private async buildDetail(user: UserWithRoles): Promise<AdminUserDetail> {
    const [permissions, sessions] = await Promise.all([
      this.getEffectivePermissions(this.roleNamesOf(user)),
      this.sessionService.listSessionsForUser(user.id),
    ]);
    const activeSessionCount = sessions.filter(
      (session) => !session.revokedAt && !session.rotatedAt && session.expiresAt.getTime() > Date.now(),
    ).length;
    return toAdminUserDetail(user, permissions, activeSessionCount);
  }

  private async getEffectivePermissions(roleNames: string[]): Promise<string[]> {
    if (roleNames.length === 0) return [];
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { role: { name: { in: roleNames } } },
      include: { permission: true },
    });
    return [...new Set(rolePermissions.map((rp) => rp.permission.key))];
  }

  private roleNamesOf(user: UserWithRoles): string[] {
    return user.roles.map((r) => r.role.name);
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

  /** US-011 section 3: lower-privileged actors (anyone without
   * SUPER_ADMIN) must not manage a *different* target holding a
   * privileged role - this is a distinct concern from
   * RoleAssignmentService's own rules (which govern *changing* roles,
   * not editing/deactivating a user's profile or revoking their
   * sessions) and is enforced here for exactly that reason. Exempts
   * self-action: an ADMIN editing their own profile or revoking their
   * own sessions is not "managing a higher-privileged user" - they
   * already hold exactly their own privilege level, so there is no
   * escalation risk to guard against. */
  private assertActorMayManageTarget(actorId: string, targetUserId: string, actorRoles: string[], targetRoles: string[]): void {
    if (actorId === targetUserId) return;
    const targetIsPrivileged = targetRoles.some((role) => PRIVILEGED_ROLES.includes(role));
    if (targetIsPrivileged && !actorRoles.includes("SUPER_ADMIN")) {
      throw new ForbiddenException(SAFE_FORBIDDEN_MESSAGE);
    }
  }

  private buildOrderBy(sortBy: string | undefined, sortOrder: "asc" | "desc" | undefined): Prisma.UserOrderByWithRelationInput {
    const direction = sortOrder ?? "desc";
    switch (sortBy) {
      case "email":
        return { email: direction };
      case "lastLoginAt":
        return { lastLoginAt: direction };
      case "status":
        return { status: direction };
      case "createdAt":
      default:
        return { createdAt: direction };
    }
  }

  private buildSetupUrl(rawToken: string): string {
    const base = this.configService.get("PUBLIC_APP_URL", { infer: true });
    return `${base}/restablecer-clave?token=${encodeURIComponent(rawToken)}`;
  }
}

/** Re-exported so callers (e.g. the controller) can type-check role names
 * against the same catalog without a second import path. */
export type { RoleName };
