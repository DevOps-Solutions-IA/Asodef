import { SessionService } from "./session.service";
import type { PrismaService } from "../../database/prisma.service";
import type { TokenService } from "./token.service";

describe("SessionService security invariants", () => {
  function harness() {
    const session = {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    const service = new SessionService(
      { session } as unknown as PrismaService,
      {} as TokenService,
    );
    return { service, session };
  }

  it("resolves an access-token session only when id, owner and usable state all match", async () => {
    const { service, session } = harness();
    const now = new Date("2026-08-19T12:00:00.000Z");
    session.findFirst.mockResolvedValue({ id: "session-1", userId: "user-1" });

    await service.findUsableByIdForUser("session-1", "user-1", now);

    expect(session.findFirst).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        userId: "user-1",
        revokedAt: null,
        rotatedAt: null,
        expiresAt: { gt: now },
      },
    });
  });

  it("revokes a single session only when it belongs to the target user", async () => {
    const { service, session } = harness();
    session.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.revokeSessionForUser("session-for-b", "user-a", "ADMIN_ACTION")).resolves.toBe(false);
    expect(session.updateMany).toHaveBeenCalledWith({
      where: { id: "session-for-b", userId: "user-a", revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: "ADMIN_ACTION" },
    });
  });

  it("reads step-up state only from the exact usable owner/session binding", async () => {
    const { service, session } = harness();
    const now = new Date("2026-08-19T12:00:00.000Z");
    session.findFirst.mockResolvedValue({ mfaVerifiedAt: now, recentAuthenticationAt: now });

    await service.findStepUpState("session-1", "user-1", now);

    expect(session.findFirst).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        userId: "user-1",
        revokedAt: null,
        rotatedAt: null,
        expiresAt: { gt: now },
      },
      select: { mfaVerifiedAt: true, recentAuthenticationAt: true },
    });
  });

  it("marks assurance atomically only for an exact usable owner/session binding", async () => {
    const { service, session } = harness();
    const verifiedAt = new Date("2026-08-19T12:00:00.000Z");
    session.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.markStepUpVerified("session-1", "user-1", verifiedAt)).resolves.toBe(true);
    expect(session.updateMany).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        userId: "user-1",
        revokedAt: null,
        rotatedAt: null,
        expiresAt: { gt: verifiedAt },
      },
      data: { mfaVerifiedAt: verifiedAt, recentAuthenticationAt: verifiedAt },
    });
  });

  it("fails closed when a stale or cross-user session cannot be marked verified", async () => {
    const { service, session } = harness();
    session.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.markStepUpVerified("stale-session", "user-1")).resolves.toBe(false);
  });

  it("preserves assurance timestamps across refresh rotation without renewing them", async () => {
    const current = {
      id: "old-session",
      userId: "user-1",
      familyId: "00000000-0000-4000-8000-000000000001",
      revokedAt: null,
      rotatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      mfaVerifiedAt: new Date("2026-08-19T10:00:00.000Z"),
      recentAuthenticationAt: new Date("2026-08-19T10:03:00.000Z"),
    };
    const sessionDelegate = {
      findUnique: jest.fn().mockResolvedValue(current),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new-session", ...data })),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SessionService(
      { session: sessionDelegate } as unknown as PrismaService,
      {
        generateRefreshToken: jest.fn().mockReturnValue("raw-refresh"),
        hashRefreshToken: jest.fn().mockReturnValue("hashed-refresh"),
        getRefreshTtlMs: jest.fn().mockReturnValue(60_000),
      } as unknown as TokenService,
    );
    const mfaVerifiedAt = new Date("2026-08-19T10:00:00.000Z");
    const recentAuthenticationAt = new Date("2026-08-19T10:03:00.000Z");

    const tx = { session: sessionDelegate, $queryRaw: jest.fn() };
    await service.rotateSession({
      id: "old-session",
      userId: "user-1",
      familyId: "00000000-0000-4000-8000-000000000001",
      mfaVerifiedAt,
      recentAuthenticationAt,
    } as never, {}, tx as never);

    expect(sessionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mfaVerifiedAt, recentAuthenticationAt }),
    });
  });

  it("revokes a replayed refresh family under the same serialized transaction", async () => {
    const sessionDelegate = {
      findUnique: jest.fn().mockResolvedValue({
        id: "old-session", familyId: "00000000-0000-4000-8000-000000000001",
        revokedAt: null, rotatedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      create: jest.fn(),
      update: jest.fn(),
    };
    const service = new SessionService(
      {} as PrismaService,
      { generateRefreshToken: jest.fn().mockReturnValue("unused"), hashRefreshToken: jest.fn().mockReturnValue("unused") } as never,
    );
    const tx = { session: sessionDelegate, $queryRaw: jest.fn() };

    await expect(service.rotateSession({ id: "old-session" } as never, {}, tx as never))
      .resolves.toEqual({ outcome: "replay", familyId: "00000000-0000-4000-8000-000000000001" });
    expect(sessionDelegate.updateMany).toHaveBeenCalledWith({
      where: { familyId: "00000000-0000-4000-8000-000000000001", revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: "REFRESH_TOKEN_REUSE_DETECTED" },
    });
    expect(sessionDelegate.create).not.toHaveBeenCalled();
  });

  it("never resurrects assurance cleared after the caller's initial refresh-token lookup", async () => {
    const sessionDelegate = {
      findUnique: jest.fn().mockResolvedValue({
        id: "old-session", userId: "user-1", familyId: "00000000-0000-4000-8000-000000000001",
        revokedAt: null, rotatedAt: null, expiresAt: new Date(Date.now() + 60_000),
        mfaVerifiedAt: null, recentAuthenticationAt: null,
      }),
      updateMany: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new-session", ...data })),
      update: jest.fn(),
    };
    const service = new SessionService(
      {} as PrismaService,
      {
        generateRefreshToken: jest.fn().mockReturnValue("raw-refresh"),
        hashRefreshToken: jest.fn().mockReturnValue("hashed-refresh"),
        getRefreshTtlMs: jest.fn().mockReturnValue(60_000),
      } as never,
    );
    const staleAssurance = new Date();
    await service.rotateSession({
      id: "old-session", userId: "user-1", familyId: "00000000-0000-4000-8000-000000000001",
      mfaVerifiedAt: staleAssurance, recentAuthenticationAt: staleAssurance,
    } as never, {}, { session: sessionDelegate, $queryRaw: jest.fn() } as never);

    expect(sessionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mfaVerifiedAt: null, recentAuthenticationAt: null }),
    });
  });

  it("clears assurance only on the exact usable current session", async () => {
    const { service, session } = harness();
    session.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date();
    await expect(service.clearAssuranceForUsableSession("session-1", "user-1", { session } as never, now))
      .resolves.toBe(true);
    expect(session.updateMany).toHaveBeenCalledWith({
      where: { id: "session-1", userId: "user-1", revokedAt: null, rotatedAt: null, expiresAt: { gt: now } },
      data: { mfaVerifiedAt: null, recentAuthenticationAt: null },
    });
  });

  it("bounds last-used writes and cannot touch a revoked or mismatched session", async () => {
    const { service, session } = harness();
    const now = new Date("2026-08-19T12:00:00.000Z");
    session.updateMany.mockResolvedValue({ count: 1 });

    await service.touchLastUsedIfUsable("session-1", "user-1", now);

    expect(session.updateMany).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        userId: "user-1",
        revokedAt: null,
        rotatedAt: null,
        expiresAt: { gt: now },
        OR: [
          { lastUsedAt: null },
          { lastUsedAt: { lt: new Date("2026-08-19T11:59:00.000Z") } },
        ],
      },
      data: { lastUsedAt: now },
    });
  });
});
