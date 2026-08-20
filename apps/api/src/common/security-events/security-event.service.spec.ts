import { SecurityEventService } from "./security-event.service";
import type { PrismaService } from "../../database/prisma.service";

const INPUT = { type: "USER_UPDATED" as const, userId: "00000000-0000-4000-8000-000000000001" };

describe("SecurityEventService persistence modes", () => {
  it("keeps best-effort observations non-blocking", async () => {
    const prisma = { securityEvent: { create: jest.fn().mockRejectedValue(new Error("event unavailable")) } };
    const service = new SecurityEventService(prisma as unknown as PrismaService);
    await expect(service.record(INPUT)).resolves.toBeUndefined();
  });

  it("propagates mandatory transactional event failures to roll back the caller", async () => {
    const service = new SecurityEventService({} as PrismaService);
    const tx = { securityEvent: { create: jest.fn().mockRejectedValue(new Error("event unavailable")) } };
    await expect(service.recordRequired(tx as never, INPUT)).rejects.toThrow("event unavailable");
  });

  it("persists explicit actor, subject, result and correlation without reading metadata", async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const service = new SecurityEventService({ securityEvent: { create } } as unknown as PrismaService);
    await service.record({
      ...INPUT,
      actorUserId: "00000000-0000-4000-8000-000000000002",
      subjectUserId: INPUT.userId,
      result: "SUCCESS",
      reason: "approved action",
      correlationId: "00000000-0000-4000-8000-000000000003",
      metadata: { actorId: "must-not-be-interpreted" },
    });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorUserId: "00000000-0000-4000-8000-000000000002",
      subjectUserId: INPUT.userId,
      result: "SUCCESS",
      reason: "approved action",
      correlationId: "00000000-0000-4000-8000-000000000003",
    }) });
  });
});
