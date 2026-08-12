import { ServiceUnavailableException } from "@nestjs/common";
import type { MasterHealthService } from "./master-health.service";
import { MasterHealthController } from "./master-health.controller";

describe("MasterHealthController", () => {
  it("returns the safe disabled state", async () => {
    const service = { check: jest.fn().mockResolvedValue({ status: "disabled" }) } as unknown as MasterHealthService;
    const controller = new MasterHealthController(service);
    await expect(controller.check()).resolves.toEqual({ status: "disabled" });
  });

  it("uses 503 for an enabled but unavailable master", async () => {
    const service = { check: jest.fn().mockResolvedValue({ status: "unavailable" }) } as unknown as MasterHealthService;
    const controller = new MasterHealthController(service);
    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
