import { AuditTimelineService } from "./audit-timeline.service";
import { AuditTimelineSourceFilter } from "./dto/audit-timeline-query.dto";

const auditRow = {
  id: "00000000-0000-4000-8000-000000000001",
  paymentOrderId: "00000000-0000-4000-8000-000000000101",
  legalDocumentVersionId: null,
  dataSubjectRequestId: null,
  pqrCaseId: null,
  opportunityId: null,
  refundId: null,
  companyId: null,
  actorUserId: "00000000-0000-4000-8000-000000000201",
  action: "PAYMENT_APPROVED",
  result: "SUCCESS",
  reason: "provider-confirmed",
  requestId: "00000000-0000-4000-8000-000000000302",
  correlationId: "00000000-0000-4000-8000-000000000303",
  ipAddress: "203.0.113.8",
  userAgent: "sensitive-audit-agent",
  previousStatus: "PENDING",
  newStatus: "PAID",
  applied: true,
  source: "WEBHOOK",
  metadata: { password: "must-not-leak", customerEmail: "pii@example.com" },
  createdAt: new Date("2026-08-19T10:00:00.000Z"),
};

const securityRow = {
  id: "00000000-0000-4000-8000-000000000002",
  type: "LOGIN_FAILED",
  userId: "00000000-0000-4000-8000-000000000202",
  actorUserId: "00000000-0000-4000-8000-000000000201",
  subjectUserId: "00000000-0000-4000-8000-000000000202",
  sessionId: null,
  result: "FAILURE",
  reason: "credential mismatch",
  ipAddress: "203.0.113.7",
  userAgent: "secret-agent-detail",
  requestId: "00000000-0000-4000-8000-000000000301",
  correlationId: "00000000-0000-4000-8000-000000000304",
  metadata: { password: "must-not-leak", reason: "credential mismatch" },
  createdAt: new Date("2026-08-19T11:00:00.000Z"),
};

const knowledgeRow = {
  id: "00000000-0000-4000-8000-000000000003",
  knowledgeVersionId: "00000000-0000-4000-8000-000000000103",
  knowledgeItemId: "00000000-0000-4000-8000-000000000104",
  actorUserId: "00000000-0000-4000-8000-000000000201",
  tenantKey: "ASODEF",
  action: "knowledge.version.published",
  previousStatus: "APPROVED",
  nextStatus: "PUBLISHED",
  result: "SUCCESS",
  correlationId: "00000000-0000-4000-8000-000000000305",
  requestId: "00000000-0000-4000-8000-000000000306",
  changeReason: "approved publication",
  sanitizedMetadata: { snapshotId: "safe-reference" },
  createdAt: new Date("2026-08-19T10:30:00.000Z"),
};

describe("AuditTimelineService", () => {
  it("merges sources chronologically and exposes only the minimized canonical shape", async () => {
    const prisma = {
      auditLog: { findMany: jest.fn().mockResolvedValue([auditRow]), count: jest.fn().mockResolvedValue(1) },
      securityEvent: { findMany: jest.fn().mockResolvedValue([securityRow]), count: jest.fn().mockResolvedValue(1) },
      knowledgeAuditEvent: { findMany: jest.fn().mockResolvedValue([knowledgeRow]), count: jest.fn().mockResolvedValue(1) },
    };
    const service = new AuditTimelineService(prisma as never);

    const result = await service.list({ source: AuditTimelineSourceFilter.ALL, pageSize: 20 });

    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.source)).toEqual(["SECURITY", "KNOWLEDGE", "AUDIT"]);
    expect(result.items[0]).toMatchObject({
      action: "LOGIN_FAILED",
      result: "FAILURE",
      actorId: securityRow.actorUserId,
      requestId: securityRow.requestId,
      correlationId: securityRow.correlationId,
    });
    expect(result.items[1]).toMatchObject({
      action: "knowledge.version.published",
      entityType: "KNOWLEDGE_VERSION",
      entityId: knowledgeRow.knowledgeVersionId,
      previousState: "APPROVED",
      newState: "PUBLISHED",
    });
    expect(result.items[2]).toMatchObject({
      action: "PAYMENT_APPROVED",
      result: "SUCCESS",
      actorId: auditRow.actorUserId,
      entityType: "PAYMENT_ORDER",
      entityId: auditRow.paymentOrderId,
      requestId: auditRow.requestId,
      correlationId: auditRow.correlationId,
    });
    expect(JSON.stringify(result)).not.toMatch(/must-not-leak|pii@example|secret-agent|203\.0\.113\.7/);
  });

  it("fetches a bounded candidate window from each source and issues an opaque continuation cursor", async () => {
    const newest = { ...securityRow, id: "00000000-0000-4000-8000-000000000010", createdAt: new Date("2026-08-19T12:00:00Z") };
    const prisma = {
      auditLog: { findMany: jest.fn().mockResolvedValue([auditRow]), count: jest.fn().mockResolvedValue(1) },
      securityEvent: { findMany: jest.fn().mockResolvedValue([newest, securityRow]), count: jest.fn().mockResolvedValue(2) },
      knowledgeAuditEvent: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const service = new AuditTimelineService(prisma as never);

    const result = await service.list({ source: AuditTimelineSourceFilter.ALL, pageSize: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(`SECURITY:${newest.id}`);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    expect(prisma.securityEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });

  it("filters SecurityEvent by explicit actorUserId without reinterpreting legacy userId", async () => {
    const prisma = {
      auditLog: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      securityEvent: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      knowledgeAuditEvent: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const service = new AuditTimelineService(prisma as never);

    await service.list({
      source: AuditTimelineSourceFilter.ALL,
      actorId: "00000000-0000-4000-8000-000000000201",
      pageSize: 20,
    });

    expect(prisma.securityEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ actorUserId: "00000000-0000-4000-8000-000000000201" }),
    }));
  });

  it("applies exact action and inclusive date-only boundaries to both sources", async () => {
    const prisma = {
      auditLog: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      securityEvent: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      knowledgeAuditEvent: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const service = new AuditTimelineService(prisma as never);

    await service.list({
      source: AuditTimelineSourceFilter.ALL,
      action: "LOGIN_FAILED",
      from: "2026-08-01",
      to: "2026-08-19",
      pageSize: 20,
    });

    const expectedRange = {
      gte: new Date("2026-08-01T00:00:00.000Z"),
      lte: new Date("2026-08-19T23:59:59.999Z"),
    };
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ action: "LOGIN_FAILED", createdAt: expectedRange }),
    }));
    expect(prisma.securityEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: "LOGIN_FAILED", createdAt: expectedRange }),
    }));
    expect(prisma.knowledgeAuditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ action: "LOGIN_FAILED", createdAt: expectedRange }),
    }));
  });

  it("uses a keyset cursor on subsequent pages and never introduces an offset or page ceiling", async () => {
    const prisma = {
      auditLog: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      securityEvent: { findMany: jest.fn().mockResolvedValue([securityRow]), count: jest.fn().mockResolvedValue(1) },
      knowledgeAuditEvent: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const service = new AuditTimelineService(prisma as never);
    const cursor = Buffer.from(JSON.stringify({
      timestamp: "2026-08-19T12:00:00.000Z",
      id: "SECURITY:00000000-0000-4000-8000-000000000010",
    })).toString("base64url");

    await service.list({ source: AuditTimelineSourceFilter.ALL, cursor, pageSize: 20 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.not.objectContaining({ skip: expect.anything() }));
    expect(prisma.securityEvent.findMany).toHaveBeenCalledWith(expect.not.objectContaining({ skip: expect.anything() }));
    expect(prisma.securityEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [expect.any(Object), expect.objectContaining({ OR: expect.any(Array) })] },
      take: 21,
    }));
  });
});
