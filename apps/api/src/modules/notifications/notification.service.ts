import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { SecurityEventService } from "../../common/security-events/security-event.service";
import type { EnvConfig } from "../../config/env.validation";
import { MAIL_TRANSPORT, type MailTransport, type OutboundEmailMessage } from "./mail-transport.interface";

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
