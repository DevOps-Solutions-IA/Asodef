import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";
import type { EnvConfig } from "../../config/env.validation";
import type { OutboundEmailMessage } from "./mail-transport.interface";
import { SmtpMailTransport } from "./smtp-mail.transport";

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

const verify = jest.fn();
const sendMail = jest.fn();
const createTransport = jest.mocked(nodemailer.createTransport);

const MESSAGE: OutboundEmailMessage = {
  to: "recipient@example.test",
  subject: "Safe subject",
  textBody: "Safe body",
  templateVersion: "security_password_recovery@v1",
  correlationId: "safe-correlation",
  idempotencyKey: "stable-job-id",
};

function config(overrides: Partial<EnvConfig> = {}): ConfigService<EnvConfig, true> {
  const values: Partial<EnvConfig> = {
    SMTP_HOST: "smtp.asodef.com.co",
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: "asodef-app",
    SMTP_PASSWORD: "synthetic-password",
    SMTP_FROM: "no-reply@asodef.com.co",
    CORPORATE_EMAIL: "info@asodef.com.co",
    ...overrides,
  };
  return { get: jest.fn((key: keyof EnvConfig) => values[key]) } as unknown as ConfigService<EnvConfig, true>;
}

describe("SmtpMailTransport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createTransport.mockReturnValue({ verify, sendMail } as never);
    verify.mockResolvedValue(true);
  });

  it("requires certificate-verified STARTTLS and authenticated submission", () => {
    new SmtpMailTransport(config());
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.asodef.com.co",
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { rejectUnauthorized: true, servername: "smtp.asodef.com.co" },
      auth: { user: "asodef-app", pass: "synthetic-password" },
    }));
  });

  it("uses implicit TLS without attempting a STARTTLS upgrade on port 465", () => {
    new SmtpMailTransport(config({ SMTP_PORT: 465, SMTP_SECURE: true }));
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true, requireTLS: false }));
  });

  it("uses a stable opaque Message-ID under the configured sender domain", async () => {
    sendMail.mockResolvedValue({ messageId: "provider-id" });
    const transport = new SmtpMailTransport(config());
    await expect(transport.send(MESSAGE)).resolves.toEqual({ delivered: true, providerMessageId: "provider-id" });
    const sent = sendMail.mock.calls[0]?.[0] as { messageId?: string };
    expect(sent.messageId).toMatch(/^<notification-[a-f0-9]{64}@asodef\.com\.co>$/);
    expect(sent.messageId).not.toContain(MESSAGE.idempotencyKey);
  });

  it.each([
    [{ code: "ETIMEDOUT", message: "secret timeout detail" }, "UNCERTAIN", "SMTP_TIMEOUT"],
    [{ code: "ESOCKET", message: "secret reset detail" }, "UNCERTAIN", "SMTP_TIMEOUT"],
    [{ code: "EENVELOPE", responseCode: 451 }, "RETRYABLE", "SMTP_TEMPORARY_REJECTED"],
    [{ code: "EENVELOPE", responseCode: 550 }, "PERMANENT", "SMTP_PERMANENT_REJECTED"],
    [{ code: "EAUTH", message: "credential detail" }, "PERMANENT", "SMTP_AUTHENTICATION_FAILED"],
    [{ code: "EDNS", message: "lookup detail" }, "RETRYABLE", "SMTP_CONNECTION_FAILED"],
    [{ code: "ECONNECTION", message: "connect detail" }, "RETRYABLE", "SMTP_CONNECTION_FAILED"],
    [{ code: "EMESSAGE", message: "content detail" }, "PERMANENT", "SMTP_REJECTED"],
    [new Error("unknown secret detail"), "UNCERTAIN", "SMTP_UNKNOWN_RESULT"],
  ] as const)("classifies a sanitized failure outcome", async (error, disposition, failureReason) => {
    const logged = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    sendMail.mockRejectedValue(error);
    const transport = new SmtpMailTransport(config());
    await expect(transport.send(MESSAGE)).resolves.toEqual({
      delivered: false,
      disposition,
      failureReason,
    });
    const output = JSON.stringify(logged.mock.calls);
    expect(output).toContain("safe-correlation");
    expect(output).not.toContain("secret");
    expect(output).not.toContain("credential detail");
    logged.mockRestore();
  });

  it("returns only sanitized health state", async () => {
    const transport = new SmtpMailTransport(config());
    await expect(transport.checkHealth()).resolves.toBe("AVAILABLE");
    verify.mockRejectedValueOnce(new Error("sensitive provider detail"));
    await expect(transport.checkHealth()).resolves.toBe("UNAVAILABLE");
  });
});
