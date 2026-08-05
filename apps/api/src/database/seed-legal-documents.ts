import { Prisma, PrismaClient } from "@prisma/client";
import { LEGAL_DOCUMENT_CATALOG, LegalDocumentCatalogEntry } from "./legal-document-catalog";

function toDraftContent(entry: LegalDocumentCatalogEntry): Prisma.InputJsonValue {
  return { sections: entry.sections.map((section) => ({ heading: section.heading, body: section.body })) };
}

/**
 * US-044: seeds LegalDocument + its initial version-1 DRAFT for each
 * catalog entry, always leaving it in DRAFT (never approved/published -
 * that's a real admin action, not something a seed script may do).
 *
 * Idempotent, and safe to rerun after real review has started: if
 * version 1 has already moved past DRAFT (LEGAL_REVIEW, PENDING_APPROVAL,
 * APPROVED, PUBLISHED, REPLACED, ARCHIVED), the seed leaves its content
 * untouched - the seed is only authoritative for content nobody has
 * reviewed yet.
 */
export async function seedLegalDocuments(client: PrismaClient): Promise<void> {
  for (const entry of LEGAL_DOCUMENT_CATALOG) {
    const document = await client.legalDocument.upsert({
      where: { slug: entry.slug },
      update: { title: entry.title, type: entry.type },
      create: { type: entry.type, title: entry.title, slug: entry.slug },
    });

    const existingVersion = await client.legalDocumentVersion.findUnique({
      where: { legalDocumentId_version: { legalDocumentId: document.id, version: 1 } },
    });

    if (!existingVersion) {
      await client.legalDocumentVersion.create({
        data: {
          legalDocumentId: document.id,
          version: 1,
          status: "DRAFT",
          draftContent: toDraftContent(entry),
        },
      });
      continue;
    }

    if (existingVersion.status === "DRAFT") {
      await client.legalDocumentVersion.update({
        where: { id: existingVersion.id },
        data: { draftContent: toDraftContent(entry) },
      });
    }
  }
}
