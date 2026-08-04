import type { ContentEntry } from "@prisma/client";

/** Public-safe shape: key/value only - never id, status, or timestamps,
 * which are internal bookkeeping with no reason to be public. */
export interface ContentEntryResponse {
  key: string;
  value: string;
}

export function toContentEntryResponse(entry: ContentEntry): ContentEntryResponse {
  return { key: entry.key, value: entry.value };
}
