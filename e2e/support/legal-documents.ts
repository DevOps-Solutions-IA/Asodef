// US-066/US-067: several e2e flows are gated by ConsentService's
// requiresPolicyVersion check (payment orders -> terminos-de-pago, the
// contact form -> tratamiento-de-datos) - every legal document is
// deliberately seeded DRAFT-only (seed-legal-documents.ts's own doc
// comment: "always leaving it in DRAFT - never approved/published"),
// since no real legal review has happened yet for this pre-launch
// project. This is the e2e-side equivalent of apps/api's own
// publish-legal-document-for-test.ts (same temporarily-publish-then-
// restore contract, reused by its backend integration tests for the
// same two documents) - it must never leave a real seeded document
// looking like real legal review happened when it didn't, so every
// caller restores in a `finally`/`afterAll`.
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface PublishedForTestHandle {
  restore: () => Promise<void>;
}

export async function publishDraftForE2e(slug: string): Promise<PublishedForTestHandle | null> {
  const document = await prisma.legalDocument.findUnique({ where: { slug }, include: { currentVersion: true } });
  if (!document || document.currentVersion) {
    return null;
  }

  const draftVersion = await prisma.legalDocumentVersion.findFirst({
    where: { legalDocumentId: document.id, status: "DRAFT" },
    orderBy: { version: "desc" },
  });
  if (!draftVersion) {
    return null;
  }

  const originalDraftContent = draftVersion.draftContent;

  await prisma.legalDocumentVersion.update({
    where: { id: draftVersion.id },
    data: { status: "PUBLISHED", approvedContent: originalDraftContent as Prisma.InputJsonValue, publicationDate: new Date() },
  });
  await prisma.legalDocument.update({ where: { id: document.id }, data: { currentVersionId: draftVersion.id } });

  return {
    restore: async () => {
      await prisma.legalDocument.update({ where: { id: document.id }, data: { currentVersionId: null } });
      await prisma.legalDocumentVersion.update({
        where: { id: draftVersion.id },
        data: {
          status: "DRAFT",
          approvedContent: Prisma.JsonNull,
          publicationDate: null,
          draftContent: originalDraftContent as Prisma.InputJsonValue,
        },
      });
    },
  };
}

export async function disconnectLegalDocumentsClient(): Promise<void> {
  await prisma.$disconnect();
}
