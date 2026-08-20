import { Logger } from "@nestjs/common";
import { NoopMailTransport } from "./noop-mail.transport";

describe("NoopMailTransport", () => {
  it("fails closed without logging recipient or message content", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const transport = new NoopMailTransport();

    const result = await transport.send({
      to: "sensitive-recipient@example.com",
      subject: "Sensitive subject",
      textBody: "https://example.com/reset?token=secret-marker",
      templateVersion: "v1",
      correlationId: "safe-correlation-id",
      idempotencyKey: "safe-job-id",
    });

    expect(result).toEqual({ delivered: false, failureReason: "SMTP_NOT_CONFIGURED" });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("safe-correlation-id");
    expect(logged).not.toContain("sensitive-recipient");
    expect(logged).not.toContain("Sensitive subject");
    expect(logged).not.toContain("secret-marker");
    warn.mockRestore();
  });
});
