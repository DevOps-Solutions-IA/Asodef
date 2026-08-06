import { Prisma, PrismaClient } from "@prisma/client";

/**
 * US-046 test helper (not a .spec file, so Jest ignores it): several
 * integration suites now depend on a resolvable, currently PUBLISHED
 * LegalDocumentVersion to exercise flows gated by ConsentService's
 * requiresPolicyVersion check (contact form -> tratamiento-de-datos,
 * payment orders -> terminos-de-pago). Rather than duplicate the same
 * "temporarily publish the real seeded DRAFT, then restore it" dance in
 * every spec file, it lives here once.
 *
 * Reuses a real current PUBLISHED version when one exists. The legacy
 * temporary-draft path remains only for isolated test databases seeded
 * without corrective publication. `restore()` always returns the pointer
 * and version to their exact prior state.
 */
export interface PublishedForTestHandle {
  documentId: string;
  versionId: string;
  /** Temporarily unpublish (currentVersionId -> null) without discarding
   * setup - for a single test that specifically needs the unpublished
   * state, followed by a call to `republish()` to put it back before
   * the suite's own final `restore()` runs in afterAll. */
  unpublish: () => Promise<void>;
  republish: () => Promise<void>;
  restore: () => Promise<void>;
}

export async function publishDraftForTest(prisma: PrismaClient, slug: string): Promise<PublishedForTestHandle | null> {
  const document = await prisma.legalDocument.findUnique({ where: { slug }, include: { currentVersion: true } });
  if (!document) {
    return null;
  }

  if (document.currentVersion?.status === "PUBLISHED") {
    const currentVersionId = document.currentVersion.id;
    return {
      documentId: document.id,
      versionId: currentVersionId,
      unpublish: async () => {
        await prisma.legalDocument.update({ where: { id: document.id }, data: { currentVersionId: null } });
      },
      republish: async () => {
        await prisma.legalDocument.update({ where: { id: document.id }, data: { currentVersionId } });
      },
      restore: async () => {
        await prisma.legalDocument.update({ where: { id: document.id }, data: { currentVersionId } });
      },
    };
  }
  if (document.currentVersion) return null;

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
    documentId: document.id,
    versionId: draftVersion.id,
    unpublish: async () => {
      await prisma.legalDocument.update({ where: { id: document.id }, data: { currentVersionId: null } });
    },
    republish: async () => {
      await prisma.legalDocument.update({ where: { id: document.id }, data: { currentVersionId: draftVersion.id } });
    },
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
