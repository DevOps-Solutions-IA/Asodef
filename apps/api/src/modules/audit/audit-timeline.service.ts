import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditEventResult, SecurityEventType, type Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import {
  AuditTimelineResultFilter,
  AuditTimelineSourceFilter,
  type AuditTimelineQueryDto,
} from "./dto/audit-timeline-query.dto";
import type { AuditTimelineItem, AuditTimelinePage } from "./audit-timeline.types";

const SECURITY_EVENT_TYPES = new Set<string>(Object.values(SecurityEventType));
const CURSOR_ID_PATTERN = /^(AUDIT|KNOWLEDGE|SECURITY):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface TimelineCursor {
  timestamp: Date;
  source: "AUDIT" | "KNOWLEDGE" | "SECURITY";
  rawId: string;
}

@Injectable()
export class AuditTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  /** Application-level cursor union keeps both append-only models intact.
   * Each source contributes at most pageSize+1 rows after the same global
   * cursor; older history remains reachable without an unbounded offset or
   * an arbitrary maximum page. */
  async list(query: AuditTimelineQueryDto): Promise<AuditTimelinePage> {
    const cursor = decodeCursor(query.cursor);
    const candidateLimit = query.pageSize + 1;
    const includeAudit = query.source === AuditTimelineSourceFilter.ALL || query.source === AuditTimelineSourceFilter.AUDIT;
    const includeKnowledge = query.source === AuditTimelineSourceFilter.ALL || query.source === AuditTimelineSourceFilter.KNOWLEDGE;
    const includeSecurity = (query.source === AuditTimelineSourceFilter.ALL || query.source === AuditTimelineSourceFilter.SECURITY)
      && (!query.action || SECURITY_EVENT_TYPES.has(query.action));

    const auditBaseWhere = this.auditWhere(query);
    const securityBaseWhere = this.securityWhere(query);
    const knowledgeBaseWhere = this.knowledgeWhere(query);
    const auditWhere = cursor ? { AND: [auditBaseWhere, auditCursorWhere(cursor)] } : auditBaseWhere;
    const securityWhere = cursor ? { AND: [securityBaseWhere, securityCursorWhere(cursor)] } : securityBaseWhere;
    const knowledgeWhere = cursor ? { AND: [knowledgeBaseWhere, knowledgeCursorWhere(cursor)] } : knowledgeBaseWhere;
    const [auditRows, auditCount, securityRows, securityCount, knowledgeRows, knowledgeCount] = await Promise.all([
      includeAudit ? this.prisma.auditLog.findMany({ where: auditWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: candidateLimit }) : [],
      includeAudit ? this.prisma.auditLog.count({ where: auditBaseWhere }) : 0,
      includeSecurity ? this.prisma.securityEvent.findMany({ where: securityWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: candidateLimit }) : [],
      includeSecurity ? this.prisma.securityEvent.count({ where: securityBaseWhere }) : 0,
      includeKnowledge ? this.prisma.knowledgeAuditEvent.findMany({ where: knowledgeWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: candidateLimit }) : [],
      includeKnowledge ? this.prisma.knowledgeAuditEvent.count({ where: knowledgeBaseWhere }) : 0,
    ]);

    const merged = [
      ...auditRows.map((row) => this.fromAudit(row)),
      ...securityRows.map((row) => this.fromSecurity(row)),
      ...knowledgeRows.map((row) => this.fromKnowledge(row)),
    ].sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime() || right.id.localeCompare(left.id));
    const items = merged.slice(0, query.pageSize);
    const nextCursor = merged.length > query.pageSize && items.length > 0
      ? encodeCursor(items[items.length - 1]!)
      : null;

    return { items, total: auditCount + securityCount + knowledgeCount, pageSize: query.pageSize, nextCursor };
  }

  private auditWhere(query: AuditTimelineQueryDto): Prisma.AuditLogWhereInput {
    const createdAt = timelineDateRange(query.from, query.to);
    return {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorUserId: query.actorId } : {}),
      ...(query.result ? auditResultWhere(query.result) : {}),
      ...(createdAt ? { createdAt } : {}),
    };
  }

  private securityWhere(query: AuditTimelineQueryDto): Prisma.SecurityEventWhereInput {
    const createdAt = timelineDateRange(query.from, query.to);
    return {
      ...(query.action && SECURITY_EVENT_TYPES.has(query.action) ? { type: query.action as SecurityEventType } : {}),
      ...(query.actorId ? { actorUserId: query.actorId } : {}),
      ...(query.result ? securityResultWhere(query.result) : {}),
      ...(createdAt ? { createdAt } : {}),
    };
  }

  private knowledgeWhere(query: AuditTimelineQueryDto): Prisma.KnowledgeAuditEventWhereInput {
    const createdAt = timelineDateRange(query.from, query.to);
    return {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorUserId: query.actorId } : {}),
      ...(query.result ? { result: query.result as AuditEventResult } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
  }

  private fromAudit(row: Prisma.AuditLogGetPayload<object>): AuditTimelineItem {
    const entity = auditEntity(row);
    return {
      id: `AUDIT:${row.id}`,
      source: "AUDIT",
      action: row.action,
      result: row.result ?? (row.applied ? "SUCCESS" : "NO_OP"),
      timestamp: row.createdAt,
      actorId: row.actorUserId,
      entityType: entity.type,
      entityId: entity.id,
      previousState: row.previousStatus,
      newState: row.newStatus,
      reason: row.reason,
      requestId: row.requestId,
      correlationId: row.correlationId,
    };
  }

  private fromSecurity(row: Prisma.SecurityEventGetPayload<object>): AuditTimelineItem {
    return {
      id: `SECURITY:${row.id}`,
      source: "SECURITY",
      action: row.type,
      result: row.result ?? "UNKNOWN",
      timestamp: row.createdAt,
      // Legacy userId remains deliberately uninterpreted. Only the new
      // explicit actor/subject foreign keys contribute timeline semantics.
      actorId: row.actorUserId,
      entityType: row.subjectUserId ? "USER" : null,
      entityId: row.subjectUserId,
      previousState: null,
      newState: null,
      reason: row.reason,
      requestId: row.requestId,
      correlationId: row.correlationId,
    };
  }

  private fromKnowledge(row: Prisma.KnowledgeAuditEventGetPayload<object>): AuditTimelineItem {
    return {
      id: `KNOWLEDGE:${row.id}`,
      source: "KNOWLEDGE",
      action: row.action,
      result: row.result,
      timestamp: row.createdAt,
      actorId: row.actorUserId,
      entityType: "KNOWLEDGE_VERSION",
      entityId: row.knowledgeVersionId,
      previousState: row.previousStatus,
      newState: row.nextStatus,
      reason: row.changeReason,
      requestId: row.requestId,
      correlationId: row.correlationId,
    };
  }
}

function auditResultWhere(result: AuditTimelineResultFilter): Prisma.AuditLogWhereInput {
  if (result === AuditTimelineResultFilter.SUCCESS) {
    return { OR: [{ result: "SUCCESS" }, { result: null, applied: true }] };
  }
  if (result === AuditTimelineResultFilter.NO_OP) {
    return { OR: [{ result: "NO_OP" }, { result: null, applied: false }] };
  }
  return { result };
}

function securityResultWhere(result: AuditTimelineResultFilter): Prisma.SecurityEventWhereInput {
  return result === AuditTimelineResultFilter.UNKNOWN
    ? { OR: [{ result: "UNKNOWN" }, { result: null }] }
    : { result };
}

/**
 * ISO timestamps retain their exact instant. A date-only upper bound is an
 * operator-facing calendar filter and therefore includes that complete UTC
 * day instead of silently stopping at midnight at its beginning.
 */
function timelineDateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: dateBoundary(from, false) } : {}),
    ...(to ? { lte: dateBoundary(to, true) } : {}),
  };
}

function dateBoundary(value: string, endOfDateOnlyDay: boolean): Date {
  if (endOfDateOnlyDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }
  return new Date(value);
}

function auditEntity(row: Prisma.AuditLogGetPayload<object>): { type: string | null; id: string | null } {
  const candidates: Array<[string, string | null]> = [
    ["PAYMENT_ORDER", row.paymentOrderId],
    ["LEGAL_DOCUMENT_VERSION", row.legalDocumentVersionId],
    ["DATA_SUBJECT_REQUEST", row.dataSubjectRequestId],
    ["PQR_CASE", row.pqrCaseId],
    ["OPPORTUNITY", row.opportunityId],
    ["REFUND", row.refundId],
    ["COMPANY", row.companyId],
  ];
  const entity = candidates.find(([, id]) => id !== null);
  return entity ? { type: entity[0], id: entity[1] } : { type: null, id: null };
}

function decodeCursor(value: string | undefined): TimelineCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { timestamp?: unknown; id?: unknown };
    if (typeof decoded.timestamp !== "string" || typeof decoded.id !== "string" || !CURSOR_ID_PATTERN.test(decoded.id)) {
      throw new Error("invalid cursor shape");
    }
    const timestamp = new Date(decoded.timestamp);
    if (Number.isNaN(timestamp.getTime())) throw new Error("invalid cursor timestamp");
    const [sourceValue, rawId] = decoded.id.split(":");
    const source = sourceValue!.toUpperCase() as "AUDIT" | "KNOWLEDGE" | "SECURITY";
    return { timestamp, source, rawId: rawId! };
  } catch {
    throw new BadRequestException("El cursor de auditoría no es válido.");
  }
}

function encodeCursor(item: AuditTimelineItem): string {
  return Buffer.from(JSON.stringify({ timestamp: item.timestamp.toISOString(), id: item.id }), "utf8").toString("base64url");
}

function auditCursorWhere(cursor: TimelineCursor): Prisma.AuditLogWhereInput {
  const sameTimestamp = cursor.source === "AUDIT"
    ? { createdAt: cursor.timestamp, id: { lt: cursor.rawId } }
    : { createdAt: cursor.timestamp };
  return { OR: [{ createdAt: { lt: cursor.timestamp } }, sameTimestamp] };
}

function securityCursorWhere(cursor: TimelineCursor): Prisma.SecurityEventWhereInput {
  if (cursor.source === "AUDIT") {
    // At equal timestamps every `security:*` global id sorts before every
    // `audit:*` id, so none belongs after an AUDIT cursor.
    return { createdAt: { lt: cursor.timestamp } };
  }
  return { OR: [{ createdAt: { lt: cursor.timestamp } }, { createdAt: cursor.timestamp, id: { lt: cursor.rawId } }] };
}

function knowledgeCursorWhere(cursor: TimelineCursor): Prisma.KnowledgeAuditEventWhereInput {
  if (cursor.source === "AUDIT") return { createdAt: { lt: cursor.timestamp } };
  if (cursor.source === "SECURITY") {
    return { OR: [{ createdAt: { lt: cursor.timestamp } }, { createdAt: cursor.timestamp }] };
  }
  return { OR: [{ createdAt: { lt: cursor.timestamp } }, { createdAt: cursor.timestamp, id: { lt: cursor.rawId } }] };
}
