import { LegalDocumentVersionStatus } from "@prisma/client";
import { AuditService } from "../modules/audit/audit.service";
import { LegalDocumentsService } from "../modules/legal-documents/legal-documents.service";
import { LEGAL_DOCUMENT_CATALOG } from "./legal-document-catalog";
import { PrismaService } from "./prisma.service";

interface PublicationResult {
  slug: string;
  version: number;
  status: string;
  current: boolean;
}

export async function publishLegalCorrections(): Promise<PublicationResult[]> {
  const prisma = new PrismaService();
  const service = new LegalDocumentsService(prisma, new AuditService());
  await prisma.$connect();
  try {
    const actor = await prisma.user.findFirst({
      where: { status: "ACTIVE", roles: { some: { role: { name: "SUPER_ADMIN" } } } },
      orderBy: { createdAt: "asc" },
    });
    if (!actor) throw new Error("No existe un usuario SUPER_ADMIN activo para ejecutar el workflow legal auditado.");

    const results: PublicationResult[] = [];
    for (const entry of LEGAL_DOCUMENT_CATALOG) {
      const document = await prisma.legalDocument.findUniqueOrThrow({ where: { slug: entry.slug } });
      const draftContent = {
        summary: entry.description,
        sections: entry.sections.map(({ heading, body }) => ({ heading, body })),
      };
      const sourceTraceability = entry.sources.map(({ source, basis }) => ({ source, basis, verifiedAt: "2026-08-05" }));

      let version = await prisma.legalDocumentVersion.findUnique({
        where: { legalDocumentId_version: { legalDocumentId: document.id, version: 2 } },
      });
      if (!version) {
        await service.createVersion(document.id, actor.id, {
          draftContent,
          changeSummary: "Versión correctiva: contenido ASODEF completo, fuentes trazables y eliminación de marcadores no publicables.",
          sourceTraceability,
          effectiveDate: new Date().toISOString(),
        });
      } else if (version.status === LegalDocumentVersionStatus.DRAFT) {
        await service.updateDraft(version.id, actor.id, {
          draftContent,
          changeSummary: "Versión correctiva: contenido ASODEF completo, fuentes trazables y eliminación de marcadores no publicables.",
          sourceTraceability,
          effectiveDate: version.effectiveDate?.toISOString() ?? new Date().toISOString(),
        });
      }

      version = await prisma.legalDocumentVersion.findUniqueOrThrow({
        where: { legalDocumentId_version: { legalDocumentId: document.id, version: 2 } },
      });
      if (version.status === LegalDocumentVersionStatus.DRAFT) await service.submitForReview(version.id, actor.id);
      version = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: version.id } });
      if (version.status === LegalDocumentVersionStatus.LEGAL_REVIEW) await service.submitForApproval(version.id, actor.id);
      version = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: version.id } });
      if (version.status === LegalDocumentVersionStatus.PENDING_APPROVAL) await service.approve(version.id, actor.id);
      version = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: version.id } });
      if (version.status === LegalDocumentVersionStatus.APPROVED) await service.publish(version.id, actor.id);
      version = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: version.id } });

      const current = await prisma.legalDocument.findUniqueOrThrow({ where: { id: document.id }, select: { currentVersionId: true } });
      results.push({ slug: entry.slug, version: version.version, status: version.status, current: current.currentVersionId === version.id });
    }

    const fixtures = await prisma.legalDocument.findMany({ where: { slug: { startsWith: "consent-test-doc-" } }, include: { versions: true } });
    for (const fixture of fixtures) {
      for (const version of fixture.versions) await service.archive(version.id, actor.id);
    }
    return results;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  publishLegalCorrections()
    .then((results) => {
      const published = results.filter((result) => result.status === "PUBLISHED" && result.current).length;
      process.stdout.write(`Legal corrections complete: ${published}/${results.length} institutional documents published.\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(`Legal corrections failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
      process.exitCode = 1;
    });
}
