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

export const MASTER_READ_REPOSITORY = Symbol("MASTER_READ_REPOSITORY");

export interface MasterReadRepository {
  findPersonByDocument(document: string): Promise<Person | null>;
  findCompanyByNit(nit: string): Promise<Company | null>;
  getContract(contractId: string): Promise<Contract | null>;
  getContractsByPerson(personId: string): Promise<readonly Contract[]>;
  getCompanyContracts(nit: string): Promise<readonly Contract[]>;
  getPlan(planId: string): Promise<Plan | null>;
  getContractInstallments(contractId: string): Promise<readonly Installment[]>;
  getOutstandingInstallments(contractId: string): Promise<readonly Installment[]>;
  getPaymentHistory(contractId: string): Promise<readonly Payment[]>;
  getPaymentReceipt(receiptNumber: string): Promise<PaymentReceipt | null>;
  getContractBeneficiaries(contractId: string): Promise<readonly Person[]>;
  getContractStatus(contractId: string): Promise<ContractStatus | null>;
}
