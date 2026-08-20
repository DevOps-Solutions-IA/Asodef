import { apiClient } from "../api-client";
import type { AdminSystemStatus } from "./admin-system-types";

export function getAdminSystemStatus(signal?: AbortSignal): Promise<AdminSystemStatus> {
  return apiClient.get<AdminSystemStatus>("/admin/sistema", { signal });
}
