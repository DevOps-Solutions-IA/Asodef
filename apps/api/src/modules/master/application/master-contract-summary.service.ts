import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  Contract,
  ContractStatus,
  Installment,
  Payment,
  Plan,
} from "../domain/master.models";
import { MasterQueryService } from "./master-query.service";

export interface MasterContractSummary {
  contract: Contract;
  plan: Plan | null;
  installments: readonly Installment[];
  payments: readonly Payment[];
  status: ContractStatus | null;
}

@Injectable()
export class MasterContractSummaryService {
  constructor(private readonly masterQueryService: MasterQueryService) {}

  async getSummary(contractId: string): Promise<MasterContractSummary> {
    const contract = await this.masterQueryService.getContract(contractId);

    if (!contract) {
      throw new NotFoundException("Master contract not found");
    }

    const [plan, installments, payments, status] = await Promise.all([
      contract.planId
        ? this.masterQueryService.getPlan(contract.planId)
        : Promise.resolve(null),
      this.masterQueryService.getContractInstallments(contractId),
      this.masterQueryService.getPaymentHistory(contractId),
      this.masterQueryService.getContractStatus(contractId),
    ]);

    return {
      contract,
      plan,
      installments,
      payments,
      status,
    };
  }
}
