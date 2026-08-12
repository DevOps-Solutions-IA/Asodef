import { MasterQueryNotReadyError } from "../domain/master.errors";
import type { FirebirdRow } from "../ports/firebird-read-client";
import { FirebirdMasterReadRepository } from "./firebird-master-read.repository";
import type { FirebirdReadExecutor } from "./firebird-read.executor";

describe("FirebirdMasterReadRepository", () => {
  function build(rows: readonly FirebirdRow[] = []) {
    const run = jest.fn().mockResolvedValue(rows);
    const repository = new FirebirdMasterReadRepository({ run } as unknown as FirebirdReadExecutor);
    return { repository, run };
  }

  it("binds document-like input as a parameter instead of interpolating SQL", async () => {
    const { repository, run } = build([{ NIT: "' OR 1=1 --" }]);
    const hostileInput = "' OR 1=1 --";

    await expect(repository.findCompanyByNit(hostileInput)).resolves.toMatchObject({ nit: hostileInput });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0].sql).toContain("WHERE e.NIT = ?");
    expect(run.mock.calls[0]?.[0].sql).not.toContain(hostileInput);
    expect(run.mock.calls[0]?.[1]).toEqual([hostileInput]);
  });

  it("uses a prepared parameter for contract id", async () => {
    const { repository, run } = build([{ IDCONTRATO: 10, IDPERSONA: 20 }]);
    await repository.getContract("10");
    expect(run.mock.calls[0]?.[0].sql).toContain("c.IDCONTRATO = ?");
    expect(run.mock.calls[0]?.[1]).toEqual(["10"]);
  });

  it("uses a prepared parameter for company NIT contract lookup", async () => {
    const { repository, run } = build([]);
    await repository.getCompanyContracts("900123");
    expect(run.mock.calls[0]?.[0].sql).toContain("ce.NIT = ?");
    expect(run.mock.calls[0]?.[1]).toEqual(["900123"]);
  });

  it("does not reinterpret or remove annulled payments", async () => {
    const { repository } = build([{ IDCONTRATO: 10, NORECIBO: "R-1", ANULADO: 1 }]);
    await expect(repository.getPaymentHistory("10")).resolves.toEqual([
      expect.objectContaining({ receiptNumber: "R-1", annulled: true }),
    ]);
  });

  it("fails closed for methods whose physical schema or semantics are not confirmed", async () => {
    const { repository, run } = build();
    await expect(repository.findPersonByDocument("123")).rejects.toBeInstanceOf(MasterQueryNotReadyError);
    await expect(repository.getOutstandingInstallments("10")).rejects.toBeInstanceOf(MasterQueryNotReadyError);
    await expect(repository.getPaymentReceipt("R-1")).rejects.toBeInstanceOf(MasterQueryNotReadyError);
    await expect(repository.getContractBeneficiaries("10")).rejects.toBeInstanceOf(MasterQueryNotReadyError);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not query Firebird when blocked operations receive hostile input", async () => {
    const { repository, run } = build();

    await expect(repository.findPersonByDocument("' OR 1=1 --")).rejects.toBeInstanceOf(
      MasterQueryNotReadyError,
    );
    await expect(repository.getPaymentReceipt("R-1'; DELETE FROM TBLPAGOS --")).rejects.toBeInstanceOf(
      MasterQueryNotReadyError,
    );
    expect(run).not.toHaveBeenCalled();
  });
});
