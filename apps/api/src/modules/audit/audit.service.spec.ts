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
      data: {
        paymentOrderId: "order-1",
        action: "order.created",
        previousStatus: null,
        newStatus: "PENDING",
        applied: true,
        source: AuditSource.ORDER_CREATE,
        metadata: undefined,
      },
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
  });
});
