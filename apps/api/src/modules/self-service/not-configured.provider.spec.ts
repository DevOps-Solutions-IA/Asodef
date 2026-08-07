import { NotConfiguredExternalCoreProvider, NotConfiguredSelfServiceMessageProvider } from "./not-configured.provider";

describe("NOT_CONFIGURED self-service adapters", () => {
  it("never returns fabricated core records", async () => {
    const provider = new NotConfiguredExternalCoreProvider();
    await expect(provider.startAffiliateLookup()).resolves.toEqual(expect.objectContaining({ status: "NOT_CONFIGURED", error: expect.objectContaining({ retryable: false }) }));
    await expect(provider.getCompanySummary()).resolves.not.toHaveProperty("data");
  });

  it("never claims that an OTP was delivered", async () => {
    const provider = new NotConfiguredSelfServiceMessageProvider();
    const result = await provider.deliverOtp();
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(result).not.toHaveProperty("data.delivered", true);
  });
});
