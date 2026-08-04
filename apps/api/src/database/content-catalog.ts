/**
 * US-020: the single source of truth for which homepage fields are
 * managed via ContentEntry, and their seeded values. Every entry here
 * must be traceable to already-approved copy - never invented, and
 * never one of the US-014-deferred statistics (no 8.405/54.692/or any
 * other unlabeled number - see project memory on US-014).
 */
export interface ContentCatalogEntry {
  key: string;
  value: string;
  /** Where this value came from - not persisted, just documentation. */
  source: string;
}

export const CONTENT_CATALOG: readonly ContentCatalogEntry[] = [
  {
    key: "hero.eyebrow",
    value: "ASODEF · Asociación para el desarrollo familiar",
    source: "Approved Hero copy, US-012 (commit ea6d1c9), apps/web/src/pages/home/HomePage.tsx",
  },
] as const;
