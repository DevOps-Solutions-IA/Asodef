import { PrismaClient } from "@prisma/client";
import { CONTENT_CATALOG } from "./content-catalog";

/**
 * Seeds only CONTENT_CATALOG's approved entries, all published
 * immediately (they're already-approved copy, not draft content
 * awaiting review). Idempotent via upsert keyed on the unique `key`.
 */
export async function seedContent(client: PrismaClient): Promise<void> {
  for (const entry of CONTENT_CATALOG) {
    await client.contentEntry.upsert({
      where: { key: entry.key },
      update: { value: entry.value, status: "PUBLISHED" },
      create: { key: entry.key, value: entry.value, status: "PUBLISHED" },
    });
  }
}
