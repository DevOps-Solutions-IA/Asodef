import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { TeleamigoSmsMessageProvider } from "./teleamigo-sms-message.provider";

function config(): ConfigService<EnvConfig, true> {
  const values: Partial<EnvConfig> = {
    TELEAMIGO_SMS_BASE_URL: "https://abc123.api.infobip.com",
    TELEAMIGO_SMS_API_KEY: "test-api-key-not-a-real-secret",
    TELEAMIGO_SMS_FROM: "ASODEF",
    TELEAMIGO_SMS_TIMEOUT_MS: 5000,
  };
  return { get: jest.fn((key: keyof EnvConfig) => values[key]) } as unknown as ConfigService<EnvConfig, true>;
}

describe("TeleamigoSmsMessageProvider", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends the existing ASODEF OTP through the scoped SMS API-key endpoint", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        bulkId: "bulk-1",
        messages: [{
          messageId: "sms-1",
          destination: "573001112233",
          status: {
            groupId: 1,
            groupName: "PENDING",
            id: 26,
            name: "PENDING_ACCEPTED",
            description: "Message sent to next instance",
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const provider = new TeleamigoSmsMessageProvider(config());

    await expect(provider.deliverOtp({
      channel: "sms",
      destination: "300 111 2233",
      code: "123456",
      expiresInMinutes: 10,
    })).resolves.toEqual({ status: "VERIFIED", data: { delivered: true } });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://abc123.api.infobip.com/sms/3/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "App test-api-key-not-a-real-secret",
        }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(request?.body));
    expect(payload).toEqual({
      messages: [{
        sender: "ASODEF",
        destinations: [{ to: "573001112233" }],
        content: { text: expect.stringContaining("123456") },
      }],
    });
  });

  it("fails closed for non-SMS channels and invalid Colombian mobiles", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    const provider = new TeleamigoSmsMessageProvider(config());

    await expect(provider.deliverOtp({
      channel: "whatsapp",
      destination: "3001112233",
      code: "123456",
      expiresInMinutes: 10,
    })).resolves.toEqual(expect.objectContaining({ status: "UNAVAILABLE" }));

    await expect(provider.deliverOtp({
      channel: "sms",
      destination: "1234",
      code: "123456",
      expiresInMinutes: 10,
    })).resolves.toEqual(expect.objectContaining({ status: "UNAVAILABLE" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not claim delivery when the provider response is not accepted", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        bulkId: "bulk-2",
        messages: [{
          messageId: "sms-2",
          destination: "573001112233",
          status: {
            groupId: 5,
            groupName: "REJECTED",
            id: 42,
            name: "REJECTED_NETWORK",
            description: "Rejected",
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const provider = new TeleamigoSmsMessageProvider(config());

    await expect(provider.deliverOtp({
      channel: "sms",
      destination: "573001112233",
      code: "123456",
      expiresInMinutes: 10,
    })).resolves.toEqual(expect.objectContaining({
      status: "UNAVAILABLE",
      error: expect.objectContaining({ code: "TELEAMIGO_SMS_REJECTED" }),
    }));
  });
});
