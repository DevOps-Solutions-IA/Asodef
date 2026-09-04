import {
  mapCompany,
  mapContract,
  mapContractStatus,
  mapInstallment,
  mapPayment,
  mapPerson,
  mapPlan,
} from "./firebird.mappers";

describe("Firebird domain mappers", () => {
  it("maps a person alias row without propagating legacy field names", () => {
    expect(mapPerson({
      PERSON_ID: 42,
      DOCUMENT: " 123456 ",
      DOCUMENT_TYPE: "CC",
      NAMES: "Ana",
      SURNAMES: "Pérez",
      PHONE: "555",
      WHATSAPP: "555",
      ADDRESS: "Calle 1",
      AFFILIATION_DATE: "2020-01-01",
      WITHDRAWAL_DATE: null,
      WITHDRAWN: 0,
      RELATIONSHIP: "TITULAR",
      CONTRACT_ID: 10,
      PLAN_ID: 2,
    })).toEqual({
      personId: "42",
      document: "123456",
      documentType: "CC",
      names: "Ana",
      surnames: "Pérez",
      phone: "555",
      whatsapp: "555",
      address: "Calle 1",
      affiliationDate: "2020-01-01",
      withdrawalDate: null,
      withdrawn: false,
      relationship: "TITULAR",
      contractId: "10",
      planId: "2",
    });
  });

  it("maps confirmed contract columns and preserves money as decimal strings", () => {
    const contract = mapContract({
      IDCONTRATO: 10,
      IDPERSONA: 42,
      FECHA: "2020-01-01",
      DESDE: "2020-01-01",
      HASTA: "2025-01-01",
      VALOR: "1234,50",
      VALORINICIAL: 1000,
      NOCUOTAS: 12,
      ESTADO: "A",
      IDPLAN: 2,
      PAGOHASTA: "2024-12-01",
      SALDO: "25.00",
      CUOTAS: 12,
      VALORCUOTAFORMAPAGO: "100.00",
      NIT: "900123",
      MESESENCARTERA: 1,
      DIASENCARTERA: 5,
      FECHAULTIMOPAGO: "2024-11-01",
      VALORULTIMOPAGO: "100.00",
      IDFORMAPAGO: 3,
      IDMODALIDAD: 4,
    });

    expect(contract.contractId).toBe("10");
    expect(contract.value).toBe("1234.50");
    expect(contract.balance).toBe("25.00");
    expect(contract.legacyStatus).toBe("A");
  });

  it("maps installments without deriving an outstanding state", () => {
    const installment = mapInstallment({
      IDCUOTA: 1,
      IDCONTRATO: 10,
      IDRENOVACION: null,
      FECHAVENCE: "2025-01-31",
      NROCUOTA: 3,
      VALOR: "100.00",
      IVA: "0",
      ABONO: "50.00",
      SALDO: "50.00",
      APORTEEMPRESA: "0",
      APORTETRABAJADOR: "100.00",
      ACUERDO: "N",
      ESTADO: "P",
      F_ACUERDO: null,
      OBSERVACION: "",
    });

    expect(installment).toMatchObject({ installmentId: "1", balance: "50.00", legacyStatus: "P" });
  });

  it("maps payment history while retaining the source annulled indicator", () => {
    const payment = mapPayment({
      IDCONTRATO: 10,
      FECHA: "2025-01-10",
      VALOR: "100.00",
      NORECIBO: "R-1",
      ANULADO: 1,
    });

    expect(payment).toMatchObject({ contractId: "10", receiptNumber: "R-1", annulled: true });
  });

  it("maps minimal company and plan rows without inventing descriptive fields", () => {
    expect(mapCompany({ NIT: "900123" })).toEqual({
      nit: "900123",
      name: null,
      status: null,
      contactMobile: null,
      contactPhone: null,
      phone2: null,
      phone: null,
    });
    expect(mapPlan({ IDPLAN: 7 })).toEqual({
      planId: "7",
      name: null,
      planTypeId: null,
      planType: null,
      status: null,
    });
  });

  it("keeps derived contract status null until its business rules are confirmed", () => {
    expect(mapContractStatus({ IDCONTRATO: 10, ESTADO: "A", SALDO: "0" })).toMatchObject({
      contractId: "10",
      legacyStatus: "A",
      derivedStatus: null,
    });
  });
});
