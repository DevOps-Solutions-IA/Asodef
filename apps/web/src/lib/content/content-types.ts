/** Mirrors apps/api's ContentEntryResponse exactly (US-020). */
export interface ContentEntry {
  key: string;
  value: string;
}

/** Convenience shape for O(1) lookup by key - built once from the raw
 * array response, never leaked into component props directly (see
 * HomePage.tsx: components still only ever receive plain string props,
 * never this map or anything ContentEntry-shaped). */
export type ContentMap = Record<string, string>;

export function toContentMap(entries: ContentEntry[]): ContentMap {
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
}
