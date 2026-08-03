import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import type { RecordSecurityEventInput } from "./security-event.types";

/**
 * A low-cardinality subset of event types worth a structured log line in
 * addition to the durable SecurityEvent row (US-009 section 10:
 * observability for lockout activations/expirations/administrative
 * unlocks/rate-limit activations). Deliberately just the event *type* -
 * never userId, email, IP, or requestId, which the instructions
 * explicitly call out as high-cardinality labels that don't belong in
 * logs/metrics (they already live safely in the DB row itself, queryable
 * by an operator who has a real investigative reason to look them up).
 */
const OBSERVABLE_EVENT_TYPES = new Set(["ACCOUNT_LOCKED", "LOCKOUT_EXPIRED", "ADMINISTRATIVE_UNLOCK", "LOCKOUT_RATE_LIMITED"]);

/**
 * The typed abstraction the full AuditLog module (a later story) connects
 * to without requiring the authentication domain to be rewritten - see
 * the SecurityEvent model's doc comment in schema.prisma. Append-only:
 * nothing in this service ever updates or deletes an existing row.
 */
@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordSecurityEventInput): Promise<void> {
    try {
      await this.prisma.securityEvent.create({
        data: {
          type: input.type,
          userId: input.userId ?? null,
          sessionId: input.sessionId ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          requestId: input.requestId ?? null,
          metadata: input.metadata ?? undefined,
        },
      });

      if (OBSERVABLE_EVENT_TYPES.has(input.type)) {
        this.logger.log(`security_event=${input.type}`);
      }
    } catch (error) {
      // A failure to *record* a security event must never block the
      // security-relevant action itself (e.g. a login should still
      // succeed/fail correctly even if this insert fails) - log and swallow.
      this.logger.error(
        `Failed to record security event ${input.type}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
