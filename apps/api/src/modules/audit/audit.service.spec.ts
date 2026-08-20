import { AuditSource } from "@prisma/client";
import { AuditService } from "./audit.service";

describe("AuditService.record", () => {
  it("writes exactly the fields passed through to auditLog.create, via the given transaction client", async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = { auditLog: { create } } as unknown as Parameters<AuditService["record"]>[0];

    const service = new AuditService();
    await service.record(tx, {
      paymentOrderId: "order-1",
      action: "order.created",
      previousStatus: null,
      newStatus: "PENDING",
      applied: true,
      source: AuditSource.ORDER_CREATE,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentOrderId: "order-1",
        action: "order.created",
        result: "SUCCESS",
        previousStatus: null,
        newStatus: "PENDING",
        applied: true,
        source: AuditSource.ORDER_CREATE,
        metadata: undefined,
      }),
    });
  });

  it("passes applied:false through unchanged for a blocked transition", async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = { auditLog: { create } } as unknown as Parameters<AuditService["record"]>[0];

    const service = new AuditService();
    await service.record(tx, {
      paymentOrderId: "order-1",
      action: "order.status_transition",
      previousStatus: "APPROVED",
      newStatus: "REJECTED",
      applied: false,
      source: AuditSource.WEBHOOK,
    });

    expect(create.mock.calls[0]![0].data.applied).toBe(false);
    expect(create.mock.calls[0]![0].data.result).toBe("NO_OP");
  });

  it("persists explicit structured context without interpreting metadata", async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = { auditLog: { create } } as unknown as Parameters<AuditService["record"]>[0];
    const service = new AuditService();
    await service.record(tx, {
      paymentOrderId: "order-1",
      actorUserId: "actor-1",
      action: "order.denied",
      result: "DENIED",
      reason: "policy",
      requestId: "request-1",
      correlationId: "correlation-1",
      ipAddress: "192.0.2.1",
      userAgent: "test-agent",
      previousStatus: "PENDING",
      newStatus: "PENDING",
      applied: false,
      source: AuditSource.MANUAL,
      metadata: { result: "must-not-be-interpreted" },
    });

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorUserId: "actor-1",
      result: "DENIED",
      reason: "policy",
      requestId: "request-1",
      correlationId: "correlation-1",
      ipAddress: "192.0.2.1",
      userAgent: "test-agent",
    }) });
  });
});
