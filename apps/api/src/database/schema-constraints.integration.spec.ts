import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { createTestPrismaClient } from "./test-db-client";

describe("Auth/RBAC schema constraints (integration, real Postgres)", () => {
  let prisma: PrismaClient;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterEach(async () => {
    // Cascade deletes handle user_roles/sessions/password_resets for us;
    // this also implicitly verifies onDelete: Cascade works, since a
    // dangling FK row would make the *next* test's fresh queries fail.
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function uniqueEmail(label: string): string {
    return `us003-${label}-${randomUUID()}@example.com`;
  }

  async function createUser(email: string) {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: "not-a-real-hash-for-testing",
        fullName: "Test User",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  it("rejects a second user with the same email at the database level", async () => {
    const email = uniqueEmail("dup");
    await createUser(email);

    await expect(createUser(email)).rejects.toMatchObject({
      code: "P2002",
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it("cascades deletion of UserRole and Session when the owning User is deleted", async () => {
    const user = await createUser(uniqueEmail("cascade"));
    const role = await prisma.role.findFirstOrThrow();

    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        familyId: randomUUID(),
        refreshTokenHash: `hash-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await prisma.user.delete({ where: { id: user.id } });
    createdUserIds.splice(createdUserIds.indexOf(user.id), 1);

    const [orphanUserRole, orphanSession] = await Promise.all([
      prisma.userRole.findUnique({ where: { userId_roleId: { userId: user.id, roleId: role.id } } }),
      prisma.session.findUnique({ where: { id: session.id } }),
    ]);

    expect(orphanUserRole).toBeNull();
    expect(orphanSession).toBeNull();
  });

  it("keeps PasswordReset, PasswordHistoryEntry, and NotificationJob rows (with userId set to null) when the owning User is deleted - security/delivery evidence must survive account deletion", async () => {
    const user = await createUser(uniqueEmail("password-reset-survives"));

    const reset = await prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: `reset-hash-${randomUUID()}`, expiresAt: new Date(Date.now() + 60_000) },
    });
    const history = await prisma.passwordHistoryEntry.create({
      data: { userId: user.id, passwordHash: `hash-${randomUUID()}` },
    });
    const job = await prisma.notificationJob.create({
      data: {
        type: "PASSWORD_RESET",
        recipientEmail: user.email,
        userId: user.id,
        correlationId: randomUUID(),
        templateVersion: "v1",
      },
    });

    await prisma.user.delete({ where: { id: user.id } });
    createdUserIds.splice(createdUserIds.indexOf(user.id), 1);

    const [survivingReset, survivingHistory, survivingJob] = await Promise.all([
      prisma.passwordReset.findUnique({ where: { id: reset.id } }),
      prisma.passwordHistoryEntry.findUnique({ where: { id: history.id } }),
      prisma.notificationJob.findUnique({ where: { id: job.id } }),
    ]);

    expect(survivingReset).not.toBeNull();
    expect(survivingReset?.userId).toBeNull();
    expect(survivingHistory).not.toBeNull();
    expect(survivingHistory?.userId).toBeNull();
    expect(survivingJob).not.toBeNull();
    expect(survivingJob?.userId).toBeNull();

    await Promise.all([
      prisma.passwordReset.delete({ where: { id: reset.id } }),
      prisma.passwordHistoryEntry.delete({ where: { id: history.id } }),
      prisma.notificationJob.delete({ where: { id: job.id } }),
    ]);
  });

  it("stores Session expiration and starts unrevoked, then reflects revocation once set", async () => {
    const user = await createUser(uniqueEmail("session"));
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        familyId: randomUUID(),
        refreshTokenHash: `hash-${randomUUID()}`,
        expiresAt,
      },
    });
    expect(session.revokedAt).toBeNull();
    expect(session.expiresAt.getTime()).toBe(expiresAt.getTime());

    const revoked = await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    expect(revoked.revokedAt).not.toBeNull();
    // revocation does not implicitly change the original expiry
    expect(revoked.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it("enforces a unique refresh token hash across sessions", async () => {
    const user = await createUser(uniqueEmail("session-unique"));
    const sharedHash = `hash-${randomUUID()}`;

    await prisma.session.create({
      data: {
        userId: user.id,
        familyId: randomUUID(),
        refreshTokenHash: sharedHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(
      prisma.session.create({
        data: {
          userId: user.id,
          familyId: randomUUID(),
          refreshTokenHash: sharedHash,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("supports PasswordReset expiration and one-time-use via a nullable usedAt", async () => {
    const user = await createUser(uniqueEmail("reset"));

    const reset = await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: `reset-hash-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    expect(reset.usedAt).toBeNull();

    const consumed = await prisma.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    });
    expect(consumed.usedAt).not.toBeNull();
  });

  it("enforces a unique password-reset token hash", async () => {
    const user = await createUser(uniqueEmail("reset-unique"));
    const sharedHash = `reset-hash-${randomUUID()}`;

    await prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: sharedHash, expiresAt: new Date(Date.now() + 60_000) },
    });

    await expect(
      prisma.passwordReset.create({
        data: { userId: user.id, tokenHash: sharedHash, expiresAt: new Date(Date.now() + 60_000) },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("records LoginAttempt rows without requiring the email to belong to a real user", async () => {
    const ghostEmail = uniqueEmail("no-such-account");

    const attempt = await prisma.loginAttempt.create({
      data: { email: ghostEmail, ipAddress: "203.0.113.5", success: false },
    });

    expect(attempt.id).toBeDefined();
    await prisma.loginAttempt.delete({ where: { id: attempt.id } });
  });

  it("has the expected unique constraints and lookup indexes at the database level", async () => {
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('users', 'roles', 'permissions', 'sessions', 'password_resets', 'login_attempts', 'security_events', 'password_history', 'notification_jobs')
    `;
    const indexNames = new Set(indexes.map((i) => i.indexname));

    for (const expected of [
      "users_email_key",
      "roles_name_key",
      "permissions_key_key",
      "sessions_refresh_token_hash_key",
      "sessions_user_id_idx",
      "sessions_expires_at_idx",
      "sessions_family_id_idx",
      "sessions_rotated_to_session_id_key",
      "password_resets_token_hash_key",
      "password_resets_user_id_created_at_idx",
      "password_resets_expires_at_idx",
      "login_attempts_email_created_at_idx",
      "login_attempts_ip_address_created_at_idx",
      "login_attempts_user_id_created_at_idx",
      "security_events_user_id_created_at_idx",
      "security_events_type_created_at_idx",
      "password_history_user_id_created_at_idx",
      "notification_jobs_user_id_created_at_idx",
      "notification_jobs_status_created_at_idx",
      "notification_jobs_correlation_id_idx",
    ]) {
      expect(indexNames.has(expected)).toBe(true);
    }
  });
});
