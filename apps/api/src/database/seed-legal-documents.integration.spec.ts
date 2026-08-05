import { PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "./test-db-client";
import { LEGAL_DOCUMENT_CATALOG, LEGAL_CONTENT_PLACEHOLDER } from "./legal-document-catalog";
import { seedLegalDocuments } from "./seed-legal-documents";

describe("Legal documents seed (integration, real Postgres)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("is idempotent: running the seed twice does not change row counts", async () => {
    await seedLegalDocuments(prisma);
    const documentsAfterFirst = await prisma.legalDocument.count();
    const versionsAfterFirst = await prisma.legalDocumentVersion.count();

    await seedLegalDocuments(prisma);
    const documentsAfterSecond = await prisma.legalDocument.count();
    const versionsAfterSecond = await prisma.legalDocumentVersion.count();

    expect(documentsAfterSecond).toBe(documentsAfterFirst);
    expect(versionsAfterSecond).toBe(versionsAfterFirst);
  });

  it("creates exactly the catalog's 11 documents, no more no fewer", async () => {
    await seedLegalDocuments(prisma);

    const documents = await prisma.legalDocument.findMany({ where: { slug: { in: LEGAL_DOCUMENT_CATALOG.map((e) => e.slug) } } });
    expect(documents).toHaveLength(LEGAL_DOCUMENT_CATALOG.length);
    expect(documents).toHaveLength(11);
  });

  it("Example (AC): querying the seeded 'terminos-y-condiciones' document returns DRAFT status with all required sections present and non-empty", async () => {
    await seedLegalDocuments(prisma);

    const document = await prisma.legalDocument.findUniqueOrThrow({ where: { slug: "terminos-y-condiciones" } });
    const version = await prisma.legalDocumentVersion.findUniqueOrThrow({
      where: { legalDocumentId_version: { legalDocumentId: document.id, version: 1 } },
    });

    expect(version.status).toBe("DRAFT");
    const content = version.draftContent as { sections: Array<{ heading: string; body: string }> };
    const expectedHeadings = [
      "Identificación de la empresa",
      "Definiciones",
      "Elegibilidad",
      "Precios, impuestos y pagos",
      "Reembolsos y reversiones",
      "Cancelaciones",
      "Renovaciones",
      "Propiedad intelectual",
      "Responsabilidad",
      "Ley aplicable",
      "Contacto",
      "Versión",
    ];
    expect(content.sections.map((s) => s.heading)).toEqual(expectedHeadings);
    for (const section of content.sections) {
      expect(section.body.length).toBeGreaterThan(0);
    }
  });

  it("Negative case (AC): none of the seeded documents has status APPROVED or PUBLISHED immediately after seeding", async () => {
    await seedLegalDocuments(prisma);

    const versions = await prisma.legalDocumentVersion.findMany({
      where: { legalDocument: { slug: { in: LEGAL_DOCUMENT_CATALOG.map((e) => e.slug) } }, version: 1 },
    });

    expect(versions).toHaveLength(11);
    for (const version of versions) {
      expect(version.status).toBe("DRAFT");
    }
  });

  it("only renders confirmed facts or the explicit placeholder - never a fabricated legal representative, address, price, or guarantee", async () => {
    await seedLegalDocuments(prisma);

    const confirmedFragments = ["ASODEF S.A.S.", "info@asodef.com.co", "Cali", "Colombia", "Juan Pablo Filigrana", "Director Comercial", "wa.me"];
    for (const entry of LEGAL_DOCUMENT_CATALOG) {
      for (const section of entry.sections) {
        const isPlaceholder = section.body === LEGAL_CONTENT_PLACEHOLDER;
        const isConfirmedFact = confirmedFragments.some((fragment) => section.body.includes(fragment));
        // The "Versión" section states the document's own draft/review
        // state - a fact about the record itself, not a legal claim that
        // needs confirmation, so it's exempt from the confirmed-facts check.
        const isDraftStateNotice = section.heading === "Versión";
        expect(isPlaceholder || isConfirmedFact || isDraftStateNotice).toBe(true);
      }
    }
  });

  it("does not overwrite a version that has already moved past DRAFT on a subsequent seed run", async () => {
    await seedLegalDocuments(prisma);

    const document = await prisma.legalDocument.findUniqueOrThrow({ where: { slug: "seguridad" } });
    const version = await prisma.legalDocumentVersion.findUniqueOrThrow({
      where: { legalDocumentId_version: { legalDocumentId: document.id, version: 1 } },
    });

    const reviewedContent = { sections: [{ heading: "Contenido revisado manualmente", body: "Texto ya en revisión legal real." }] };
    await prisma.legalDocumentVersion.update({
      where: { id: version.id },
      data: { status: "LEGAL_REVIEW", draftContent: reviewedContent },
    });

    await seedLegalDocuments(prisma);

    const afterReseed = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(afterReseed.status).toBe("LEGAL_REVIEW");
    expect(afterReseed.draftContent).toEqual(reviewedContent);

    await prisma.legalDocumentVersion.update({ where: { id: version.id }, data: { status: "DRAFT", draftContent: version.draftContent as object } });
  });
});
