import { MasterDisabledError } from "../domain/master.errors";
import { DisabledMasterReadRepository } from "./disabled-master-read.repository";

describe("DisabledMasterReadRepository", () => {
  it("fails closed without attempting a lookup", async () => {
    const repository = new DisabledMasterReadRepository();
    await expect(repository.getContract("10")).rejects.toBeInstanceOf(MasterDisabledError);
    await expect(repository.findCompanyByNit("900123")).rejects.toMatchObject({ code: "MASTER_DISABLED" });
  });
});
