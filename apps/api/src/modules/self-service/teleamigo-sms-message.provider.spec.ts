import { TeleamigoSmsMessageProvider } from "./teleamigo-sms-message.provider";

describe("TeleamigoSmsMessageProvider", () => {
  it("fails closed until the Teleamigo/IA Tech HTTP contract is verified", async () => {
    const provider = new TeleamigoSmsMessageProvider();

    await expect(provider.deliverOtp({
      channel: "sms",
      destination: "573001112233",
      code: "123456",
      expiresInMinutes: 10,
    })).resolves.toEqual({
      status: "UNAVAILABLE",
      error: {
        code: "TELEAMIGO_API_CONTRACT_UNVERIFIED",
        message: "La integración SMS está pendiente de validar el contrato HTTP oficial de Teleamigo/IA Tech.",
        retryable: false,
      },
    });
  });
});
