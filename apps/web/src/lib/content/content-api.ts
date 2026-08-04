import { apiClient } from "../api-client";
import type { ContentEntry } from "./content-types";

export function fetchPublishedContent(signal?: AbortSignal): Promise<ContentEntry[]> {
  return apiClient.get<ContentEntry[]>("/content", { signal });
}
