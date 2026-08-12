import type { MasterReadRepository } from "../ports/master-read.repository";
import { MasterQueryService } from "./master-query.service";

describe("MasterQueryService", () => {
  it("depends on the read port instead of a Firebird implementation", async () => {
    const repository = {
      findPersonByDocument: jest.fn().mockResolvedValue(null),
      findCompanyByNit: jest.fn().mockResolvedValue(null),
      getContract: jest.fn().mockResolvedValue(null),
      getContractsByPerson: jest.fn().mockResolvedValue([]),
      getCompanyContracts: jest.fn().mockResolvedValue([]),
      getPlan: jest.fn().mockResolvedValue(null),
      getContractInstallments: jest.fn().mockResolvedValue([]),
      getOutstandingInstallments: jest.fn().mockResolvedValue([]),
      getPaymentHistory: jest.fn().mockResolvedValue([]),
      getPaymentReceipt: jest.fn().mockResolvedValue(null),
      getContractBeneficiaries: jest.fn().mockResolvedValue([]),
      getContractStatus: jest.fn().mockResolvedValue(null),
    } satisfies jest.Mocked<MasterReadRepository>;
    const service = new MasterQueryService(repository);

    await service.getContract("10");
    expect(repository.getContract).toHaveBeenCalledWith("10");
  });
});
