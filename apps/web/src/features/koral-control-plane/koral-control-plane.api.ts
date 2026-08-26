import { apiClient } from "../../lib/api-client";
import type {
  KoralAgentsResponse,
  KoralAnalyticsResponse,
  KoralAutomationsResponse,
  KoralControlPlaneOverview,
  KoralToolsResponse,
} from "./koral-control-plane.types";

const BASE_PATH = "/admin/koral/control-plane";

export function getKoralControlPlaneOverview(
  signal?: AbortSignal,
): Promise<KoralControlPlaneOverview> {
  return apiClient.get<KoralControlPlaneOverview>(BASE_PATH, { signal });
}

export function getKoralAgents(signal?: AbortSignal): Promise<KoralAgentsResponse> {
  return apiClient.get<KoralAgentsResponse>(`${BASE_PATH}/runtime/agents`, {
    signal,
  });
}

export function getKoralTools(signal?: AbortSignal): Promise<KoralToolsResponse> {
  return apiClient.get<KoralToolsResponse>(`${BASE_PATH}/tools`, { signal });
}

export function getKoralAutomations(
  hours = 24,
  limit = 20,
  signal?: AbortSignal,
): Promise<KoralAutomationsResponse> {
  return apiClient.get<KoralAutomationsResponse>(
    `${BASE_PATH}/automations?hours=${hours}&limit=${limit}`,
    { signal },
  );
}

export function getKoralAnalytics(
  hours = 24,
  signal?: AbortSignal,
): Promise<KoralAnalyticsResponse> {
  return apiClient.get<KoralAnalyticsResponse>(
    `${BASE_PATH}/analytics?hours=${hours}`,
    { signal },
  );
}
