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
    });
    this.fromAddress =
      configService.get("SMTP_FROM", { infer: true }) || configService.get("CORPORATE_EMAIL", { infer: true });
  }

  private buildAuth(configService: ConfigService<EnvConfig, true>): { user: string; pass: string } | undefined {
    const user = configService.get("SMTP_USER", { infer: true });
    const pass = configService.get("SMTP_PASSWORD", { infer: true });
    return user ? { user, pass } : undefined;
  }

  async send(message: OutboundEmailMessage): Promise<MailSendResult> {
    try {
      const info: { messageId?: string } = await this.transporter.sendMail({
        from: this.fromAddress,
        to: message.to,
        subject: message.subject,
        text: message.textBody,
      });
      return { delivered: true, providerMessageId: info.messageId };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "UNKNOWN_SMTP_ERROR";
      this.logger.error(
        `SMTP delivery failed for correlationId=${message.correlationId}: ${failureReason}`,
      );
      return { delivered: false, failureReason };
    }
  }
}
