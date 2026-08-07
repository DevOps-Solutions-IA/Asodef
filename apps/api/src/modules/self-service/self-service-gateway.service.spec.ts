import { SelfServicePortal } from "@prisma/client";
import { SelfServiceGatewayService } from "./self-service-gateway.service";

describe("SelfServiceGatewayService", () => {
  const principal = { sessionId: "session-1", portal: SelfServicePortal.AFFILIATE, subjectRef: "subject", scopes: ["affiliate:beneficiaries:request"], assurance: "OTP" as const, csrfTokenHash: "hash", expiresAt: new Date() };

  it("replays a matching idempotent response without calling the provider", async () => {
    const response = { status: "VERIFIED", data: { requestId: "external-1" } };
    const prisma = { selfServiceIdempotency: { findUnique: jest.fn(async () => ({ requestHash: "request-hash", response })) } };
    const gateway = new SelfServiceGatewayService(prisma as never, { hash: () => "request-hash" } as never, {} as never, { get: () => 5_000 } as never);
    const operation = jest.fn();
    await expect(gateway.mutate(principal, "CREATE", "idempotency-key-123", { value: 1 }, operation)).resolves.toEqual({ status: "VERIFIED", data: {} });
    expect(operation).not.toHaveBeenCalled();
  });

  it("rejects key reuse with a different request", async () => {
    const prisma = { selfServiceIdempotency: { findUnique: jest.fn(async () => ({ requestHash: "other", response: {} })) } };
    const gateway = new SelfServiceGatewayService(prisma as never, { hash: () => "request-hash" } as never, {} as never, { get: () => 5_000 } as never);
    await expect(gateway.mutate(principal, "CREATE", "idempotency-key-123", { value: 1 }, jest.fn())).rejects.toMatchObject({ status: 409 });
  });

  it("maps provider exceptions to a safe UNAVAILABLE response", async () => {
    const gateway = new SelfServiceGatewayService({} as never, {} as never, {} as never, { get: () => 5_000 } as never);
    await expect(gateway.read(async () => { throw new Error("provider credential leaked here"); })).resolves.toEqual({ status: "UNAVAILABLE", error: { code: "EXTERNAL_CORE_UNAVAILABLE", message: "El servicio externo no está disponible.", retryable: true } });
  });

  it("strips unknown provider fields and full destinations from public responses", async () => {
    const gateway = new SelfServiceGatewayService({} as never, {} as never, {} as never, { get: () => 5_000 } as never);
    const operation = async () => ({ status: "VERIFIED" as const, data: { displayName: "Persona", status: "ACTIVE", destination: "person@example.com", clientSecret: "hidden" } });
    await expect(gateway.readPayload(operation, ["displayName", "status"])).resolves.toEqual({ status: "VERIFIED", data: { displayName: "Persona", status: "ACTIVE" } });
  });
});
