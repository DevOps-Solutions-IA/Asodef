import { PERMISSIONS_KEY } from "../../auth/decorators/permissions.decorator";
import type { MasterContractSummaryService } from "../application/master-contract-summary.service";
import { MasterContractsController } from "./master-contracts.controller";

describe("MasterContractsController", () => {
  it("delegates the contract summary query to the application service", async () => {
    const summary = {
      contract: { contractId: "1001" },
      plan: null,
      installments: [],
      payments: [],
      status: null,
    };

    const service = {
      getSummary: jest.fn().mockResolvedValue(summary),
    } as unknown as MasterContractSummaryService;

    const controller = new MasterContractsController(service);

    await expect(controller.getContractSummary("1001")).resolves.toBe(summary);
    expect(service.getSummary).toHaveBeenCalledWith("1001");
  });

  it("requires contracts.read permission", () => {
    const permissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      MasterContractsController.prototype.getContractSummary,
    );

    expect(permissions).toEqual(["contracts.read"]);
  });
});
