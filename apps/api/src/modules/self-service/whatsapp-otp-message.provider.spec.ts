import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { WhatsAppOtpMessageProvider } from "./whatsapp-otp-message.provider";

const TOKEN = ["fixture", "meta", "access", "token", "abcdefghijklmnopqrstuvwxyz"].join("-");

function config(): ConfigService<EnvConfig, true> {
  const values: Partial<EnvConfig> = {
    WHATSAPP_GRAPH_API_VERSION: "v24.0",
    WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
    WHATSAPP_ACCESS_TOKEN: TOKEN,
    WHATSAPP_OTP_TEMPLATE_NAME: "asodef_otp",
    WHATSAPP_OTP_TEMPLATE_LANGUAGE: "es",
    WHATSAPP_TIMEOUT_MS: 5000,
  };
  return {
    get: jest.fn((key: keyof EnvConfig) => values[key]),
  } as unknown as ConfigService<EnvConfig, true>;
}

describe("WhatsAppOtpMessageProvider", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends the ASODEF OTP with the approved authentication template", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          messaging_product: "whatsapp",
          contacts: [{ input: "573001112233", wa_id: "573001112233" }],
          messages: [{ id: "wamid.fixture", message_status: "accepted" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = new WhatsAppOtpMessageProvider(config());

    await expect(
      provider.deliverOtp({
        channel: "whatsapp",
        destination: "300 111 2233",
        code: "123456",
        expiresInMinutes: 10,
      }),
    ).resolves.toEqual({ status: "VERIFIED", data: { delivered: true } });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v24.0/123456789012345/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
      }),
    );

    const request = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(request?.body));
    expect(payload).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "573001112233",
      type: "template",
      template: {
        name: "asodef_otp",
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "123456" }],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: "123456" }],
          },
        ],
      },
    });
  });

  it("fails closed for non-WhatsApp channels and invalid mobiles", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    const provider = new WhatsAppOtpMessageProvider(config());

    await expect(
      provider.deliverOtp({
        channel: "sms",
        destination: "3001112233",
        code: "123456",
        expiresInMinutes: 10,
      }),
    ).resolves.toEqual(expect.objectContaining({ status: "UNAVAILABLE" }));

    await expect(
      provider.deliverOtp({
        channel: "whatsapp",
        destination: "1234",
        code: "123456",
        expiresInMinutes: 10,
      }),
    ).resolves.toEqual(expect.objectContaining({ status: "UNAVAILABLE" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not claim delivery when Meta rejects the request", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "Rejected" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = new WhatsAppOtpMessageProvider(config());

    await expect(
      provider.deliverOtp({
        channel: "whatsapp",
        destination: "573001112233",
        code: "123456",
        expiresInMinutes: 10,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "UNAVAILABLE",
        error: expect.objectContaining({ code: "WHATSAPP_OTP_REJECTED" }),
      }),
    );
  });
});
