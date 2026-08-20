import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AccountUnlockService } from "./account-unlock.service";
import { SecurityEventsModule } from "../../common/security-events/security-events.module";
import { SecurityEventService } from "../../common/security-events/security-event.service";
import { PrismaModule } from "../../database/prisma.module";
import { PrismaService } from "../../database/prisma.service";

describe("AccountUnlockService (integration, real Postgres)", () => {
  let moduleRef: TestingModule;
  let service: AccountUnlockService;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, SecurityEventsModule],
      providers: [AccountUnlockService],
    }).compile();

    service = moduleRef.get(AccountUnlockService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await moduleRef.close();
  });

  function superAdminActor(actorId: string) {
    return { actorId, actorPermissions: ["users.unlock"] };
  }

  function uniqueContext() {
    return { ipAddress: "203.0.113.50", userAgent: "jest-agent", requestId: randomUUID(), correlationId: randomUUID() };
  }

  async function createUser(overrides: { lockedUntil?: Date | null; failedLoginAttempts?: number; status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" } = {}) {
    const user = await prisma.user.create({
      data: {
        email: `unlock-${randomUUID()}@example.com`,
        passwordHash: "irrelevant-for-this-suite",
        fullName: "Unlock Test User",
        status: overrides.status ?? "ACTIVE",
        lockedUntil: overrides.lockedUntil,
        failedLoginAttempts: overrides.failedLoginAttempts ?? 0,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  it("unlocks a currently-locked account and records an ADMINISTRATIVE_UNLOCK security event", async () => {
    const actor = await createUser();
    const actorId = actor.id;
    const target = await createUser({ lockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 5 });

    const result = await service.unlockAccount(superAdminActor(actorId), target.id, "customer called support", uniqueContext());

    expect(result.applied).toBe(true);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.lockedUntil).toBeNull();
    expect(updated.failedLoginAttempts).toBe(0);

    const event = await prisma.securityEvent.findFirst({ where: { userId: actorId, type: "ADMINISTRATIVE_UNLOCK" } });
    expect(event).not.toBeNull();
    expect(event?.metadata).toMatchObject({ targetUserId: target.id, reason: "customer called support" });
  });

  it("requires the users.unlock permission - an actor without it is rejected (ADMIN/SUPER_ADMIN boundary)", async () => {
    const actor = await createUser();
    const actorId = actor.id;
    const target = await createUser({ lockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 5 });
    const nonPrivilegedActor = { actorId, actorPermissions: ["users.manage"] }; // e.g. an ADMIN-shaped actor without users.unlock

    await expect(
      service.unlockAccount(nonPrivilegedActor, target.id, "trying anyway", uniqueContext()),
    ).rejects.toThrow(ForbiddenException);

    const stillLocked = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stillLocked.lockedUntil).not.toBeNull();

    const event = await prisma.securityEvent.findFirst({
      where: { userId: actorId, type: "GOVERNANCE_CHANGE_ATTEMPTED" },
    });
    expect(event).not.toBeNull();
    expect(event?.metadata).toMatchObject({ action: "unlockAccount", result: "denied" });
  });

  it("requires a non-empty reason", async () => {
    const actor = await createUser();
    const actorId = actor.id;
    const target = await createUser({ lockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 5 });

    await expect(service.unlockAccount(superAdminActor(actorId), target.id, "", uniqueContext())).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.unlockAccount(superAdminActor(actorId), target.id, "   ", uniqueContext())).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rejects unlocking a user that does not exist and records ACCOUNT_UNLOCK_FAILED", async () => {
    const actor = await createUser();
    const actorId = actor.id;
    await expect(
      service.unlockAccount(superAdminActor(actorId), randomUUID(), "typo'd user id", uniqueContext()),
    ).rejects.toThrow(NotFoundException);

    const event = await prisma.securityEvent.findFirst({ where: { userId: actorId, type: "ACCOUNT_UNLOCK_FAILED" } });
    expect(event).not.toBeNull();
  });

  it("preserves account status - never reactivates a SUSPENDED account", async () => {
    const actor = await createUser();
    const actorId = actor.id;
    const target = await createUser({
      status: "SUSPENDED",
      lockedUntil: new Date(Date.now() + 60_000),
      failedLoginAttempts: 5,
    });

    const result = await service.unlockAccount(superAdminActor(actorId), target.id, "clearing lockout only", uniqueContext());

    expect(result.applied).toBe(true);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.status).toBe("SUSPENDED"); // unchanged
    expect(updated.lockedUntil).toBeNull(); // lockout cleared
  });

  it("preserves account status - never reactivates an INACTIVE account", async () => {
    const actor = await createUser();
    const actorId = actor.id;
    const target = await createUser({
      status: "INACTIVE",
      lockedUntil: new Date(Date.now() + 60_000),
      failedLoginAttempts: 5,
    });

    await service.unlockAccount(superAdminActor(actorId), target.id, "clearing lockout only", uniqueContext());

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.status).toBe("INACTIVE");
  });

  it("preserves LoginAttempt history - unlocking never deletes prior attempts", async () => {
    const actor = await createUser();
    const actorId = actor.id;
    const target = await createUser({ lockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 5 });
    await prisma.loginAttempt.createMany({
      data: Array.from({ length: 5 }, () => ({
        email: target.email,
        userId: target.id,
        success: false,
        failureCategory: "INVALID_CREDENTIALS" as const,
      })),
    });

    await service.unlockAccount(superAdminActor(actorId), target.id, "support ticket #123", uniqueContext());

    const attemptCount = await prisma.loginAttempt.count({ where: { userId: target.id } });
    expect(attemptCount).toBe(5);
  });

  it("is idempotent - unlocking an already-unlocked account is a safe no-op, not an error", async () => {
    const actor = await createUser();
    const actorId = actor.id;
    const target = await createUser({ lockedUntil: null, failedLoginAttempts: 0 });

    const result = await service.unlockAccount(superAdminActor(actorId), target.id, "just checking", uniqueContext());
    expect(result.applied).toBe(false);
    expect(result.alreadyUnlocked).toBe(true);

    // Repeating it again must also be safe.
    const secondResult = await service.unlockAccount(superAdminActor(actorId), target.id, "checking again", uniqueContext());
    expect(secondResult.applied).toBe(false);
    expect(secondResult.alreadyUnlocked).toBe(true);
  });

  it("in preview mode, validates but does not persist or record an event", async () => {
    const actor = await createUser();
    const actorId = actor.id;
    const target = await createUser({ lockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 5 });

    const result = await service.unlockAccount(superAdminActor(actorId), target.id, "dry run", uniqueContext(), {
      preview: true,
    });

    expect(result.applied).toBe(false);
    const stillLocked = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stillLocked.lockedUntil).not.toBeNull();

    const event = await prisma.securityEvent.findFirst({ where: { userId: actorId, type: "ADMINISTRATIVE_UNLOCK" } });
    expect(event).toBeNull();
  });

  it("records the actor id, target id, reason, and request id together on a successful unlock", async () => {
    const actor = await createUser();
    const actorId = actor.id;
    const target = await createUser({ lockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 5 });
    const context = uniqueContext();

    await service.unlockAccount(superAdminActor(actorId), target.id, "full audit trail check", context);

    const event = await prisma.securityEvent.findFirstOrThrow({
      where: { userId: actorId, type: "ADMINISTRATIVE_UNLOCK" },
    });
    expect(event.userId).toBe(actorId);
    expect(event.actorUserId).toBe(actorId);
    expect(event.subjectUserId).toBe(target.id);
    expect(event.result).toBe("SUCCESS");
    expect(event.reason).toBe("full audit trail check");
    expect(event.requestId).toBe(context.requestId);
    expect(event.correlationId).toBe(context.correlationId);
    expect(event.metadata).toMatchObject({ targetUserId: target.id, reason: "full audit trail check" });
  });

  it("rolls the unlock back when its mandatory security event cannot be persisted", async () => {
    const actor = await createUser();
    const target = await createUser({ lockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 5 });
    const securityEvents = moduleRef.get(SecurityEventService);
    const failure = jest.spyOn(securityEvents, "recordRequired").mockRejectedValueOnce(new Error("event unavailable"));

    await expect(service.unlockAccount(superAdminActor(actor.id), target.id, "required evidence", uniqueContext()))
      .rejects.toThrow("event unavailable");

    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(persisted.failedLoginAttempts).toBe(5);
    expect(persisted.lockedUntil).not.toBeNull();
    failure.mockRestore();
  });

  it("fails with conflict when the lockout state changes before its CAS claim", async () => {
    const actor = await createUser();
    const target = await createUser({ lockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 5 });
    const originalTransaction = prisma.$transaction.bind(prisma);
    const transactionSpy = jest.spyOn(prisma, "$transaction").mockImplementationOnce((async (callback: Parameters<typeof prisma.$transaction>[0], options?: Parameters<typeof prisma.$transaction>[1]) => {
      await prisma.user.update({ where: { id: target.id }, data: { failedLoginAttempts: 6 } });
      return originalTransaction(callback as never, options as never);
    }) as typeof prisma.$transaction);

    await expect(service.unlockAccount(superAdminActor(actor.id), target.id, "concurrent state", uniqueContext()))
      .rejects.toThrow(ConflictException);
    transactionSpy.mockRestore();
  });
});
