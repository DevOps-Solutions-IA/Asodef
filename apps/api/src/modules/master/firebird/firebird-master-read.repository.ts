import { Injectable } from "@nestjs/common";
import { MasterInvalidResponseError } from "../domain/master.errors";
import { selectPayableInstallments } from "../domain/master-payable-installments";
import type {
  Company,
  Contract,
  ContractStatus,
  Installment,
  Payment,
  PaymentReceipt,
  Person,
  Plan,
} from "../domain/master.models";
import type { FirebirdParameter, FirebirdRow } from "../ports/firebird-read-client";
import type { MasterReadRepository } from "../ports/master-read.repository";
import {
  mapCompany,
  mapContract,
  mapContractStatus,
  mapInstallment,
  mapPayment,
  mapPerson,
  mapPlan,
} from "./firebird.mappers";
import { requireReadyQuery, type MasterQueryName } from "./firebird-query.catalog";
import { FirebirdReadExecutor } from "./firebird-read.executor";

@Injectable()
export class FirebirdMasterReadRepository implements MasterReadRepository {
  constructor(private readonly executor: FirebirdReadExecutor) {}

  async findPersonByDocument(document: string): Promise<Person | null> {
    const normalizedDocument = document.trim();
    if (!normalizedDocument) return null;

    const exactRows = await this.queryMany("findPersonByDocument", [normalizedDocument]);
    if (exactRows.length > 1) throw new MasterInvalidResponseError("findPersonByDocument");
    if (exactRows[0]) return mapPerson(exactRows[0]);

    const normalizedRows = await this.queryMany("findPersonByNormalizedDocument", [normalizedDocument]);
    if (normalizedRows.length > 1) throw new MasterInvalidResponseError("findPersonByDocument");
    return normalizedRows[0] ? mapPerson(normalizedRows[0]) : null;
  }

  async findCompanyByNit(nit: string): Promise<Company | null> {
    const normalizedNit = nit.trim();
    if (!normalizedNit) return null;
    const rows = await this.queryMany("findCompanyByNit", [normalizedNit]);
    if (rows.length > 1) throw new MasterInvalidResponseError("findCompanyByNit");
    return rows[0] ? mapCompany(rows[0]) : null;
  }

  async getContract(contractId: string): Promise<Contract | null> {
    const row = await this.queryOne("getContract", [contractId]);
    return row ? mapContract(row) : null;
  }

  async getContractsByPerson(personId: string): Promise<readonly Contract[]> {
    return (await this.queryMany("getContractsByPerson", [personId])).map(mapContract);
  }

  async getCompanyContracts(nit: string): Promise<readonly Contract[]> {
    return (await this.queryMany("getCompanyContracts", [nit])).map(mapContract);
  }

  async getPlan(planId: string): Promise<Plan | null> {
    const row = await this.queryOne("getPlan", [planId]);
    return row ? mapPlan(row) : null;
  }

  async getContractInstallments(contractId: string): Promise<readonly Installment[]> {
    return (await this.queryMany("getContractInstallments", [contractId])).map(mapInstallment);
  }

  async getOutstandingInstallments(contractId: string): Promise<readonly Installment[]> {
    return selectPayableInstallments(await this.getContractInstallments(contractId));
  }

  async getPaymentHistory(contractId: string): Promise<readonly Payment[]> {
    return (await this.queryMany("getPaymentHistory", [contractId])).map(mapPayment);
  }

  async getPaymentReceipt(_receiptNumber: string): Promise<PaymentReceipt | null> {
    requireReadyQuery("getPaymentReceipt");
    return null;
  }

  async getContractBeneficiaries(_contractId: string): Promise<readonly Person[]> {
    requireReadyQuery("getContractBeneficiaries");
    return [];
  }

  async getContractStatus(contractId: string): Promise<ContractStatus | null> {
    const row = await this.queryOne("getContractStatus", [contractId]);
    return row ? mapContractStatus(row) : null;
  }

  private queryMany(
    name: MasterQueryName,
    parameters: readonly FirebirdParameter[],
  ): Promise<readonly FirebirdRow[]> {
    return this.executor.run(requireReadyQuery(name), parameters);
  }

  private async queryOne(
    name: MasterQueryName,
    parameters: readonly FirebirdParameter[],
  ): Promise<FirebirdRow | null> {
    const rows = await this.queryMany(name, parameters);
    return rows[0] ?? null;
  }
}
