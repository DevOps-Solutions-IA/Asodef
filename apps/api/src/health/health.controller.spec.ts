import { ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController (unit, HealthService mocked)", () => {
  async function buildController(checkReadiness: HealthService["checkReadiness"]) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { checkReadiness } }],
    }).compile();

    return moduleRef.get(HealthController);
  }

  it("GET /health returns ok with a timestamp", async () => {
    const controller = await buildController(async () => ({ ready: true, checks: { database: "ok", redis: "ok" } }));
    const result = controller.getHealth();

    expect(result.status).toBe("ok");
    expect(typeof result.timestamp).toBe("string");
  });

  it("GET /health/live returns ok without touching any dependency", async () => {
    const controller = await buildController(async () => ({ ready: true, checks: { database: "ok", redis: "ok" } }));
    expect(controller.getLiveness()).toEqual({ status: "ok" });
  });

  it("GET /health/ready returns ok when both dependencies are healthy", async () => {
    const controller = await buildController(async () => ({ ready: true, checks: { database: "ok", redis: "ok" } }));
    const result = await controller.getReadiness();
    expect(result).toEqual({ status: "ok", checks: { database: "ok", redis: "ok" } });
  });

  it("GET /health/ready fails when PostgreSQL is unavailable", async () => {
    const controller = await buildController(async () => ({
      ready: false,
      checks: { database: "error", redis: "ok" },
    }));

    await expect(controller.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    try {
      await controller.getReadiness();
      throw new Error("expected getReadiness to reject");
    } catch (error) {
      const response = (error as ServiceUnavailableException).getResponse() as Record<string, unknown>;
      expect(response.status).toBe("error");
      expect(response.checks).toEqual({ database: "error", redis: "ok" });
    }
  });

  it("GET /health/ready fails when Redis is unavailable", async () => {
    const controller = await buildController(async () => ({
      ready: false,
      checks: { database: "ok", redis: "error" },
    }));

    try {
      await controller.getReadiness();
      throw new Error("expected getReadiness to reject");
    } catch (error) {
      const response = (error as ServiceUnavailableException).getResponse() as Record<string, unknown>;
      expect(response.status).toBe("error");
      expect(response.checks).toEqual({ database: "ok", redis: "error" });
    }
  });

  it("never includes credentials, connection strings, or stack traces in the readiness body", async () => {
    const controller = await buildController(async () => ({
      ready: false,
      checks: { database: "error", redis: "ok" },
    }));

    try {
      await controller.getReadiness();
      throw new Error("expected getReadiness to reject");
    } catch (error) {
      const responseText = JSON.stringify((error as ServiceUnavailableException).getResponse());
      expect(responseText).not.toMatch(/postgres(ql)?:\/\//i);
      expect(responseText).not.toMatch(/redis:\/\//i);
      expect(responseText).not.toContain("localhost");
      expect(responseText).not.toContain("password");
      expect(responseText).not.toContain("at ");
    }
  });
});
