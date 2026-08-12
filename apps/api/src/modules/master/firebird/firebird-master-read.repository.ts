import { Injectable } from "@nestjs/common";
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
  mapPlan,
} from "./firebird.mappers";
import { requireReadyQuery, type MasterQueryName } from "./firebird-query.catalog";
import { FirebirdReadExecutor } from "./firebird-read.executor";

@Injectable()
export class FirebirdMasterReadRepository implements MasterReadRepository {
  constructor(private readonly executor: FirebirdReadExecutor) {}

  async findPersonByDocument(_document: string): Promise<Person | null> {
    requireReadyQuery("findPersonByDocument");
    return null;
  }

  async findCompanyByNit(nit: string): Promise<Company | null> {
    const row = await this.queryOne("findCompanyByNit", [nit]);
    return row ? mapCompany(row) : null;
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

  async getOutstandingInstallments(_contractId: string): Promise<readonly Installment[]> {
    requireReadyQuery("getOutstandingInstallments");
    return [];
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
