import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { PaymentOrderStatus } from "@prisma/client";

const STATUSES = Object.values(PaymentOrderStatus);

/** US-063 AC1: "search by document/reference/transaction, status
 * filtering". `search` matches (partial, case-insensitive) against the
 * order's own publicReference, its customer's documentNumber, and its
 * attempts' providerReferenceId/PaymentTransaction.boldTransactionId -
 * a single free-text field covering all three literal search targets,
 * same convention as UserListPage's own `search` filter. */
export class SearchPaymentOrdersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: PaymentOrderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
