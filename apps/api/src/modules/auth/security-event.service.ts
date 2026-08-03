import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import type { RecordSecurityEventInput } from "./types/security-event.types";

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
