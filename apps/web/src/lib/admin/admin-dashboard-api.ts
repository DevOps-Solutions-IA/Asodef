import { apiClient } from "../api-client";
import type { AdminDashboardMetrics } from "./admin-dashboard-types";

export function getAdminDashboard(signal?: AbortSignal): Promise<AdminDashboardMetrics> {
  return apiClient.get<AdminDashboardMetrics>("/admin/dashboard", { signal });
}
