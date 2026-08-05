import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CommunicationLog } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { SecurityEventService } from "../../common/security-events/security-event.service";
import type { EnvConfig } from "../../config/env.validation";
import { MAIL_TRANSPORT, type MailTransport, type OutboundEmailMessage } from "./mail-transport.interface";

const OPTIONAL_MARKETING_PURPOSE_KEY = "optional_marketing";
const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

const TEMPLATE_VERSION = "v1";

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
 * dispatch is fire-and-forget from the caller's perspective - queuing a
 * job (a fast local DB insert) is the only part any HTTP request awaits.
 * Actual delivery, success or failure, happens strictly after that,
 * which is also what makes forgot-password's response timing identical
 * regardless of whether the account exists (see
 * PasswordRecoveryService.forgotPassword).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly corporateEmail: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEventService: SecurityEventService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
    configService: ConfigService<EnvConfig, true>,
  ) {
    this.corporateEmail = configService.get("CORPORATE_EMAIL", { infer: true });
  }

  /** Returns once the job row is queued - never waits for delivery. */
  async queuePasswordResetEmail(input: QueuePasswordResetEmailInput): Promise<string> {
    const job = await this.prisma.notificationJob.create({
      data: {
        type: "PASSWORD_RESET",
        recipientEmail: input.recipientEmail,
        userId: input.userId,
        correlationId: input.correlationId,
        templateVersion: TEMPLATE_VERSION,
      },
    });

    void this.dispatch(job.id, input.userId, {
      to: input.recipientEmail,
      subject: "Restablece tu contraseña - ASODEF",
      textBody: this.buildPasswordResetBody(input.resetUrl),
      templateVersion: TEMPLATE_VERSION,
      correlationId: input.correlationId,
    });

    return job.id;
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
    const job = await this.prisma.notificationJob.create({
      data: {
        type: "PASSWORD_RESET",
        recipientEmail: input.recipientEmail,
        userId: input.userId,
        correlationId: input.correlationId,
        templateVersion: TEMPLATE_VERSION,
      },
    });

    void this.dispatch(job.id, input.userId, {
      to: input.recipientEmail,
      subject: "Bienvenido a ASODEF - configura tu contraseña",
      textBody: this.buildAccountInvitationBody(input.fullName, input.setupUrl),
      templateVersion: TEMPLATE_VERSION,
      correlationId: input.correlationId,
    });

    return job.id;
  }

  async queuePasswordChangedEmail(input: QueuePasswordChangedEmailInput): Promise<string> {
    const job = await this.prisma.notificationJob.create({
      data: {
        type: "PASSWORD_CHANGED",
        recipientEmail: input.recipientEmail,
        userId: input.userId,
        correlationId: input.correlationId,
        templateVersion: TEMPLATE_VERSION,
      },
    });

    void this.dispatch(job.id, input.userId, {
      to: input.recipientEmail,
      subject: "Tu contraseña fue modificada - ASODEF",
      textBody: this.buildPasswordChangedBody(),
      templateVersion: TEMPLATE_VERSION,
      correlationId: input.correlationId,
    });

    return job.id;
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
    const job = await this.prisma.notificationJob.create({
      data: {
        type: "SECURITY_ALERT",
        recipientEmail: input.recipientEmail,
        userId: input.userId,
        correlationId: input.correlationId,
        templateVersion: TEMPLATE_VERSION,
      },
    });

    void this.dispatch(job.id, input.userId, {
      to: input.recipientEmail,
      subject: input.subject,
      textBody: input.textBody,
      templateVersion: TEMPLATE_VERSION,
      correlationId: input.correlationId,
    });

    return job.id;
  }

  /**
   * US-059 AC (verbatim method name/signature): a stub - persists a
   * CommunicationLog row and logs the rendered content, no real SMTP/
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

    this.logger.log(`[stub] would send template "${templateKey}" to ${recipient} via ${template.channel}: ${JSON.stringify(data)}`);

    return this.prisma.communicationLog.create({
      data: { templateId: template.id, recipient, channel: template.channel, status: "SENT", sentAt: new Date() },
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

  private async dispatch(jobId: string, userId: string, message: OutboundEmailMessage): Promise<void> {
    try {
      const result = await this.mailTransport.send(message);
      await this.prisma.notificationJob.update({
        where: { id: jobId },
        data: {
          status: result.delivered ? "SENT" : "FAILED",
          failureReason: result.delivered ? null : (result.failureReason ?? "UNKNOWN_FAILURE"),
          retryCount: { increment: 1 },
          sentAt: result.delivered ? new Date() : null,
        },
      });

      if (!result.delivered) {
        await this.securityEventService.record({
          type: "PASSWORD_NOTIFICATION_FAILED",
          userId,
          metadata: { jobId, failureReason: result.failureReason ?? "UNKNOWN_FAILURE" },
        });
      }
    } catch (error) {
      // MailTransport.send() must never throw, so reaching here means a
      // bug in a transport implementation - a background dispatch must
      // still never produce an unhandled rejection or crash the process.
      this.logger.error(`Unexpected error dispatching notification ${jobId}`, error instanceof Error ? error.stack : undefined);
      await this.prisma.notificationJob
        .update({
          where: { id: jobId },
          data: { status: "FAILED", failureReason: "UNEXPECTED_DISPATCH_ERROR", retryCount: { increment: 1 } },
        })
        .catch(() => undefined);
    }
  }

  private buildPasswordResetBody(resetUrl: string): string {
    return [
      "Hemos recibido una solicitud para restablecer tu contraseña en ASODEF.",
      `Si fuiste tú, haz clic en el siguiente enlace para continuar: ${resetUrl}`,
      "Este enlace expira pronto y solo puede usarse una vez.",
      "Si no solicitaste este cambio, puedes ignorar este mensaje con tranquilidad.",
      `¿Dudas? Escríbenos a ${this.corporateEmail}.`,
    ].join("\n\n");
  }

  private buildAccountInvitationBody(fullName: string, setupUrl: string): string {
    return [
      `Hola ${fullName},`,
      "Se creó una cuenta para ti en la plataforma administrativa de ASODEF.",
      `Para activarla, configura tu contraseña aquí: ${setupUrl}`,
      "Este enlace expira pronto y solo puede usarse una vez.",
      `¿Dudas? Escríbenos a ${this.corporateEmail}.`,
    ].join("\n\n");
  }

  private buildPasswordChangedBody(): string {
    return [
      "Tu contraseña en ASODEF fue modificada correctamente.",
      "Si no reconoces este cambio, contáctanos de inmediato.",
      `¿Dudas? Escríbenos a ${this.corporateEmail}.`,
    ].join("\n\n");
  }
}
