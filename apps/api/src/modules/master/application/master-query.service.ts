import { Inject, Injectable } from "@nestjs/common";
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
import { MASTER_READ_REPOSITORY, type MasterReadRepository } from "../ports/master-read.repository";

@Injectable()
export class MasterQueryService {
  constructor(@Inject(MASTER_READ_REPOSITORY) private readonly repository: MasterReadRepository) {}

  findPersonByDocument(document: string): Promise<Person | null> { return this.repository.findPersonByDocument(document); }
  findCompanyByNit(nit: string): Promise<Company | null> { return this.repository.findCompanyByNit(nit); }
  getContract(contractId: string): Promise<Contract | null> { return this.repository.getContract(contractId); }
  getContractsByPerson(personId: string): Promise<readonly Contract[]> { return this.repository.getContractsByPerson(personId); }
  getCompanyContracts(nit: string): Promise<readonly Contract[]> { return this.repository.getCompanyContracts(nit); }
  getPlan(planId: string): Promise<Plan | null> { return this.repository.getPlan(planId); }
  getContractInstallments(contractId: string): Promise<readonly Installment[]> { return this.repository.getContractInstallments(contractId); }
  getOutstandingInstallments(contractId: string): Promise<readonly Installment[]> { return this.repository.getOutstandingInstallments(contractId); }
  getPaymentHistory(contractId: string): Promise<readonly Payment[]> { return this.repository.getPaymentHistory(contractId); }
  getPaymentReceipt(receiptNumber: string): Promise<PaymentReceipt | null> { return this.repository.getPaymentReceipt(receiptNumber); }
  getContractBeneficiaries(contractId: string): Promise<readonly Person[]> { return this.repository.getContractBeneficiaries(contractId); }
  getContractStatus(contractId: string): Promise<ContractStatus | null> { return this.repository.getContractStatus(contractId); }
}
