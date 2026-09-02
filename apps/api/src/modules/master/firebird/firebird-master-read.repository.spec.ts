import { MasterInvalidResponseError, MasterQueryNotReadyError } from "../domain/master.errors";
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

  it("looks up a person by exact document using a separate prepared parameter", async () => {
    const { repository, run } = build([{
      PERSON_ID: "0012345",
      DOCUMENT: "0012345",
      DOCUMENT_TYPE: "CC",
      NAMES: "Ana",
      SURNAMES: "Pérez",
    }]);

    await expect(repository.findPersonByDocument(" 0012345 ")).resolves.toMatchObject({
      personId: "0012345",
      document: "0012345",
      documentType: "CC",
    });
    expect(run.mock.calls[0]?.[0].sql).toContain("WHERE p.IDPERSONA = ?");
    expect(run.mock.calls[0]?.[0].sql).not.toContain("0012345");
    expect(run.mock.calls[0]?.[1]).toEqual(["0012345"]);
  });

  it("falls back to a normalized source comparison for legacy outer spaces", async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ PERSON_ID: " 0012345", DOCUMENT: " 0012345", DOCUMENT_TYPE: "CC" }]);
    const repository = new FirebirdMasterReadRepository({ run } as unknown as FirebirdReadExecutor);

    await expect(repository.findPersonByDocument(" 0012345 ")).resolves.toMatchObject({
      personId: "0012345",
      document: "0012345",
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]?.[0].sql).toContain("WHERE p.IDPERSONA = ?");
    expect(run.mock.calls[1]?.[0].sql).toContain("WHERE TRIM(p.IDPERSONA) = ?");
    expect(run.mock.calls[1]?.[1]).toEqual(["0012345"]);
  });

  it("preserves leading zeros, punctuation and internal spaces in document parameters", async () => {
    const { repository, run } = build([{ PERSON_ID: "00.12 3-4", DOCUMENT: "00.12 3-4" }]);

    await repository.findPersonByDocument("00.12 3-4");
    expect(run.mock.calls[0]?.[1]).toEqual(["00.12 3-4"]);
  });

  it("does not open a Firebird query for an empty normalized document", async () => {
    const { repository, run } = build([]);

    await expect(repository.findPersonByDocument("   ")).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed if the source violates the confirmed unique identifier invariant", async () => {
    const duplicate = { PERSON_ID: "123", DOCUMENT: "123", DOCUMENT_TYPE: "CC" };
    const { repository } = build([duplicate, duplicate]);

    await expect(repository.findPersonByDocument("123")).rejects.toBeInstanceOf(MasterInvalidResponseError);
  });

  it("fails closed if normalized legacy identifiers are not unique", async () => {
    const duplicate = { PERSON_ID: " 123", DOCUMENT: " 123", DOCUMENT_TYPE: "CC" };
    const run = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([duplicate, duplicate]);
    const repository = new FirebirdMasterReadRepository({ run } as unknown as FirebirdReadExecutor);

    await expect(repository.findPersonByDocument("123")).rejects.toBeInstanceOf(MasterInvalidResponseError);
  });

  it("does not reinterpret or remove annulled payments", async () => {
    const { repository } = build([{ IDCONTRATO: 10, NORECIBO: "R-1", ANULADO: 1 }]);
    await expect(repository.getPaymentHistory("10")).resolves.toEqual([
      expect.objectContaining({ receiptNumber: "R-1", annulled: true }),
    ]);
  });

  it("derives payable installments from the approved installment read and keeps unrelated blocked operations closed", async () => {
    const { repository, run } = build([
      { IDCUOTA: 1, IDCONTRATO: 10, FECHAVENCE: "2020-01-01", NROCUOTA: 1, SALDO: "50.00" },
    ]);
    await expect(repository.getOutstandingInstallments("10")).resolves.toEqual([
      expect.objectContaining({ installmentId: "1", balance: "50.00" }),
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0].name).toBe("getContractInstallments");

    const blocked = build();
    await expect(blocked.repository.getPaymentReceipt("R-1")).rejects.toBeInstanceOf(MasterQueryNotReadyError);
    await expect(blocked.repository.getContractBeneficiaries("10")).rejects.toBeInstanceOf(MasterQueryNotReadyError);
    expect(blocked.run).not.toHaveBeenCalled();
  });

  it("does not query Firebird when blocked operations receive hostile input", async () => {
    const { repository, run } = build();

    await expect(repository.getPaymentReceipt("R-1'; DELETE FROM TBLPAGOS --")).rejects.toBeInstanceOf(
      MasterQueryNotReadyError,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("neutralizes SQL metacharacters in a person document by binding them as data", async () => {
    const { repository, run } = build([]);
    const hostileInput = "' OR 1=1 --";

    await expect(repository.findPersonByDocument(hostileInput)).resolves.toBeNull();
    expect(run).toHaveBeenCalledTimes(2);
    for (const call of run.mock.calls) {
      expect(call[0].sql).not.toContain(hostileInput);
      expect(call[1]).toEqual([hostileInput]);
    }
  });
});
