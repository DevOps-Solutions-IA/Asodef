export interface AdminReportListItem {
  key: string;
  label: string;
}

export interface AdminReportFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

export interface AdminReportRunResult {
  items: Array<Record<string, unknown>>;
  total: number;
}

export interface AdminReportJobStarted {
  jobId: string;
  rowCount: number;
  status: "PENDING";
}

export interface AdminExportJobStatus {
  id: string;
  reportKey: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  rowCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}
