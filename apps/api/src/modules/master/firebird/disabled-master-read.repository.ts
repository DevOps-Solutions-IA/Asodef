import { Injectable } from "@nestjs/common";
import { MasterDisabledError } from "../domain/master.errors";
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
import type { MasterReadRepository } from "../ports/master-read.repository";

@Injectable()
export class DisabledMasterReadRepository implements MasterReadRepository {
  findPersonByDocument(_document: string): Promise<Person | null> { return this.disabled(); }
  findCompanyByNit(_nit: string): Promise<Company | null> { return this.disabled(); }
  getContract(_contractId: string): Promise<Contract | null> { return this.disabled(); }
  getContractsByPerson(_personId: string): Promise<readonly Contract[]> { return this.disabled(); }
  getCompanyContracts(_nit: string): Promise<readonly Contract[]> { return this.disabled(); }
  getPlan(_planId: string): Promise<Plan | null> { return this.disabled(); }
  getContractInstallments(_contractId: string): Promise<readonly Installment[]> { return this.disabled(); }
  getOutstandingInstallments(_contractId: string): Promise<readonly Installment[]> { return this.disabled(); }
  getPaymentHistory(_contractId: string): Promise<readonly Payment[]> { return this.disabled(); }
  getPaymentReceipt(_receiptNumber: string): Promise<PaymentReceipt | null> { return this.disabled(); }
  getContractBeneficiaries(_contractId: string): Promise<readonly Person[]> { return this.disabled(); }
  getContractStatus(_contractId: string): Promise<ContractStatus | null> { return this.disabled(); }

  private disabled<T>(): Promise<T> {
    return Promise.reject(new MasterDisabledError());
  }
}
