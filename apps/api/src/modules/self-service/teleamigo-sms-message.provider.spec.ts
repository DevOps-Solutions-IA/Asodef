import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { TeleamigoSmsMessageProvider } from "./teleamigo-sms-message.provider";

function config(): ConfigService<EnvConfig, true> {
  const values: Partial<EnvConfig> = {
    TELEAMIGO_SMS_BASE_URL: "https://sms.iatechsas.com",
    TELEAMIGO_SMS_USERNAME: "api-user",
    TELEAMIGO_SMS_API_PASSWORD: "api-password",
    TELEAMIGO_SMS_FROM: "ASODEF",
    TELEAMIGO_SMS_TIMEOUT_MS: 5000,
  };
  return { get: jest.fn((key: keyof EnvConfig) => values[key]) } as unknown as ConfigService<EnvConfig, true>;
}

describe("TeleamigoSmsMessageProvider", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends the existing ASODEF OTP through the documented SMS REST endpoint", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        campaignId: 1,
        sendingId: 2,
        result: [{ accepted: true, to: "573001112233", id: "sms-1", parts: 1 }],
      }), { status: 202, headers: { "Content-Type": "application/json" } }),
    );
    const provider = new TeleamigoSmsMessageProvider(config());

    await expect(provider.deliverOtp({
      channel: "sms",
      destination: "300 111 2233",
      code: "123456",
      expiresInMinutes: 10,
    })).resolves.toEqual({ status: "VERIFIED", data: { delivered: true } });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sms.iatechsas.com/api/rest/sms",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(request?.body));
    expect(payload).toMatchObject({
      to: ["573001112233"],
      from: "ASODEF",
      parts: 1,
      encoding: "gsm",
    });
    expect(payload.message).toContain("123456");
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

  it("does not claim delivery when Teleamigo rejects the recipient", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        result: [{ accepted: false, to: "573001112233", error: { code: 102, description: "No valid recipients" } }],
      }), { status: 207, headers: { "Content-Type": "application/json" } }),
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
