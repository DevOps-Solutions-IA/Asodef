import { BoldProviderResponseError, BoldProviderUnavailableError, HttpBoldTransport } from "./http-bold.transport";

const CONFIG = { baseUrl: "https://api.online.payments.bold.co", identityKey: "test-identity-key-do-not-use-in-prod" };

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("HttpBoldTransport (sandbox/production real HTTP client - never exercised against real Bold, per 'do not make real financial transactions')", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("createPaymentIntent POSTs to the documented endpoint with the documented request shape and auth header", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      await jsonResponse(200, { status: "ACTIVE", reference_id: "ref-1" }),
    );
    const transport = new HttpBoldTransport(CONFIG);

    await transport.createPaymentIntent({ reference_id: "ref-1", amount: { currency: "COP", total_amount: 5_000_000 } });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.online.payments.bold.co/v1/payment-intent");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: `x-api-key ${CONFIG.identityKey}` });
    expect(JSON.parse(init?.body as string)).toEqual({ reference_id: "ref-1", amount: { currency: "COP", total_amount: 5_000_000 } });
  });

  it("createPayment POSTs to /v1/payment with the reference id", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(await jsonResponse(200, { status: "APPROVED" }));
    const transport = new HttpBoldTransport(CONFIG);

    await transport.createPayment("ref-2");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.online.payments.bold.co/v1/payment");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ reference_id: "ref-2" });
  });

  it("getPayment GETs /v1/payment/{reference_id}", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(await jsonResponse(200, { status: "APPROVED" }));
    const transport = new HttpBoldTransport(CONFIG);

    await transport.getPayment("ref-3");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.online.payments.bold.co/v1/payment/ref-3");
    expect(init?.method).toBe("GET");
  });

  it("throws BoldProviderUnavailableError on a network failure, without exposing the credential", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const transport = new HttpBoldTransport(CONFIG);

    await expect(transport.getPayment("ref-4")).rejects.toThrow(BoldProviderUnavailableError);
    try {
      await transport.getPayment("ref-4");
    } catch (error) {
      expect((error as Error).message).not.toContain(CONFIG.identityKey);
    }
  });

  it("throws BoldProviderResponseError on a non-2xx response, without leaking the credential in the error", async () => {
    // A fresh Response per call - Response bodies are single-read
    // streams, so a single mockResolvedValue reused across two calls
    // would fail the second read with an unrelated "body already used"
    // error, not the condition this test is actually about.
    jest.spyOn(global, "fetch").mockImplementation(() => jsonResponse(401, { error: "invalid credentials" }));
    const transport = new HttpBoldTransport(CONFIG);

    let caught: unknown;
    try {
      await transport.getPayment("ref-5");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BoldProviderResponseError);
    expect((caught as Error).message).not.toContain(CONFIG.identityKey);
    expect((caught as BoldProviderResponseError).status).toBe(401);
  });

  it("throws BoldProviderResponseError when the response is missing the documented status field, rather than silently accepting an unrecognized shape", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(await jsonResponse(200, { unexpected: "shape" }));
    const transport = new HttpBoldTransport(CONFIG);

    await expect(transport.getPayment("ref-6")).rejects.toThrow(BoldProviderResponseError);
  });

  it("never calls fetch against anything other than the configured baseUrl (no hardcoded alternate host)", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(await jsonResponse(200, { status: "APPROVED" }));
    const transport = new HttpBoldTransport(CONFIG);

    await transport.getPayment("ref-7");

    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toMatch(new RegExp(`^${CONFIG.baseUrl}`));
  });
});
