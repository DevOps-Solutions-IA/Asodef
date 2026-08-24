import type { Prisma } from "@prisma/client";
import { CommunicationChannelRegistry } from "./communication-channel.registry";
import { CommunicationsRuntimeError } from "./communications-runtime.error";
import type { EmailOutboxAdapter } from "./email-outbox.adapter";

describe("CommunicationChannelRegistry", () => {
  const enqueue = jest.fn();
  const registry = new CommunicationChannelRegistry({ enqueue } as unknown as EmailOutboxAdapter);

  beforeEach(() => enqueue.mockReset().mockResolvedValue(undefined));

  it("dispatches EMAIL only through the encrypted notification outbox adapter", async () => {
    const input = {
      communicationId: "communication-id",
      recipients: ["person@example.com"],
      subject: "Subject",
      textBody: "Body",
      templateReference: "template@v1",
      correlationId: "correlation-id",
    };

    await registry.dispatch({} as Prisma.TransactionClient, "EMAIL", input);

    expect(registry.capability("EMAIL")).toEqual({
      channel: "EMAIL",
      runtime: "AVAILABLE",
      adapter: "ENCRYPTED_NOTIFICATION_OUTBOX",
    });
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), input);
  });

  it.each(["WHATSAPP", "WEB_NOTIFICATION", "FUTURE"] as const)(
    "keeps %s contract-only without invoking an external transport",
    async (channel) => {
      expect(registry.capability(channel)).toMatchObject({ runtime: "CONTRACT_ONLY", adapter: null });
      await expect(
        registry.dispatch({} as Prisma.TransactionClient, channel, {
          communicationId: "communication-id",
          recipients: ["person@example.com"],
          subject: "Subject",
          textBody: "Body",
          templateReference: "template@v1",
          correlationId: "correlation-id",
        }),
      ).rejects.toMatchObject<Partial<CommunicationsRuntimeError>>({
        code: "TRANSPORT_NOT_AVAILABLE",
        retryable: false,
      });
      expect(enqueue).not.toHaveBeenCalled();
    },
  );

  it("fails closed for an unknown runtime channel", () => {
    expect(() => registry.assertAvailable("SMS" as "EMAIL")).toThrow(
      expect.objectContaining({ code: "TRANSPORT_NOT_AVAILABLE" }),
    );
    expect(enqueue).not.toHaveBeenCalled();
  });
});
