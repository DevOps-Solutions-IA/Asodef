import { MasterIdentityMismatchError } from "../domain/master.errors";
import type { FirebirdReadExecutor } from "../firebird/firebird-read.executor";
import { MasterConnectionGateService } from "./master-connection-gate.service";

describe("MasterConnectionGateService", () => {
  it("executes exactly CURRENT_USER, health and contract count in that order", async () => {
    const run = jest.fn()
      .mockResolvedValueOnce([{ CURRENT_USER_NAME: "ASODEF_READONLY" }])
      .mockResolvedValueOnce([{ HEALTH_VALUE: 1 }])
      .mockResolvedValueOnce([{ CONTRACT_COUNT: 8687 }]);
    const service = new MasterConnectionGateService({ run } as unknown as FirebirdReadExecutor);

    await expect(service.run()).resolves.toEqual({
      currentUser: "ASODEF_READONLY",
      healthValue: 1,
      contractCount: "8687",
    });
    expect(run.mock.calls.map((call) => call[0].name)).toEqual([
      "currentUser",
      "health",
      "contractCountGate",
    ]);
  });

  it("aborts before health and count if CURRENT_USER is unexpected", async () => {
    const run = jest.fn().mockResolvedValue([{ CURRENT_USER_NAME: "UNEXPECTED_USER" }]);
    const service = new MasterConnectionGateService({ run } as unknown as FirebirdReadExecutor);
    await expect(service.run()).rejects.toBeInstanceOf(MasterIdentityMismatchError);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
