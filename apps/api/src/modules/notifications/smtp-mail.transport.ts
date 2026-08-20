import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";
import type { EnvConfig } from "../../config/env.validation";
import type { MailSendResult, MailTransport, OutboundEmailMessage } from "./mail-transport.interface";

/**
 * Real SMTP delivery via nodemailer, only ever constructed/selected when
 * SMTP_HOST is non-empty (see mail-transport.provider.ts). Never throws:
 * a transport-level failure is translated into `{delivered:false,
 * failureReason}`, and the failure reason is nodemailer's error message,
 * never the SMTP credentials themselves.
 */
@Injectable()
export class SmtpMailTransport implements MailTransport {
  private readonly logger = new Logger(SmtpMailTransport.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.transporter = nodemailer.createTransport({
      host: configService.get("SMTP_HOST", { infer: true }),
      port: configService.get("SMTP_PORT", { infer: true }) ?? 587,
      secure: configService.get("SMTP_SECURE", { infer: true }),
      auth: this.buildAuth(configService),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    this.fromAddress =
      configService.get("SMTP_FROM", { infer: true }) || configService.get("CORPORATE_EMAIL", { infer: true });
  }

  private buildAuth(configService: ConfigService<EnvConfig, true>): { user: string; pass: string } | undefined {
    const user = configService.get("SMTP_USER", { infer: true });
    const pass = configService.get("SMTP_PASSWORD", { infer: true });
    return user ? { user, pass } : undefined;
  }

  async checkHealth(): Promise<"AVAILABLE" | "UNAVAILABLE"> {
    try {
      await this.transporter.verify();
      return "AVAILABLE";
    } catch {
      return "UNAVAILABLE";
    }
  }

  async send(message: OutboundEmailMessage): Promise<MailSendResult> {
    try {
      const info: { messageId?: string } = await this.transporter.sendMail({
        from: this.fromAddress,
        to: message.to,
        subject: message.subject,
        text: message.textBody,
        // Stable across lease recovery/retry for this outbox row. This
        // gives SMTP infrastructure a deterministic duplicate key where
        // supported and makes repeated delivery attributable to one job.
        messageId: message.idempotencyKey ? `<notification-${message.idempotencyKey}@asodef.invalid>` : undefined,
      });
      return { delivered: true, providerMessageId: info.messageId };
    } catch (error) {
      const failureReason = this.classifyFailure(error);
      this.logger.error(`SMTP delivery failed (correlationId=${message.correlationId}, category=${failureReason})`);
      return { delivered: false, uncertain: failureReason === "SMTP_TIMEOUT", failureReason };
    }
  }

  private classifyFailure(error: unknown): string {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ETIMEDOUT" || code === "ESOCKET") return "SMTP_TIMEOUT";
    if (code === "EAUTH") return "SMTP_AUTHENTICATION_FAILED";
    if (code === "EENVELOPE" || code === "EMESSAGE") return "SMTP_REJECTED";
    return "SMTP_DELIVERY_FAILED";
  }
}
