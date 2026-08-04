import { MockBoldTransport } from "./mock-bold.transport";

describe("MockBoldTransport", () => {
  let transport: MockBoldTransport;

  beforeEach(() => {
    transport = new MockBoldTransport();
  });

  it("never calls fetch - no real network call happens", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");

    await transport.createPaymentIntent({ reference_id: "ref-1", amount: { currency: "COP", total_amount: 5_000_000 } });
    await transport.createPayment("ref-1");
    await transport.getPayment("ref-1");

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("createPaymentIntent returns a well-formed ACTIVE intent echoing the request", async () => {
    const intent = await transport.createPaymentIntent({ reference_id: "ref-2", amount: { currency: "COP", total_amount: 1_000_000 } });
    expect(intent).toEqual({ status: "ACTIVE", reference_id: "ref-2", amount: { currency: "COP", total_amount: 1_000_000 } });
  });

  it("createPayment defaults to APPROVED after an intent was created", async () => {
    await transport.createPaymentIntent({ reference_id: "ref-3", amount: { currency: "COP", total_amount: 2_000_000 } });
    const payment = await transport.createPayment("ref-3");
    expect(payment).toEqual({ status: "APPROVED", reference_id: "ref-3" });
  });

  it("throws if createPayment is called before a payment-intent exists for that reference", async () => {
    await expect(transport.createPayment("never-created")).rejects.toThrow(/no payment-intent was created/);
  });

  it("getPayment returns the same status createPayment produced", async () => {
    await transport.createPaymentIntent({ reference_id: "ref-4", amount: { currency: "COP", total_amount: 3_000_000 } });
    await transport.createPayment("ref-4");
    const status = await transport.getPayment("ref-4");
    expect(status).toEqual({ status: "APPROVED", reference_id: "ref-4" });
  });

  it("throws if getPayment is called before any payment was created", async () => {
    await transport.createPaymentIntent({ reference_id: "ref-5", amount: { currency: "COP", total_amount: 1 } });
    await expect(transport.getPayment("ref-5")).rejects.toThrow(/no payment was created yet/);
  });

  it("setNextPaymentStatus lets a test exercise a rejected/failed outcome", async () => {
    transport.setNextPaymentStatus("REJECTED");
    await transport.createPaymentIntent({ reference_id: "ref-6", amount: { currency: "COP", total_amount: 4_000_000 } });
    const payment = await transport.createPayment("ref-6");
    expect(payment.status).toBe("REJECTED");
  });

  it("reset clears all in-memory state and the overridden status", async () => {
    transport.setNextPaymentStatus("REJECTED");
    await transport.createPaymentIntent({ reference_id: "ref-7", amount: { currency: "COP", total_amount: 1 } });

    transport.reset();

    await expect(transport.createPayment("ref-7")).rejects.toThrow(/no payment-intent was created/);
    await transport.createPaymentIntent({ reference_id: "ref-8", amount: { currency: "COP", total_amount: 1 } });
    const payment = await transport.createPayment("ref-8");
    expect(payment.status).toBe("APPROVED");
  });
});
