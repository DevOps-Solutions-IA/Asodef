import { apiClient } from "../api-client";
import type { AdminExportJobStatus, AdminReportFilters, AdminReportJobStarted, AdminReportListItem, AdminReportRunResult } from "./admin-reports-types";

function toQueryString(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function listReports(signal?: AbortSignal): Promise<AdminReportListItem[]> {
  return apiClient.get<AdminReportListItem[]>("/admin/reports", { signal });
}

export function runReport(key: string, filters: AdminReportFilters, signal?: AbortSignal): Promise<AdminReportRunResult | AdminReportJobStarted> {
  return apiClient.get<AdminReportRunResult | AdminReportJobStarted>(`/admin/reports/${encodeURIComponent(key)}${toQueryString(filters)}`, { signal });
}

export function getExportJobStatus(jobId: string, signal?: AbortSignal): Promise<AdminExportJobStatus> {
  return apiClient.get<AdminExportJobStatus>(`/admin/reports/exports/${jobId}`, { signal });
}

/** Same "direct URL, let the browser handle the download" convention as
 * getReceiptDownloadUrl - a CSV response body can't go through apiClient
 * (which always expects/parses JSON). */
export function getReportCsvUrl(key: string, filters: AdminReportFilters): string {
  const origin: string = import.meta.env.VITE_API_URL ?? "";
  return `${origin}/api/v1/admin/reports/${encodeURIComponent(key)}${toQueryString({ ...filters, format: "csv" })}`;
}

export function getExportJobDownloadUrl(jobId: string): string {
  const origin: string = import.meta.env.VITE_API_URL ?? "";
  return `${origin}/api/v1/admin/reports/exports/${jobId}/download`;
}
