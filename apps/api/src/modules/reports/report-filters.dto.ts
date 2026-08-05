import { IsIn, IsOptional, IsString } from "class-validator";

export const REPORT_KEYS = [
  "payments",
  "collection_totals",
  "outstanding_obligations",
  "transactions_by_provider",
  "refunds",
  "reconciliation_differences",
  "companies_and_partners",
  "contract_expiration",
  "user_activity",
  "audit_events",
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];

export class ReportFiltersDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsIn(["json", "csv"])
  format?: "json" | "csv";
}
