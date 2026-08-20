import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "../auth/password.service";
import { RedisService } from "../../common/redis/redis.service";
import type { User } from "@prisma/client";
import { AdminUsersService } from "./admin-users.service";
import type { RequestUser } from "../auth/types/request-user.type";
import { SecurityEventService } from "../../common/security-events/security-event.service";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("Admin users endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let adminUsersService: AdminUsersService;
  let securityEventService: SecurityEventService;
  const createdUserIds: string[] = [];

  // Shared actors, logged in exactly once each (see the beforeAll doc
  // comment below for why this matters) - most tests only need "an
  // ADMIN" / "a SUPER_ADMIN" acting, not a *unique* one, since the thing
  // under test is almost always the (fresh, per-test) *target* user, not
  // the actor's own identity.
  let sharedAdmin: { user: User; cookies: string[] };
  let sharedSuperAdmin: { user: User; cookies: string[] };
  let sharedNoPermActor: { user: User; cookies: string[] };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);
    adminUsersService = app.get(AdminUsersService);
    securityEventService = app.get(SecurityEventService);

    // Same rationale as auth.controller.integration.spec.ts: clear any
    // residual IP-keyed login-rate-limit counter once at the start, so
    // this file's own (small, now-shared-actor-based) login volume never
    // starts from an already-shadowed count. Deliberately NOT repeated in
    // a beforeEach: Redis is a real, shared, external resource - clearing
    // it mid-run would race with and corrupt any *other* test file that's
    // concurrently relying on its own login-rate-limit counter (e.g.
    // auth.service.integration.spec.ts's rate-limit tests), which is
    // exactly the bug this comment replaces.
    const redisClient = app.get(RedisService).getClient();
    const loginKeys = await redisClient.keys("ratelimit:login:*");
    if (loginKeys.length > 0) {
      await redisClient.del(...loginKeys);
    }

    sharedAdmin = await createActor("ADMIN");
    sharedSuperAdmin = await createActor("SUPER_ADMIN");
    sharedNoPermActor = await createActor("CUSTOMER");
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(overrides: Partial<{ email: string; fullName: string; status: "ACTIVE" | "INACTIVE" | "SUSPENDED" }> = {}): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: overrides.email ?? `admin-users-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: overrides.fullName ?? "Admin Test User",
        status: overrides.status ?? "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function assignRole(userId: string, roleName: string): Promise<void> {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });
  }

  async function loginAs(user: User): Promise<string[]> {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: user.email, password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    // These endpoint tests exercise user-management behavior, not the MFA
    // ceremony (covered end-to-end in step-up-flow.integration.spec.ts).
    // Establish server-side assurance explicitly so critical-route guards
    // do not shadow the domain assertion each test is intended to make.
    const assuredAt = new Date();
    await prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null, rotatedAt: null },
      data: { mfaVerifiedAt: assuredAt, recentAuthenticationAt: assuredAt },
    });
    const raw = response.headers["set-cookie"];
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  }

  /** Creates a user *and* logs them in - only for tests that genuinely
   * need a fresh, unique actor identity (e.g. two distinct ADMINs for a
   * hierarchy check). Prefer the shared actors above otherwise, to keep
   * this file's total login volume low. */
  async function createActor(roleName: string): Promise<{ user: User; cookies: string[] }> {
    const user = await createUser();
    await assignRole(user.id, roleName);
    const cookies = await loginAs(user);
    return { user, cookies };
  }

  /** Creates a user with a role, purely as a passive *target* - never
   * logs them in, since most tests only need the target to exist, not to
   * have an active session of their own. */
  async function createTargetWithRole(roleName: string): Promise<User> {
    const user = await createUser();
    await assignRole(user.id, roleName);
    return user;
  }

  /** A syntactically valid but non-existent actor forces the mandatory
   * SecurityEvent FK write to fail, proving the surrounding transaction
   * rolls its business mutation back. */
  function nonexistentSuperAdminActor(): RequestUser {
    return {
      id: randomUUID(),
      email: "transaction-test@example.com",
      fullName: "Transaction Test Actor",
      status: "ACTIVE",
      roles: ["SUPER_ADMIN"],
      permissions: ["users.manage"],
      sessionId: randomUUID(),
    };
  }

  function existingSuperAdminActor(): RequestUser {
    return {
      id: sharedSuperAdmin.user.id,
      email: sharedSuperAdmin.user.email,
      fullName: sharedSuperAdmin.user.fullName,
      status: sharedSuperAdmin.user.status,
      roles: ["SUPER_ADMIN"],
      permissions: ["users.manage"],
      sessionId: randomUUID(),
    };
  }

  describe("GET /api/v1/admin/users", () => {
    it("returns a bounded, paginated list and rejects an actor without users.read", async () => {
      const adminCookies = sharedAdmin.cookies;
      const marker = randomUUID();
      for (let i = 0; i < 3; i++) {
        await createUser({ fullName: `Pagination Marker ${marker} ${i}` });
      }

      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/users?search=${encodeURIComponent(marker)}&pageSize=2&page=1`)
        .set("Cookie", adminCookies);

      expect(response.status).toBe(200);
      expect(response.body.items.length).toBe(2);
      expect(response.body.total).toBe(3);
      expect(response.body.page).toBe(1);
      expect(response.body.pageSize).toBe(2);

      const noPermCookies = sharedNoPermActor.cookies;
      const denied = await request(app.getHttpServer()).get("/api/v1/admin/users").set("Cookie", noPermCookies);
      expect(denied.status).toBe(403);
    });

    it("filters by status and by role", async () => {
      const adminCookies = sharedAdmin.cookies;
      const marker = randomUUID();
      const inactiveUser = await createUser({ fullName: `Status Filter ${marker}`, status: "INACTIVE" });
      const activeUser = await createUser({ fullName: `Status Filter ${marker}` });
      await assignRole(activeUser.id, "AUDITOR");

      const inactiveResponse = await request(app.getHttpServer())
        .get(`/api/v1/admin/users?search=${encodeURIComponent(marker)}&status=INACTIVE`)
        .set("Cookie", adminCookies);
      expect(inactiveResponse.body.items.map((u: { id: string }) => u.id)).toEqual([inactiveUser.id]);

      const roleResponse = await request(app.getHttpServer())
        .get(`/api/v1/admin/users?search=${encodeURIComponent(marker)}&role=AUDITOR`)
        .set("Cookie", adminCookies);
      expect(roleResponse.body.items.map((u: { id: string }) => u.id)).toEqual([activeUser.id]);
    });

    it("sorts by email ascending/descending", async () => {
      const adminCookies = sharedAdmin.cookies;
      const marker = randomUUID();
      const first = await createUser({ email: `a-${marker}@example.com`, fullName: `Sort Marker ${marker}` });
      const second = await createUser({ email: `z-${marker}@example.com`, fullName: `Sort Marker ${marker}` });

      const asc = await request(app.getHttpServer())
        .get(`/api/v1/admin/users?search=${encodeURIComponent(marker)}&sortBy=email&sortOrder=asc`)
        .set("Cookie", adminCookies);
      expect(asc.body.items.map((u: { id: string }) => u.id)).toEqual([first.id, second.id]);

      const desc = await request(app.getHttpServer())
        .get(`/api/v1/admin/users?search=${encodeURIComponent(marker)}&sortBy=email&sortOrder=desc`)
        .set("Cookie", adminCookies);
      expect(desc.body.items.map((u: { id: string }) => u.id)).toEqual([second.id, first.id]);
    });
  });

  describe("GET /api/v1/admin/users/stats", () => {
    it("returns real aggregate counts, matched before the :userId route", async () => {
      const adminCookies = sharedAdmin.cookies;
      const before = await request(app.getHttpServer()).get("/api/v1/admin/users/stats").set("Cookie", adminCookies);
      expect(before.status).toBe(200);
      const baselineTotal = before.body.totalUsers as number;

      await createUser();

      const after = await request(app.getHttpServer()).get("/api/v1/admin/users/stats").set("Cookie", adminCookies);
      expect(after.status).toBe(200);
      expect(after.body.totalUsers).toBe(baselineTotal + 1);
      expect(after.body).toHaveProperty("activeUsers");
      expect(after.body).toHaveProperty("lockedUsers");
      expect(after.body).toHaveProperty("recentLoginFailures24h");
      expect(after.body).toHaveProperty("activeSessions");
    });
  });

  describe("GET /api/v1/admin/users/:userId", () => {
    it("returns only safe fields - never a password hash, token, or cookie", async () => {
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser();

      const response = await request(app.getHttpServer()).get(`/api/v1/admin/users/${target.id}`).set("Cookie", adminCookies);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: target.id, email: target.email, fullName: target.fullName, status: "ACTIVE" });
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|refreshToken|tokenHash|password_hash/i);
      expect(response.body).toHaveProperty("activeSessionCount");
      expect(response.body).toHaveProperty("permissions");
    });

    it("returns 404 for a non-existent user", async () => {
      const adminCookies = sharedAdmin.cookies;
      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${randomUUID()}`)
        .set("Cookie", adminCookies);
      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/v1/admin/users", () => {
    it("creates a user, queues an invitation notification, and records USER_CREATED", async () => {
      const actor = sharedAdmin.user;
      const adminCookies = sharedAdmin.cookies;
      const email = `created-${randomUUID()}@example.com`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/admin/users")
        .set("Cookie", adminCookies)
        .send({ email, fullName: "Brand New User" });

      expect(response.status).toBe(201);
      createdUserIds.push(response.body.id);
      expect(response.body.email).toBe(email);
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|password_hash/i);

      const job = await prisma.notificationJob.findFirst({ where: { userId: response.body.id, type: "PASSWORD_RESET" } });
      expect(job).not.toBeNull();

      const event = await prisma.securityEvent.findFirst({ where: { userId: actor.id, type: "USER_CREATED" } });
      expect(event).not.toBeNull();
      expect(event?.metadata).toMatchObject({ targetUserId: response.body.id });
    });

    it("rejects a duplicate email with a safe 409, never a raw DB error", async () => {
      const adminCookies = sharedAdmin.cookies;
      const existing = await createUser();

      const response = await request(app.getHttpServer())
        .post("/api/v1/admin/users")
        .set("Cookie", adminCookies)
        .send({ email: existing.email, fullName: "Duplicate Attempt" });

      expect(response.status).toBe(409);
      expect(JSON.stringify(response.body)).not.toMatch(/constraint|prisma|unique/i);
    });

    it("rejects role assignment at creation time from a non-SUPER_ADMIN actor", async () => {
      const adminCookies = sharedAdmin.cookies;

      const response = await request(app.getHttpServer())
        .post("/api/v1/admin/users")
        .set("Cookie", adminCookies)
        .send({ email: `blocked-${randomUUID()}@example.com`, fullName: "Blocked Role Grant", roles: ["FINANCE"] });

      expect(response.status).toBe(403);
    });

    it("allows a SUPER_ADMIN to assign initial roles at creation time", async () => {
      const superAdminCookies = sharedSuperAdmin.cookies;

      const response = await request(app.getHttpServer())
        .post("/api/v1/admin/users")
        .set("Cookie", superAdminCookies)
        .send({ email: `withrole-${randomUUID()}@example.com`, fullName: "With Initial Role", roles: ["FINANCE"] });

      expect(response.status).toBe(201);
      createdUserIds.push(response.body.id);
      expect(response.body.roles).toContain("FINANCE");
    });

    it("rejects unknown fields (mass-assignment protection)", async () => {
      const adminCookies = sharedAdmin.cookies;

      const response = await request(app.getHttpServer())
        .post("/api/v1/admin/users")
        .set("Cookie", adminCookies)
        .send({ email: `mass-${randomUUID()}@example.com`, fullName: "Mass Assignment", status: "SUSPENDED" });

      expect(response.status).toBe(400);
    });

    it("rolls the complete invitation aggregate back when USER_CREATED cannot persist", async () => {
      const email = `atomic-create-${randomUUID()}@example.com`;
      await expect(adminUsersService.createUser(
        nonexistentSuperAdminActor(),
        { email, fullName: "Must Not Persist" },
        { requestId: randomUUID() },
      )).rejects.toBeDefined();

      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
      expect(await prisma.passwordReset.count({ where: { user: { email } } })).toBe(0);
      expect(await prisma.notificationJob.count({ where: { recipientEmail: email } })).toBe(0);
    });
  });

  describe("PATCH /api/v1/admin/users/:userId", () => {
    it("edits safe fields and records before/after in USER_UPDATED", async () => {
      const actor = sharedAdmin.user;
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set("Cookie", adminCookies)
        .send({ fullName: "Updated Name", reason: "correcting a typo" });

      expect(response.status).toBe(200);
      expect(response.body.fullName).toBe("Updated Name");

      const events = await prisma.securityEvent.findMany({ where: { userId: actor.id, type: "USER_UPDATED" }, orderBy: { createdAt: "desc" } });
      const event = events.find((e) => (e.metadata as Record<string, unknown> | null)?.targetUserId === target.id);
      expect(event).toBeDefined();
    });

    it("rejects unknown/forbidden fields such as status or roles (mass-assignment rejection)", async () => {
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set("Cookie", adminCookies)
        .send({ reason: "trying to sneak in a status change", status: "SUSPENDED" });

      expect(response.status).toBe(400);
    });

    it("requires a reason for the edit", async () => {
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set("Cookie", adminCookies)
        .send({ fullName: "No Reason Given" });

      expect(response.status).toBe(400);
    });

    it("rejects a concurrent update when expectedUpdatedAt is stale (optimistic concurrency)", async () => {
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser();
      const staleTimestamp = new Date(target.updatedAt.getTime() - 60_000).toISOString();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set("Cookie", adminCookies)
        .send({ fullName: "Should Conflict", reason: "concurrency test", expectedUpdatedAt: staleTimestamp });

      expect(response.status).toBe(409);
    });

    it("allows only one of two concurrent profile updates to claim the same user version", async () => {
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser();
      const body = { reason: "atomic CAS concurrency test", expectedVersion: target.version };

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/admin/users/${target.id}`)
          .set("Cookie", adminCookies)
          .send({ ...body, fullName: "Concurrent Update A" }),
        request(app.getHttpServer())
          .patch(`/api/v1/admin/users/${target.id}`)
          .set("Cookie", adminCookies)
          .send({ ...body, fullName: "Concurrent Update B" }),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
      const persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(persisted.version).toBe(target.version + 1);
      expect(["Concurrent Update A", "Concurrent Update B"]).toContain(persisted.fullName);
    });

    it("rolls the profile mutation back when its mandatory security event cannot persist", async () => {
      const target = await createUser({ fullName: "Before Required Event" });

      await expect(adminUsersService.updateUser(
        nonexistentSuperAdminActor(),
        target.id,
        { fullName: "Must Roll Back", reason: "required event rollback", expectedVersion: target.version },
        { requestId: randomUUID() },
      )).rejects.toBeDefined();

      const persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(persisted.fullName).toBe("Before Required Event");
      expect(persisted.version).toBe(target.version);
    });

    it("prevents an ADMIN (non-SUPER_ADMIN) from editing another ADMIN (actor-target hierarchy)", async () => {
      const adminCookies = sharedAdmin.cookies;
      const otherAdmin = await createTargetWithRole("ADMIN");

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${otherAdmin.id}`)
        .set("Cookie", adminCookies)
        .send({ fullName: "Should Be Forbidden", reason: "hierarchy test" });

      expect(response.status).toBe(403);
    });

    it("allows a SUPER_ADMIN to edit an ADMIN (hierarchy permits managing down)", async () => {
      const superAdminCookies = sharedSuperAdmin.cookies;
      const targetAdmin = await createTargetWithRole("ADMIN");

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${targetAdmin.id}`)
        .set("Cookie", superAdminCookies)
        .send({ fullName: "Edited By Super Admin", reason: "hierarchy test" });

      expect(response.status).toBe(200);
    });
  });

  describe("POST /api/v1/admin/users/:userId/deactivate and /reactivate", () => {
    it("deactivates a user, revokes all their sessions, and blocks self-deactivation", async () => {
      const actor = sharedAdmin.user;
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser();
      await loginAs(target); // gives the target an active session to revoke

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/deactivate`)
        .set("Cookie", adminCookies)
        .send({ reason: "leaving the organization" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("INACTIVE");

      const sessions = await prisma.session.findMany({ where: { userId: target.id } });
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((s) => s.revokedAt !== null && s.revokedReason === "ADMIN_ACTION")).toBe(true);

      const event = await prisma.securityEvent.findFirst({ where: { userId: actor.id, type: "USER_DEACTIVATED" } });
      expect(event).not.toBeNull();

      const selfAttempt = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${actor.id}/deactivate`)
        .set("Cookie", adminCookies)
        .send({ reason: "trying to deactivate myself" });
      expect(selfAttempt.status).toBe(403);
    });

    it("reactivates a user without restoring sessions, and blocks reactivating a suspended account", async () => {
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser({ status: "INACTIVE" });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/reactivate`)
        .set("Cookie", adminCookies)
        .send({ reason: "returning to the organization" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ACTIVE");

      const suspended = await createUser({ status: "SUSPENDED" });
      const suspendedAttempt = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${suspended.id}/reactivate`)
        .set("Cookie", adminCookies)
        .send({ reason: "trying to reactivate a suspended account" });
      expect(suspendedAttempt.status).toBe(409);
    });

    it("rolls deactivation and session revocation back when the mandatory event fails", async () => {
      const target = await createUser();
      await loginAs(target);
      const session = await prisma.session.findFirstOrThrow({ where: { userId: target.id, revokedAt: null } });

      await expect(adminUsersService.deactivateUser(
        nonexistentSuperAdminActor(), target.id, "required event rollback", { requestId: randomUUID() },
      )).rejects.toBeDefined();

      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("ACTIVE");
      expect((await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).toBeNull();
    });

    it("rolls reactivation back when the mandatory event fails", async () => {
      const target = await createUser({ status: "INACTIVE" });

      await expect(adminUsersService.reactivateUser(
        nonexistentSuperAdminActor(), target.id, "required event rollback", { requestId: randomUUID() },
      )).rejects.toBeDefined();

      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("INACTIVE");
    });

    it("allows only one concurrent deactivation to claim the observed user version", async () => {
      const target = await createUser();
      const actor = existingSuperAdminActor();
      const results = await Promise.allSettled([
        adminUsersService.deactivateUser(actor, target.id, "concurrent A", { requestId: randomUUID() }),
        adminUsersService.deactivateUser(actor, target.id, "concurrent B", { requestId: randomUUID() }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(persisted).toMatchObject({ status: "INACTIVE", version: target.version + 1 });
    });
  });

  describe("POST /api/v1/admin/users/:userId/unlock", () => {
    it("requires users.unlock (SUPER_ADMIN-only) - an ADMIN is forbidden", async () => {
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/unlock`)
        .set("Cookie", adminCookies)
        .send({ reason: "trying without permission" });

      expect(response.status).toBe(403);
    });

    it("unlocks a locked account for a SUPER_ADMIN", async () => {
      const superAdminCookies = sharedSuperAdmin.cookies;
      const target = await createUser();
      await prisma.user.update({ where: { id: target.id }, data: { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 60_000) } });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/unlock`)
        .set("Cookie", superAdminCookies)
        .send({ reason: "user verified identity by phone" });

      expect(response.status).toBe(200);
      expect(response.body.applied).toBe(true);

      const refreshed = await prisma.user.findUnique({ where: { id: target.id } });
      expect(refreshed?.lockedUntil).toBeNull();
    });
  });

  describe("Role management endpoints", () => {
    it("lets a SUPER_ADMIN view, assign, and revoke a role", async () => {
      const superAdminCookies = sharedSuperAdmin.cookies;
      const target = await createUser();

      const before = await request(app.getHttpServer()).get(`/api/v1/admin/users/${target.id}/roles`).set("Cookie", superAdminCookies);
      expect(before.status).toBe(200);
      expect(before.body.assigned).toEqual([]);
      expect(before.body.available).toContain("FINANCE");

      const assign = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/roles`)
        .set("Cookie", superAdminCookies)
        .send({ roleName: "FINANCE", reason: "assigning finance duties" });
      expect(assign.status).toBe(200);
      expect(assign.body.applied).toBe(true);

      const revoke = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/roles/revoke`)
        .set("Cookie", superAdminCookies)
        .send({ roleName: "FINANCE", reason: "no longer needed" });
      expect(revoke.status).toBe(200);
      expect(revoke.body.applied).toBe(true);
    });

    it("rejects role management from an ADMIN (users.roles.manage is SUPER_ADMIN-only)", async () => {
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/roles`)
        .set("Cookie", adminCookies)
        .send({ roleName: "FINANCE", reason: "trying anyway" });

      expect(response.status).toBe(403);
    });

    it("still enforces final-SUPER_ADMIN protection through the HTTP endpoint (delegates to RoleAssignmentService, does not duplicate its logic)", async () => {
      const soleSuperAdmin = await createUser();
      await assignRole(soleSuperAdmin.id, "SUPER_ADMIN");
      const currentCount = await prisma.userRole.count({ where: { role: { name: "SUPER_ADMIN" } } });

      if (currentCount === 1) {
        const otherSuperAdminCookies = sharedSuperAdmin.cookies;
        const response = await request(app.getHttpServer())
          .post(`/api/v1/admin/users/${soleSuperAdmin.id}/roles/revoke`)
          .set("Cookie", otherSuperAdminCookies)
          .send({ roleName: "SUPER_ADMIN", reason: "attempting to remove the last one" });
        expect(response.status).toBe(409);
      }
    });
  });

  describe("Session management endpoints", () => {
    it("lists sessions with masked IPs, no refresh-token hash exposed", async () => {
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser();
      await loginAs(target);

      const response = await request(app.getHttpServer()).get(`/api/v1/admin/users/${target.id}/sessions`).set("Cookie", adminCookies);

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);
      expect(JSON.stringify(response.body)).not.toMatch(/refreshTokenHash|refresh_token_hash/i);
      const session = response.body[0];
      expect(session).toHaveProperty("isActive");
      expect(session).toHaveProperty("isCurrent");
    });

    it("revokes a single session and revokes-all except the actor's own current session when targeting self", async () => {
      const actor = sharedAdmin.user;
      const adminCookies = sharedAdmin.cookies;
      const target = await createUser();
      await loginAs(target);
      const targetSessions = await prisma.session.findMany({ where: { userId: target.id } });
      const sessionId = targetSessions[0]?.id;
      expect(sessionId).toBeDefined();

      const revokeOne = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/sessions/revoke`)
        .set("Cookie", adminCookies)
        .send({ sessionId, reason: "suspicious activity reported" });
      expect(revokeOne.status).toBe(200);
      expect(revokeOne.body.revokedCount).toBe(1);

      // Revoking "all" for one's own account must never revoke the
      // acting admin's own current session.
      const actorSelfRevoke = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${actor.id}/sessions/revoke`)
        .set("Cookie", adminCookies)
        .send({ reason: "testing self revoke-all safety" });
      expect(actorSelfRevoke.status).toBe(200);

      const stillWorks = await request(app.getHttpServer()).get("/api/v1/admin/users").set("Cookie", adminCookies);
      expect(stillWorks.status).toBe(200);
    });

    it("blocks revoking the actor's own current session directly", async () => {
      const actor = sharedAdmin.user;
      const adminCookies = sharedAdmin.cookies;
      const actorSessions = await prisma.session.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" } });
      const currentSessionId = actorSessions[0]?.id;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${actor.id}/sessions/revoke`)
        .set("Cookie", adminCookies)
        .send({ sessionId: currentSessionId, reason: "trying to revoke my own current session" });

      expect(response.status).toBe(403);
    });

    it("cannot revoke a session through a different target user's URL", async () => {
      const adminCookies = sharedAdmin.cookies;
      const targetA = await createUser();
      const targetB = await createUser();
      await loginAs(targetB);
      const sessionB = await prisma.session.findFirstOrThrow({ where: { userId: targetB.id } });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${targetA.id}/sessions/revoke`)
        .set("Cookie", adminCookies)
        .send({ sessionId: sessionB.id, reason: "cross-target ownership test" });

      expect(response.status).toBe(404);
      const persisted = await prisma.session.findUniqueOrThrow({ where: { id: sessionB.id } });
      expect(persisted.revokedAt).toBeNull();
    });

    it("rolls session revocation back when its mandatory event cannot persist", async () => {
      const target = await createUser();
      await loginAs(target);
      const session = await prisma.session.findFirstOrThrow({
        where: { userId: target.id, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() } },
      });
      const eventFailure = jest.spyOn(securityEventService, "recordRequired").mockRejectedValueOnce(new Error("event unavailable"));
      try {
        await expect(adminUsersService.revokeSessions(
          existingSuperAdminActor(),
          target.id,
          { sessionId: session.id, reason: "required event rollback" },
          { requestId: randomUUID() },
        )).rejects.toThrow("event unavailable");
      } finally {
        eventFailure.mockRestore();
      }
      expect((await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).toBeNull();
    });
  });

  describe("GET /api/v1/admin/users/:userId/security-events", () => {
    it("is paginated, redacts secrets, and requires users.security.read (SUPER_ADMIN-only)", async () => {
      const superAdminCookies = sharedSuperAdmin.cookies;
      const target = await createUser();
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}`)
        .set("Cookie", superAdminCookies)
        .send({ fullName: "Triggers a security event", reason: "generating history for the test" });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${target.id}/security-events?pageSize=1`)
        .set("Cookie", superAdminCookies);

      expect(response.status).toBe(200);
      expect(response.body.pageSize).toBe(1);
      expect(response.body.items.length).toBeLessThanOrEqual(1);
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenHash|refreshToken|password_hash/i);

      const adminCookies = sharedAdmin.cookies;
      const denied = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${target.id}/security-events`)
        .set("Cookie", adminCookies);
      expect(denied.status).toBe(403);
    });
  });
});
