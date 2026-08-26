import { KoralControlPlaneController } from "./koral-control-plane.controller";
import type { KoralControlPlaneService } from "./koral-control-plane.service";

describe("KoralControlPlaneController", () => {
  it("delegates every read-only projection to the service", async () => {
    const service = {
      overview: jest.fn().mockResolvedValue({ projection: "overview" }),
      runtimeAgents: jest.fn().mockResolvedValue({ projection: "agents" }),
      tools: jest.fn().mockReturnValue({ projection: "tools" }),
      automations: jest.fn().mockResolvedValue({ projection: "automations" }),
      analytics: jest.fn().mockResolvedValue({ projection: "analytics" }),
    };
    const controller = new KoralControlPlaneController(service as unknown as KoralControlPlaneService);

    await expect(controller.overview()).resolves.toEqual({ projection: "overview" });
    await expect(controller.runtimeAgents()).resolves.toEqual({ projection: "agents" });
    expect(controller.tools()).toEqual({ projection: "tools" });
    await expect(controller.automations({ hours: 48, limit: 10 })).resolves.toEqual({ projection: "automations" });
    await expect(controller.analytics({ hours: 12, limit: 20 })).resolves.toEqual({ projection: "analytics" });
    expect(service.automations).toHaveBeenCalledWith(48, 10);
    expect(service.analytics).toHaveBeenCalledWith(12);
  });
});
