import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("../api-client", () => ({ apiClient: mocks }));

import { selfServiceApi } from "./self-service-api";

describe("selfServiceApi contract", () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("uses the provider-ready lookup, OTP and session endpoints", async () => {
    mocks.post.mockResolvedValue({ status: "NOT_CONFIGURED", error: { code: "NC", message: "No configurado", retryable: false } });
    mocks.get.mockResolvedValue({ status: "VERIFIED", expiresAt: "2026-01-01", scopes: [] });
    mocks.delete.mockResolvedValue({ status: "VERIFIED" });
    await selfServiceApi.startAffiliateAccess({ identifier: "1234", identifierMode: "TITULAR_NUMBER" });
    await selfServiceApi.requestAffiliateChallenge({ providerReference: "provider-ref", channelReference: "channel-ref" });
    await selfServiceApi.resendAffiliateChallenge({ challengeId: "challenge" });
    await selfServiceApi.verifyAffiliateAccess({ challengeId: "challenge", code: "123456" });
    await selfServiceApi.getAffiliateSession();
    await selfServiceApi.endAffiliateSession("csrf");
    expect(mocks.post).toHaveBeenNthCalledWith(1, "/self-service/affiliate/access/start", { identifier: "1234", identifierMode: "TITULAR_NUMBER" }, expect.any(Object));
    expect(mocks.post).toHaveBeenNthCalledWith(2, "/self-service/affiliate/access/request-code", { providerReference: "provider-ref", channelReference: "channel-ref" }, expect.any(Object));
    expect(mocks.post).toHaveBeenNthCalledWith(3, "/self-service/affiliate/access/resend", expect.any(Object), expect.any(Object));
    expect(mocks.post).toHaveBeenNthCalledWith(4, "/self-service/affiliate/access/verify", { challengeId: "challenge", code: "123456" }, expect.any(Object));
    expect(mocks.get).toHaveBeenCalledWith("/self-service/affiliate/session", expect.any(Object));
    expect(mocks.delete).toHaveBeenCalledWith("/self-service/affiliate/session", expect.objectContaining({ headers: { "X-CSRF-Token": "csrf" } }));
  });

  it("wraps beneficiary mutations and binds CSRF plus idempotency", async () => {
    mocks.post.mockResolvedValue({ status: "VERIFIED", data: { id: "request-1", status: "DRAFT" } });
    await selfServiceApi.createBeneficiaryDraft({ operation: "ADD", beneficiaryDisplayName: "Persona" }, "csrf-token", "idem-key");
    expect(mocks.post).toHaveBeenCalledWith("/self-service/affiliate/beneficiary-change-requests", { payload: { operation: "ADD", beneficiaryDisplayName: "Persona" } }, expect.objectContaining({ headers: { "X-CSRF-Token": "csrf-token", "Idempotency-Key": "idem-key" } }));
  });

  it("uses the server-rotated one-time CSRF token on the next mutation", async () => {
    mocks.post.mockImplementation(async (_path, _body, options) => {
      options.onResponse?.(new Response(null, { headers: { "x-csrf-token": "csrf-next" } }));
      return { status: "VERIFIED", data: { id: "request-1", status: "DRAFT" } };
    });
    await selfServiceApi.createBeneficiaryDraft({ operation: "ADD" }, "csrf-initial", "idem-1");
    await selfServiceApi.submitBeneficiaryRequest("request-1", "csrf-initial", "idem-2");
    expect(mocks.post).toHaveBeenNthCalledWith(2, "/self-service/affiliate/beneficiary-change-requests/request-1/submit", undefined, expect.objectContaining({ headers: { "X-CSRF-Token": "csrf-next", "Idempotency-Key": "idem-2" } }));
  });

  it("uploads beneficiary documents as multipart without a synthetic success", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ status: "NOT_CONFIGURED", error: { code: "NC", message: "Proveedor no configurado", retryable: false } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["contenido"], "soporte.pdf", { type: "application/pdf" });
    const result = await selfServiceApi.uploadBeneficiaryDocument("request-1", file, "identity", "csrf", "idempotency-key-123");
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(FormData);
    expect((request?.body as FormData).get("documentType")).toBe("identity");
    expect((request?.body as FormData).get("file")).toBeInstanceOf(File);
    expect(request?.headers).not.toHaveProperty("Content-Type");
    expect(result).toEqual({ status: "not_configured", message: "Proveedor no configurado" });
  });
});
