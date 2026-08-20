import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type CommunicationLog, type NotificationType } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { SecurityEventService } from "../../common/security-events/security-event.service";
import type { EnvConfig } from "../../config/env.validation";
import { MAIL_TRANSPORT, type MailTransport, type OutboundEmailMessage } from "./mail-transport.interface";
import { EmailTemplateRenderer } from "./email-template.renderer";
import { NotificationPayloadCryptoService } from "./notification-payload-crypto.service";

const OPTIONAL_MARKETING_PURPOSE_KEY = "optional_marketing";
const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

const MAX_ATTEMPTS = 5;
const CLAIM_BATCH_SIZE = 10;
const LEASE_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;
const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;

interface DurableNotificationPayload {
  subject: string;
  textBody: string;
  templateVersion: string;
  correlationId: string;
}

interface ClaimedNotificationJob {
  id: string;
  type: NotificationType;
  recipientEmail: string;
  userId: string | null;
  correlationId: string;
  retryCount: number;
  maxAttempts: number;
  payloadEncrypted: string | null;
}

type NotificationWriteClient = Pick<Prisma.TransactionClient, "notificationJob">;

export interface QueuePasswordResetEmailInput {
  recipientEmail: string;
  userId: string;
  resetUrl: string;
  correlationId: string;
}

export interface QueuePasswordChangedEmailInput {
  recipientEmail: string;
  userId: string;
  correlationId: string;
}

export interface QueueAccountInvitationEmailInput {
  recipientEmail: string;
  userId: string;
  fullName: string;
  setupUrl: string;
  correlationId: string;
}

/**
 * The notification "outbox" (US-007): every send attempt is durably
 * recorded as a NotificationJob (status/retryCount/failureReason/
 * correlationId/templateVersion) *before* delivery is attempted, and
 * delivery is performed by a lease-based worker. Queuing (a local DB
 * insert) is the only part any HTTP request awaits. The encrypted payload
 * survives process restarts; concurrent workers claim rows with
 * SKIP LOCKED and terminal transitions are guarded by the lease owner.
 *
 * Delivery semantics are deliberately at-least-once: SMTP offers no
 * transactional acknowledgement shared with PostgreSQL. A stable Message-ID
 * limits duplicate impact, and a transport outcome that may have been
 * accepted is parked as UNKNOWN_RESULT instead of being blindly retried.
 * Password-reset tokens remain single-use independently of email delivery.
 */
@Injectable()
export class NotificationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationService.name);
  private readonly corporateEmail: string;
  private readonly automaticWorkerEnabled: boolean;
  private readonly workerId = randomUUID();
  private pollTimer: NodeJS.Timeout | null = null;
  private drainScheduled = false;
  private drainPromise: Promise<number> | null = null;
  private shuttingDown = false;
  private workerStarted = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEventService: SecurityEventService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
    private readonly payloadCrypto: NotificationPayloadCryptoService,
    private readonly templateRenderer: EmailTemplateRenderer,
    configService: ConfigService<EnvConfig, true>,
  ) {
    this.corporateEmail = configService.get("CORPORATE_EMAIL", { infer: true });
    this.automaticWorkerEnabled = configService.get("NODE_ENV", { infer: true }) !== "test";
  }

  onApplicationBootstrap(): void {
    if (!this.automaticWorkerEnabled) return;
    this.workerStarted = true;
    this.scheduleDrain(0);
    this.pollTimer = setInterval(() => this.scheduleDrain(0), POLL_INTERVAL_MS);
    this.pollTimer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    await this.drainPromise?.catch(() => undefined);
  }

  /** Returns once the job row is queued - never waits for delivery. */
  async queuePasswordResetEmail(input: QueuePasswordResetEmailInput): Promise<string> {
    const rendered = this.templateRenderer.render("security_password_recovery", {
      resetUrl: input.resetUrl,
      corporateEmail: this.corporateEmail,
    });
    return this.enqueue(this.prisma, true, "PASSWORD_RESET", input.recipientEmail, input.userId, {
      to: input.recipientEmail,
      ...rendered,
      correlationId: input.correlationId,
    });
  }

  /** Sanitized technical probe consumed by the administrative system page.
   * Concrete transports never return hostnames, credentials or provider
   * errors across this boundary. */
  checkTransportHealth(): Promise<"AVAILABLE" | "UNAVAILABLE" | "NOT_CONFIGURED"> {
    return this.mailTransport.checkHealth();
  }

  /** Transaction-aware required enqueue for password recovery. Delivery is
   * deliberately not scheduled inside the transaction: the durable poller
   * can observe the encrypted row only after the surrounding transaction
   * commits. Any insert/encryption failure is propagated so the reset token
   * and its mandatory events roll back with the outbox row. */
  async queuePasswordResetEmailRequired(
    client: NotificationWriteClient,
    input: QueuePasswordResetEmailInput,
  ): Promise<string> {
    const rendered = this.templateRenderer.render("security_password_recovery", {
      resetUrl: input.resetUrl,
      corporateEmail: this.corporateEmail,
    });
    return this.enqueue(client, false, "PASSWORD_RESET", input.recipientEmail, input.userId, {
      to: input.recipientEmail,
      ...rendered,
      correlationId: input.correlationId,
    });
  }

  /**
   * US-011's account-invitation flow (option A from the story: invitation
   * with a one-time setup token, preferred over an admin-generated
   * temporary password). Deliberately reuses the *same* PasswordReset
   * token mechanism and the *same* /restablecer-clave frontend page
   * already built and verified in US-010 - the new user's account is
   * created with an unusable random password hash, and "setting your
   * initial password" is, mechanically, identical to a password reset.
   * This avoids inventing a second token table/page/NotificationType for
   * a flow that is otherwise indistinguishable from one already built.
   */
  async queueAccountInvitationEmail(input: QueueAccountInvitationEmailInput): Promise<string> {
    const rendered = this.templateRenderer.render("security_account_invitation", {
      fullName: input.fullName,
      setupUrl: input.setupUrl,
      corporateEmail: this.corporateEmail,
    });
    return this.enqueue(this.prisma, true, "PASSWORD_RESET", input.recipientEmail, input.userId, {
      to: input.recipientEmail,
      ...rendered,
      correlationId: input.correlationId,
    });
  }

  /** Transaction-aware outbox enqueue for account creation. Delivery is
   * intentionally not scheduled inside the transaction; the durable poller
   * observes the row only after commit. */
  async queueAccountInvitationEmailRequired(
    client: NotificationWriteClient,
    input: QueueAccountInvitationEmailInput,
  ): Promise<string> {
    const rendered = this.templateRenderer.render("security_account_invitation", {
      fullName: input.fullName,
      setupUrl: input.setupUrl,
      corporateEmail: this.corporateEmail,
    });
    return this.enqueue(client, false, "PASSWORD_RESET", input.recipientEmail, input.userId, {
      to: input.recipientEmail,
      ...rendered,
      correlationId: input.correlationId,
    });
  }

  async queuePasswordChangedEmail(input: QueuePasswordChangedEmailInput): Promise<string> {
    const rendered = this.templateRenderer.render("security_password_changed", {
      corporateEmail: this.corporateEmail,
    });
    return this.enqueue(this.prisma, true, "PASSWORD_CHANGED", input.recipientEmail, input.userId, {
      to: input.recipientEmail,
      ...rendered,
      correlationId: input.correlationId,
    });
  }

  /** Available for future high-risk-event alerting; not yet wired to any
   * flow in this story beyond password reset/change confirmations. */
  async queueSecurityAlert(input: {
    recipientEmail: string;
    userId: string;
    correlationId: string;
    subject: string;
    textBody: string;
  }): Promise<string> {
    return this.enqueue(this.prisma, true, "SECURITY_ALERT", input.recipientEmail, input.userId, {
      to: input.recipientEmail,
      subject: input.subject,
      textBody: input.textBody,
      templateVersion: "security_alert@v1",
      correlationId: input.correlationId,
    });
  }

  /**
   * US-059 AC (verbatim method name/signature): a stub - persists a
   * fail-closed CommunicationLog row, no real SMTP/
   * WhatsApp dispatch. kind=marketing checks SuppressionListEntry
   * first (channel-scoped, cheaper/no join), then a GRANTED
   * optional_marketing ConsentRecord for whichever subject (Customer/
   * LeadSubmission/User) matches `recipient` by email or phone.
   * kind=transactional always sends/logs, independent of marketing
   * consent (Negative case, verbatim).
   */
  async send(templateKey: string, recipient: string, data: Record<string, unknown>): Promise<CommunicationLog> {
    const template = await this.prisma.communicationTemplate.findUnique({ where: { key: templateKey } });
    if (!template) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    if (template.kind === "MARKETING") {
      const suppressed = await this.prisma.suppressionListEntry.findUnique({
        where: { channel_recipient: { channel: template.channel, recipient } },
      });
      if (suppressed) {
        return this.prisma.communicationLog.create({
          data: {
            templateId: template.id,
            recipient,
            channel: template.channel,
            status: "SUPPRESSED",
            errorCategory: "suppression_list_entry",
          },
        });
      }

      const consentGranted = await this.hasGrantedMarketingConsent(recipient);
      if (!consentGranted) {
        return this.prisma.communicationLog.create({
          data: {
            templateId: template.id,
            recipient,
            channel: template.channel,
            status: "SUPPRESSED",
            errorCategory: "marketing_consent_not_granted",
          },
        });
      }
    }

    // This legacy communications path has no real transport. Never claim
    // delivery and never log recipient/rendered content (which may contain
    // personal data). The durable security-notification outbox above is a
    // separate, real email-delivery capability.
    void data;
    return this.prisma.communicationLog.create({
      data: {
        templateId: template.id,
        recipient,
        channel: template.channel,
        status: "FAILED",
        errorCategory: "transport_not_implemented",
      },
    });
  }

  /** US-059 AC: "adds a SuppressionListEntry and revokes the
   * optional_marketing ConsentRecord". Upserts the suppression entry
   * (idempotent - a repeat unsubscribe click is not an error) and
   * revokes every currently-granted optional_marketing record found
   * for the matching subject, if any. */
  async unsubscribe(channel: string, recipient: string, reason: string): Promise<void> {
    await this.prisma.suppressionListEntry.upsert({
      where: { channel_recipient: { channel, recipient } },
      update: {},
      create: { channel, recipient, reason },
    });

    const purpose = await this.prisma.consentPurpose.findUnique({ where: { key: OPTIONAL_MARKETING_PURPOSE_KEY } });
    if (!purpose) {
      return;
    }

    const subjectWhere = await this.resolveConsentSubjectWhere(recipient);
    if (!subjectWhere) {
      return;
    }

    await this.prisma.consentRecord.updateMany({
      where: { consentPurposeId: purpose.id, ...subjectWhere, status: "GRANTED", revokedAt: null },
      data: { status: "DENIED", revokedAt: new Date() },
    });
  }

  private async hasGrantedMarketingConsent(recipient: string): Promise<boolean> {
    const purpose = await this.prisma.consentPurpose.findUnique({ where: { key: OPTIONAL_MARKETING_PURPOSE_KEY } });
    if (!purpose) {
      return false;
    }

    const subjectWhere = await this.resolveConsentSubjectWhere(recipient);
    if (!subjectWhere) {
      return false;
    }

    const record = await this.prisma.consentRecord.findFirst({
      where: { consentPurposeId: purpose.id, ...subjectWhere, status: "GRANTED", revokedAt: null },
    });
    return record !== null;
  }

  /** Resolves `recipient` (an email or phone string) to whichever
   * subject - Customer, LeadSubmission, or User, in that order - it
   * matches, returning the discriminator ConsentRecord.where() needs.
   * Null when no subject matches at all. */
  private async resolveConsentSubjectWhere(
    recipient: string,
  ): Promise<{ customerId: string } | { leadSubmissionId: string } | { userId: string } | null> {
    const customer = await this.prisma.customer.findFirst({ where: { OR: [{ email: recipient }, { phone: recipient }] } });
    if (customer) {
      return { customerId: customer.id };
    }

    const lead = await this.prisma.leadSubmission.findFirst({ where: { OR: [{ email: recipient }, { phone: recipient }] } });
    if (lead) {
      return { leadSubmissionId: lead.id };
    }

    const user = await this.prisma.user.findFirst({ where: { email: recipient } });
    if (user) {
      return { userId: user.id };
    }

    return null;
  }

  private async enqueue(
    client: NotificationWriteClient,
    scheduleDelivery: boolean,
    type: NotificationType,
    recipientEmail: string,
    userId: string,
    message: OutboundEmailMessage,
  ): Promise<string> {
    const payload: DurableNotificationPayload = {
      subject: message.subject,
      textBody: message.textBody,
      templateVersion: message.templateVersion,
      correlationId: message.correlationId,
    };
    const job = await client.notificationJob.create({
      data: {
        type,
        recipientEmail,
        userId,
        correlationId: message.correlationId,
        templateVersion: message.templateVersion,
        payloadEncrypted: this.payloadCrypto.encrypt(JSON.stringify(payload)),
        maxAttempts: MAX_ATTEMPTS,
      },
    });
    if (scheduleDelivery) this.scheduleDrain(0);
    return job.id;
  }

  /** Processes one bounded batch. Public so operational/startup and
   * failure-mode tests can invoke the same worker path without a second
   * implementation. */
  async processAvailableJobs(): Promise<number> {
    await this.quarantineExpiredProcessingLeases();
    const jobs = await this.claimJobs();
    await Promise.all(jobs.map((job) => this.deliverClaimedJob(job)));
    return jobs.length;
  }

  private scheduleDrain(delayMs: number): void {
    if (!this.workerStarted || this.shuttingDown || this.drainScheduled || this.drainPromise) return;
    this.drainScheduled = true;
    const timer = setTimeout(() => {
      this.drainScheduled = false;
      if (this.shuttingDown || this.drainPromise) return;
      const drain = this.processAvailableJobs();
      this.drainPromise = drain;
      drain
        .catch(() => this.logger.error("Notification outbox worker cycle failed"))
        .finally(() => {
          if (this.drainPromise === drain) this.drainPromise = null;
        });
    }, delayMs);
    timer.unref();
  }

  private claimJobs(): Promise<ClaimedNotificationJob[]> {
    const leaseExpiresAt = new Date(Date.now() + LEASE_MS);
    return this.prisma.$queryRaw<ClaimedNotificationJob[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "notification_jobs"
        WHERE "status" IN ('QUEUED'::"notification_status", 'RETRY_PENDING'::"notification_status")
          AND "next_attempt_at" <= NOW()
        ORDER BY "next_attempt_at" ASC, "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${CLAIM_BATCH_SIZE}
      )
      UPDATE "notification_jobs" AS job
      SET "status" = 'PROCESSING'::"notification_status",
          "retry_count" = job."retry_count" + 1,
          "last_attempt_at" = NOW(),
          "locked_at" = NOW(),
          "lock_expires_at" = ${leaseExpiresAt},
          "locked_by" = ${this.workerId},
          "updated_at" = NOW()
      FROM candidates
      WHERE job."id" = candidates."id"
      RETURNING job."id",
                job."type",
                job."recipient_email" AS "recipientEmail",
                job."user_id" AS "userId",
                job."correlation_id" AS "correlationId",
                job."retry_count" AS "retryCount",
                job."max_attempts" AS "maxAttempts",
                job."payload_encrypted" AS "payloadEncrypted"
    `);
  }

  /**
   * A worker may die after SMTP accepted a message but before PostgreSQL
   * recorded SENT. Once its dispatch lease expires there is no reliable way
   * to distinguish that case from a crash immediately before send. Retrying
   * would therefore be a blind duplicate-delivery risk. Park the job for
   * operator reconciliation instead; UNKNOWN_RESULT is deliberately terminal.
   */
  private async quarantineExpiredProcessingLeases(): Promise<void> {
    const jobs = await this.prisma.$queryRaw<Array<{ id: string; userId: string | null; type: NotificationType }>>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "notification_jobs"
        WHERE "status" = 'PROCESSING'::"notification_status"
          AND "lock_expires_at" <= NOW()
        FOR UPDATE SKIP LOCKED
        LIMIT ${CLAIM_BATCH_SIZE}
      )
      UPDATE "notification_jobs" AS job
      SET "status" = 'UNKNOWN_RESULT'::"notification_status",
          "failure_reason" = 'LEASE_EXPIRED_DURING_DISPATCH',
          "locked_at" = NULL,
          "lock_expires_at" = NULL,
          "locked_by" = NULL,
          "updated_at" = NOW()
      FROM candidates
      WHERE job."id" = candidates."id"
      RETURNING job."id", job."user_id" AS "userId", job."type"
    `);

    await Promise.all(jobs.map((job) => job.userId && (job.type === "PASSWORD_RESET" || job.type === "PASSWORD_CHANGED")
      ? this.securityEventService.record({
          type: "PASSWORD_NOTIFICATION_FAILED",
          userId: job.userId,
          metadata: {
            jobId: job.id,
            failureReason: "LEASE_EXPIRED_DURING_DISPATCH",
            terminal: true,
            outcome: "UNKNOWN_RESULT",
          },
        })
      : Promise.resolve()));
  }

  private async deliverClaimedJob(job: ClaimedNotificationJob): Promise<void> {
    const heartbeat = setInterval(() => {
      this.prisma.notificationJob
        .updateMany({
          where: { id: job.id, status: "PROCESSING", lockedBy: this.workerId },
          data: { lockExpiresAt: new Date(Date.now() + LEASE_MS) },
        })
        .catch(() => this.logger.error("Notification outbox lease renewal failed"));
    }, Math.floor(LEASE_MS / 3));
    heartbeat.unref();

    try {
      let payload: DurableNotificationPayload;
      try {
        payload = this.parsePayload(job.payloadEncrypted);
      } catch {
        await this.finishFailure(job, "INVALID_OR_MISSING_PAYLOAD", true);
        return;
      }

      try {
        const result = await this.mailTransport.send({
          to: job.recipientEmail,
          subject: payload.subject,
          textBody: payload.textBody,
          templateVersion: payload.templateVersion,
          correlationId: payload.correlationId,
          idempotencyKey: job.id,
        });
        if (result.delivered) {
          await this.prisma.notificationJob.updateMany({
            where: { id: job.id, status: "PROCESSING", lockedBy: this.workerId },
            data: {
              status: "SENT",
              failureReason: null,
              providerMessageId: result.providerMessageId ?? null,
              sentAt: new Date(),
              lockedAt: null,
              lockExpiresAt: null,
              lockedBy: null,
            },
          });
          return;
        }
        if (result.disposition === "UNCERTAIN") {
          await this.finishUnknownResult(job, this.sanitizeFailureReason(result.failureReason), result.providerMessageId);
          return;
        }
        await this.finishFailure(
          job,
          this.sanitizeFailureReason(result.failureReason),
          result.disposition === "PERMANENT",
        );
      } catch {
        // A transport is contractually non-throwing. Treat implementation
        // violations as retryable infrastructure failures without logging
        // the error object (it may embed transport configuration).
        await this.finishFailure(job, "UNEXPECTED_DISPATCH_ERROR", false);
      }
    } finally {
      clearInterval(heartbeat);
    }
  }

  private parsePayload(encrypted: string | null): DurableNotificationPayload {
    if (!encrypted) throw new Error("INVALID_NOTIFICATION_PAYLOAD");
    const parsed = JSON.parse(this.payloadCrypto.decrypt(encrypted)) as Partial<DurableNotificationPayload>;
    if (
      typeof parsed.subject !== "string" ||
      typeof parsed.textBody !== "string" ||
      typeof parsed.templateVersion !== "string" ||
      typeof parsed.correlationId !== "string"
    ) {
      throw new Error("INVALID_NOTIFICATION_PAYLOAD");
    }
    return parsed as DurableNotificationPayload;
  }

  private async finishFailure(job: ClaimedNotificationJob, reason: string, permanent: boolean): Promise<void> {
    const deadLetter = permanent || job.retryCount >= job.maxAttempts;
    const nextAttemptAt = deadLetter
      ? new Date()
      : new Date(Date.now() + Math.min(BASE_RETRY_DELAY_MS * 2 ** Math.max(job.retryCount - 1, 0), MAX_RETRY_DELAY_MS));
    const updated = await this.prisma.notificationJob.updateMany({
      where: { id: job.id, status: "PROCESSING", lockedBy: this.workerId },
      data: {
        status: deadLetter ? "DEAD_LETTER" : "RETRY_PENDING",
        failureReason: reason,
        nextAttemptAt,
        lockedAt: null,
        lockExpiresAt: null,
        lockedBy: null,
      },
    });
    if (updated.count === 1 && job.userId) {
      await this.securityEventService.record({
        type: "PASSWORD_NOTIFICATION_FAILED",
        userId: job.userId,
        metadata: { jobId: job.id, failureReason: reason, terminal: deadLetter },
      });
    }
  }

  private async finishUnknownResult(
    job: ClaimedNotificationJob,
    reason: string,
    providerMessageId?: string,
  ): Promise<void> {
    const updated = await this.prisma.notificationJob.updateMany({
      where: { id: job.id, status: "PROCESSING", lockedBy: this.workerId },
      data: {
        status: "UNKNOWN_RESULT",
        failureReason: reason,
        providerMessageId: providerMessageId ?? null,
        lockedAt: null,
        lockExpiresAt: null,
        lockedBy: null,
      },
    });
    if (updated.count === 1 && job.userId) {
      await this.securityEventService.record({
        type: "PASSWORD_NOTIFICATION_FAILED",
        userId: job.userId,
        metadata: { jobId: job.id, failureReason: reason, terminal: true, outcome: "UNKNOWN_RESULT" },
      });
    }
  }

  private sanitizeFailureReason(reason: string | undefined): string {
    if (!reason) return "UNKNOWN_DELIVERY_FAILURE";
    const safeCodes = new Set([
      "SMTP_NOT_CONFIGURED",
      "SMTP_TIMEOUT",
      "SMTP_AUTHENTICATION_FAILED",
      "SMTP_TEMPORARY_REJECTED",
      "SMTP_PERMANENT_REJECTED",
      "SMTP_CONNECTION_FAILED",
      "SMTP_UNKNOWN_RESULT",
      "SMTP_REJECTED",
    ]);
    return safeCodes.has(reason) ? reason : "SMTP_DELIVERY_FAILED";
  }

}
