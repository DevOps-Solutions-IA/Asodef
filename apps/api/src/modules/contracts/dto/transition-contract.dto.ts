import { IsIn } from "class-validator";
import { ContractStatus } from "@prisma/client";

export class TransitionContractDto {
  @IsIn(Object.values(ContractStatus))
  status!: ContractStatus;
}
