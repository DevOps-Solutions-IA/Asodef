import { createHmac } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { BoldPaymentProvider } from "./bold-payment-provider.service";
import { MockBoldTransport } from "./mock-bold.transport";
import type { BoldTransport } from "./bold-transport.interface";

function config(values: Partial<Record<keyof EnvConfig, unknown>> = {}): ConfigService<EnvConfig, true> {
  const defaults: Partial<Record<keyof EnvConfig, unknown>> = {
    BOLD_MODE: "production",
    BOLD_WEBHOOK_SECRET: "webhook-test-secret",
  };
  return {
    get: jest.fn((key: keyof EnvConfig) => values[key] ?? defaults[key]),
  } as unknown as ConfigService<EnvConfig, true>;
}

describe("BoldPaymentProvider (mock transport)", () => {
  let mockTransport: MockBoldTransport;
  let provider: BoldPaymentProvider;

  beforeEach(() => {
    mockTransport = new MockBoldTransport();
    provider = new BoldPaymentProvider(mockTransport, config());
  });

  it("Example (AC): createPayment() in mock mode returns a well-formed CreatePaymentResult with no outbound HTTP request", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");

    const result = await provider.createPayment({ publicReference: "pub-ref-1", amountCents: 5_000_000, currency: "COP" });

    expect(result.status).toBe("APPROVED");
    expect(result.raw).toEqual({
      intent: { status: "ACTIVE", reference_id: "pub-ref-1", amount: { currency: "COP", total_amount: 5_000_000 } },
      payment: { status: "APPROVED", reference_id: "pub-ref-1" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("maps a rejected mock outcome through without altering the raw status", async () => {
    mockTransport.setNextPaymentStatus("REJECTED");
    const result = await provider.createPayment({ publicReference: "pub-ref-2", amountCents: 1_000_000, currency: "COP" });
    expect(result.status).toBe("REJECTED");
  });

  it("logs (never throws) on an unknown provider status, preserving it as-is for diagnostics", async () => {
    mockTransport.setNextPaymentStatus("SOME_FUTURE_BOLD_STATUS");
    const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    const result = await provider.createPayment({ publicReference: "pub-ref-3", amountCents: 1, currency: "COP" });

    expect(result.status).toBe("SOME_FUTURE_BOLD_STATUS");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("getPaymentStatus returns the mapped-through status and raw payload", async () => {
    await provider.createPayment({ publicReference: "pub-ref-4", amountCents: 2_000_000, currency: "COP" });
    const status = await provider.getPaymentStatus("pub-ref-4");
    expect(status).toEqual({ status: "APPROVED", raw: { status: "APPROVED", reference_id: "pub-ref-4" } });
  });

  it("verifies the current Bold x-bold-signature contract using HMAC-SHA256 over Base64(raw body)", async () => {
    const payload = { id: "notification-1", type: "SALE_APPROVED", data: { metadata: { reference: "ref-1" } } };
    const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
    const signature = createHmac("sha256", "webhook-test-secret").update(rawBody.toString("base64")).digest("hex");

    const result = await provider.validateNotification({
      payload,
      rawBody,
      headers: { "x-bold-signature": signature },
    });

    expect(result.verified).toBe(true);
    expect(result.raw).toBe(payload);
  });

  it("rejects a changed raw body even when the parsed payload object is the same", async () => {
    const payload = { id: "notification-2", type: "SALE_APPROVED" };
    const signedRawBody = Buffer.from(JSON.stringify(payload), "utf8");
    const signature = createHmac("sha256", "webhook-test-secret").update(signedRawBody.toString("base64")).digest("hex");
    const changedRawBody = Buffer.from('{"type":"SALE_APPROVED","id":"notification-2"}', "utf8");

    const result = await provider.validateNotification({
      payload,
      rawBody: changedRawBody,
      headers: { "x-bold-signature": signature },
    });

    expect(result.verified).toBe(false);
  });

  it("fails closed when production webhook secret or raw body is missing", async () => {
    const withoutSecret = new BoldPaymentProvider(mockTransport, config({ BOLD_WEBHOOK_SECRET: "" }));
    const payload = { id: "notification-3", type: "SALE_APPROVED" };

    await expect(withoutSecret.validateNotification({
      payload,
      rawBody: Buffer.from(JSON.stringify(payload)),
      headers: { "x-bold-signature": "0".repeat(64) },
    })).resolves.toMatchObject({ verified: false });

    await expect(provider.validateNotification({
      payload,
      headers: { "x-bold-signature": "0".repeat(64) },
    })).resolves.toMatchObject({ verified: false });
  });

  it("US-056: createRefund succeeds in mock mode for an already-created payment, with no outbound HTTP request", async () => {
    await provider.createPayment({ publicReference: "pub-ref-refund", amountCents: 3_000_000, currency: "COP" });
    const fetchSpy = jest.spyOn(global, "fetch");

    const result = await provider.createRefund({ providerReferenceId: "pub-ref-refund", amountCents: 1_000_000, reason: "test" });

    expect(result.status).toBe("APPROVED");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("createRefund throws rather than inventing an undocumented Bold refund endpoint when the transport doesn't implement it", async () => {
    const transportWithoutRefund: BoldTransport = {
      createPaymentIntent: mockTransport.createPaymentIntent.bind(mockTransport),
      createPayment: mockTransport.createPayment.bind(mockTransport),
      getPayment: mockTransport.getPayment.bind(mockTransport),
    };
    const providerWithoutRefund = new BoldPaymentProvider(transportWithoutRefund, config());

    await expect(
      providerWithoutRefund.createRefund({ providerReferenceId: "ref-1", amountCents: 1000, reason: "test" }),
    ).rejects.toThrow(/not implemented/);
  });
});
