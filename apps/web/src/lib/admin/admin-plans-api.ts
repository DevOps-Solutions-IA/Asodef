import type { AdminPlan } from "@asodef/connect-contracts";
import { apiClient } from "../api-client";

export function getAdminPlans(signal?: AbortSignal): Promise<AdminPlan[]> {
  return apiClient.get<AdminPlan[]>("/admin/plans", { signal });
}
