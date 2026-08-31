import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaService } from "../../database/prisma.service";
import type { MasterQueryService } from "../master/application/master-query.service";
import type {
  Contract as MasterContract,
  Payment as MasterPayment,
} from "../master/domain/master.models";
import { HybridExternalCoreProvider } from "./hybrid-external-core.provider";

describe("HybridExternalCoreProvider", () => {
  const customerId = "00000000-0000-4000-8000-000000000001";
  const affiliateId = "00000000-0000-4000-8000-000000000002";
  const companyId = "00000000-0000-4000-8000-000000000003";

  function legacyContract(
    overrides: Partial<MasterContract> = {},
  ): MasterContract {
    return {
      contractId: "LEGACY-1",
      personId: "10000001",
      createdAt: null,
      validFrom: null,
      validUntil: null,
      value: null,
      initialValue: null,
      installmentCount: null,
      legacyStatus: null,
      planId: null,
      paidThrough: null,
      balance: null,
      installments: null,
      paymentFrequencyAmount: null,
      companyNit: null,
      monthsInArrears: null,
      daysInArrears: null,
      lastPaymentAt: null,
      lastPaymentAmount: null,
      paymentMethodId: null,
      paymentModalityId: null,
      ...overrides,
    };
  }

  function build() {
    const master = {
      findPersonByDocument: jest.fn(),
      findCompanyByNit: jest.fn(),
      getContract: jest.fn(),
      getContractsByPerson: jest.fn(
        async (): Promise<readonly MasterContract[]> => [],
      ),
      getCompanyContracts: jest.fn(
        async (): Promise<readonly MasterContract[]> => [],
      ),
      getPlan: jest.fn(),
      getContractInstallments: jest.fn(),
      getOutstandingInstallments: jest.fn(),
      getPaymentHistory: jest.fn(
        async (): Promise<readonly MasterPayment[]> => [],
      ),
      getPaymentReceipt: jest.fn(),
      getContractBeneficiaries: jest.fn(),
      getContractStatus: jest.fn(),
    };
    const prisma = {
      customer: { findUnique: jest.fn() },
      affiliate: { findMany: jest.fn() },
      company: { findUnique: jest.fn() },
      obligation: { findMany: jest.fn() },
      paymentOrder: { findMany: jest.fn() },
      paymentReceipt: { findMany: jest.fn() },
      contract: { findMany: jest.fn() },
      pqrCase: { findMany: jest.fn() },
    };
    const provider = new HybridExternalCoreProvider(
      master as unknown as MasterQueryService,
      prisma as unknown as PrismaService,
    );
    return { provider, master, prisma };
  }

  async function affiliateSubject(
    provider: HybridExternalCoreProvider,
  ): Promise<string> {
    const lookup = await provider.startAffiliateLookup({
      identifierMode: "DOCUMENT",
      documentType: "CC",
      identifier: "10000001",
    });
    if (lookup.status !== "VERIFIED")
      throw new Error("Expected a verified test subject");
    return lookup.data.subjectRef;
  }

  async function companySubject(
    provider: HybridExternalCoreProvider,
  ): Promise<string> {
    const lookup = await provider.startCompanyLookupByNit({ nit: "900123456" });
    if (lookup.status !== "VERIFIED")
      throw new Error("Expected a verified test subject");
    return lookup.data.subjectRef;
  }

  it("mints an explicit exact-match affiliate crosswalk and revalidates it for PostgreSQL reads", async () => {
    const { provider, master, prisma } = build();
    master.findPersonByDocument.mockResolvedValue({
      personId: "MASTER-PERSON-77",
      document: "10000001",
      documentType: "CC",
      names: "Ada",
      surnames: "Prueba",
    });
    prisma.customer.findUnique
      .mockResolvedValueOnce({ id: customerId })
      .mockResolvedValueOnce({
        id: customerId,
        documentType: "CC",
        documentNumber: "10000001",
        fullName: "Ada Prueba",
        affiliates: [{ id: affiliateId, status: "ACTIVE" }],
      });
    prisma.affiliate.findMany.mockResolvedValue([{ id: affiliateId }]);

    const subjectRef = await affiliateSubject(provider);
    expect(subjectRef).toMatch(/^hybrid:v1:/);
    expect(subjectRef).not.toContain("10000001");
    await expect(provider.getAffiliateSummary(subjectRef)).resolves.toEqual({
      status: "VERIFIED",
      data: {
        displayName: "Ada Prueba",
        identifierMasked: "••••0001",
        status: "ACTIVE",
      },
    });
    expect(master.findPersonByDocument).toHaveBeenCalledWith("10000001");
    expect(prisma.customer.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: customerId },
      }),
    );
  });

  it("does not reinterpret titular number as a Master document lookup", async () => {
    const { provider, master, prisma } = build();
    await expect(
      provider.startAffiliateLookup({
        identifierMode: "TITULAR_NUMBER",
        identifier: "10000001",
      }),
    ).resolves.toMatchObject({
      status: "UNAVAILABLE",
      error: { code: "AFFILIATE_TITULAR_NUMBER_SEMANTICS_NOT_APPROVED" },
    });
    expect(master.findPersonByDocument).not.toHaveBeenCalled();
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a document-type mismatch without minting a crosswalk", async () => {
    const { provider, master, prisma } = build();
    master.findPersonByDocument.mockResolvedValue({
      personId: "10000001",
      document: "10000001",
      documentType: "CE",
    });
    await expect(
      provider.startAffiliateLookup({
        identifierMode: "DOCUMENT",
        documentType: "CC",
        identifier: "10000001",
      }),
    ).resolves.toMatchObject({ status: "NOT_FOUND", disclosureAllowed: false });
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
  });

  it("rejects malformed or non-canonical server-side subject references", async () => {
    const { provider, master } = build();
    await expect(
      provider.getAffiliateSummary("hybrid:v1:not+base64url"),
    ).resolves.toMatchObject({
      status: "UNAVAILABLE",
      error: { code: "INVALID_SUBJECT_REFERENCE", retryable: false },
    });
    expect(master.findPersonByDocument).not.toHaveBeenCalled();
  });

  it("does not create a PostgreSQL crosswalk from a same-named entity without the exact relation", async () => {
    const { provider, master, prisma } = build();
    master.findPersonByDocument.mockResolvedValue({
      personId: "10000001",
      document: "10000001",
      documentType: "CC",
      names: "Solo Master",
      surnames: null,
    });
    prisma.customer.findUnique.mockResolvedValue({ id: customerId });
    prisma.affiliate.findMany.mockResolvedValue([]);

    const subjectRef = await affiliateSubject(provider);
    const result = await provider.getAffiliateObligations(subjectRef);
    expect(result).toMatchObject({
      status: "UNAVAILABLE",
      error: { code: "POSTGRES_CROSSWALK_REQUIRED" },
    });
    expect(prisma.obligation.findMany).not.toHaveBeenCalled();
  });

  it("uses only canonical PostgreSQL outstanding statuses once an exact affiliate crosswalk exists", async () => {
    const { provider, master, prisma } = build();
    master.findPersonByDocument.mockResolvedValue({
      personId: "10000001",
      document: "10000001",
      documentType: "CC",
      names: "Ada",
      surnames: null,
    });
    prisma.customer.findUnique
      .mockResolvedValueOnce({ id: customerId })
      .mockResolvedValueOnce({
        id: customerId,
        documentType: "CC",
        documentNumber: "10000001",
        fullName: "Ada",
        affiliates: [{ id: affiliateId, status: "ACTIVE" }],
      });
    prisma.affiliate.findMany.mockResolvedValue([{ id: affiliateId }]);
    prisma.obligation.findMany.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000004",
        concept: "Obligación digital",
        amountCents: 125050,
        currency: "COP",
        status: "PENDING",
        dueDate: new Date("2026-08-31T12:00:00.000Z"),
      },
    ]);

    const subjectRef = await affiliateSubject(provider);
    await expect(provider.getAffiliateObligations(subjectRef)).resolves.toEqual(
      {
        status: "VERIFIED",
        data: [
          expect.objectContaining({
            amount: "1250.50",
            currency: "COP",
            status: "PENDING",
          }),
        ],
      },
    );
    expect(prisma.obligation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId, status: { in: ["PENDING", "OVERDUE"] } },
      }),
    );
    expect(master.getOutstandingInstallments).not.toHaveBeenCalled();
  });

  it("composes company contracts from Master and PostgreSQL without merging source identities", async () => {
    const { provider, master, prisma } = build();
    master.findCompanyByNit.mockResolvedValue({
      nit: "900123456",
      name: null,
      status: null,
    });
    master.getCompanyContracts.mockResolvedValue([
      legacyContract({
        contractId: "LEGACY-1",
        personId: "10000001",
        legacyStatus: "VIGENTE",
        validFrom: "2026-01-01",
      }),
    ]);
    prisma.company.findUnique
      .mockResolvedValueOnce({ id: companyId })
      .mockResolvedValueOnce({
        id: companyId,
        nit: "900123456",
        name: "Empresa Digital",
        status: "ACTIVE",
      });
    prisma.contract.findMany.mockResolvedValue([
      {
        internalReference: "DIGITAL-1",
        type: "CONVENIO",
        status: "ACTIVE",
        effectiveDate: new Date("2026-02-01T00:00:00.000Z"),
      },
    ]);

    const subjectRef = await companySubject(provider);
    await expect(provider.getCompanyContracts(subjectRef)).resolves.toEqual({
      status: "VERIFIED",
      data: [
        expect.objectContaining({
          id: "master:LEGACY-1",
          reference: "LEGACY-1",
          status: "VIGENTE",
        }),
        expect.objectContaining({
          id: "postgres:DIGITAL-1",
          reference: "DIGITAL-1",
          status: "ACTIVE",
        }),
      ],
    });
    expect(master.getCompanyContracts).toHaveBeenCalledWith("900123456");
    expect(prisma.contract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { relatedCompanyId: companyId },
      }),
    );
  });

  it("keeps protected Master semantics blocked and never calls their repository methods", async () => {
    const { provider, master } = build();
    await expect(
      provider.getAffiliateBeneficiaries("opaque"),
    ).resolves.toMatchObject({
      status: "UNAVAILABLE",
      error: {
        code: "MASTER_BENEFICIARY_SEMANTICS_NOT_APPROVED",
        retryable: false,
      },
    });
    await expect(
      provider.getAffiliateAccountStatement("opaque"),
    ).resolves.toMatchObject({
      status: "UNAVAILABLE",
      error: {
        code: "ACCOUNT_STATEMENT_SEMANTICS_NOT_APPROVED",
        retryable: false,
      },
    });
    expect(master.getContractBeneficiaries).not.toHaveBeenCalled();
    expect(master.getOutstandingInstallments).not.toHaveBeenCalled();
    expect(master.getPaymentReceipt).not.toHaveBeenCalled();
  });

  it("fails closed for unsupported mutations without reporting fake provider data", async () => {
    const { provider } = build();
    const result = await provider.applyConfirmedPayment(
      "opaque",
      {},
      "idempotency-key-0001",
    );
    expect(result).toMatchObject({
      status: "UNAVAILABLE",
      error: {
        code: "SELF_SERVICE_PAYMENT_APPLICATION_NOT_CONFIGURED",
        retryable: false,
      },
    });
    expect(result).not.toHaveProperty("data");
  });

  it("contains no Firebird SQL, procedure invocation or Firebird client dependency", () => {
    const source = readFileSync(
      join(__dirname, "hybrid-external-core.provider.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/\$(?:queryRaw|executeRaw)/);
    expect(source).not.toContain("requireReadyQuery");
    expect(source).not.toContain("node-firebird");
    expect(source).not.toContain("FirebirdReadExecutor");
    expect(source).toContain("MasterQueryService");
  });
});
