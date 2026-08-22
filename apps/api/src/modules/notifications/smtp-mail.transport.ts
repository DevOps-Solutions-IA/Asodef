import { createHash } from "node:crypto";
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
  private readonly messageIdDomain: string;

  constructor(configService: ConfigService<EnvConfig, true>) {
    const host = configService.get("SMTP_HOST", { infer: true });
    const connectHost = configService.get("SMTP_CONNECT_HOST", { infer: true }) || host;
    const secure = configService.get("SMTP_SECURE", { infer: true });
    this.transporter = nodemailer.createTransport({
      // Nodemailer resolves FQDNs through DNS directly before falling back to
      // getaddrinfo, so Docker extra_hosts alone cannot guarantee the private
      // submission path. Connect to the explicit private gateway while using
      // the public SMTP identity for certificate verification.
      host: connectHost,
      port: configService.get("SMTP_PORT", { infer: true }) ?? 587,
      secure,
      // Port 587 must fail closed if STARTTLS is unavailable. Port 465 is
      // already TLS from connection establishment.
      requireTLS: !secure,
      tls: { rejectUnauthorized: true, servername: host },
      auth: this.buildAuth(configService),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    this.fromAddress =
      configService.get("SMTP_FROM", { infer: true }) || configService.get("CORPORATE_EMAIL", { infer: true });
    this.messageIdDomain = this.fromAddress.slice(this.fromAddress.lastIndexOf("@") + 1).toLowerCase();
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
        messageId: message.idempotencyKey
          ? `<notification-${createHash("sha256").update(message.idempotencyKey).digest("hex")}@${this.messageIdDomain}>`
          : undefined,
      });
      return { delivered: true, providerMessageId: info.messageId };
    } catch (error) {
      const failure = this.classifyFailure(error);
      this.logger.error(`SMTP delivery failed (correlationId=${message.correlationId}, category=${failure.reason})`);
      return {
        delivered: false,
        disposition: failure.disposition,
        failureReason: failure.reason,
      };
    }
  }

  private classifyFailure(error: unknown): {
    disposition: "RETRYABLE" | "PERMANENT" | "UNCERTAIN";
    reason: string;
  } {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    const responseCode = typeof error === "object" && error !== null && "responseCode" in error
      ? Number(error.responseCode)
      : Number.NaN;
    if (code === "ETIMEDOUT" || code === "ESOCKET") {
      return { disposition: "UNCERTAIN", reason: "SMTP_TIMEOUT" };
    }
    if (code === "EAUTH") {
      return { disposition: "PERMANENT", reason: "SMTP_AUTHENTICATION_FAILED" };
    }
    if (responseCode >= 400 && responseCode < 500) {
      return { disposition: "RETRYABLE", reason: "SMTP_TEMPORARY_REJECTED" };
    }
    if (responseCode >= 500 && responseCode < 600) {
      return { disposition: "PERMANENT", reason: "SMTP_PERMANENT_REJECTED" };
    }
    if (code === "EDNS" || code === "ECONNECTION") {
      return { disposition: "RETRYABLE", reason: "SMTP_CONNECTION_FAILED" };
    }
    if (code === "EENVELOPE" || code === "EMESSAGE") {
      return { disposition: "PERMANENT", reason: "SMTP_REJECTED" };
    }
    // Unknown exceptions may occur after the remote server accepted DATA.
    // Without positive evidence that acceptance was impossible, retrying
    // would risk duplicate security mail.
    return { disposition: "UNCERTAIN", reason: "SMTP_UNKNOWN_RESULT" };
  }
}
