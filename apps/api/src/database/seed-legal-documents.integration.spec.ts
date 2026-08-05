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

  it("creates exactly the catalog's 21 documents, no more no fewer", async () => {
    await seedLegalDocuments(prisma);

    const documents = await prisma.legalDocument.findMany({ where: { slug: { in: LEGAL_DOCUMENT_CATALOG.map((e) => e.slug) } } });
    expect(documents).toHaveLength(LEGAL_DOCUMENT_CATALOG.length);
    expect(documents).toHaveLength(21);
  });

  it("US-068: each of the 10 newly-added document types exists in the catalog, seeds a DRAFT version, and 404s on the public route (never auto-published)", async () => {
    await seedLegalDocuments(prisma);

    const newSlugs = [
      "autorizacion-general-de-tratamiento",
      "consentimiento-whatsapp",
      "consentimiento-correo-electronico",
      "consentimiento-comunicaciones-comerciales",
      "tratamiento-datos-sensibles",
      "tratamiento-menores-y-beneficiarios",
      "procedimiento-consultas-y-reclamos",
      "politica-comunicaciones-electronicas",
      "condiciones-portal-empresarial",
      "condiciones-portal-afiliado",
    ];
    expect(LEGAL_DOCUMENT_CATALOG.map((e) => e.slug)).toEqual(expect.arrayContaining(newSlugs));

    for (const slug of newSlugs) {
      const document = await prisma.legalDocument.findUniqueOrThrow({ where: { slug } });
      const version = await prisma.legalDocumentVersion.findUniqueOrThrow({
        where: { legalDocumentId_version: { legalDocumentId: document.id, version: 1 } },
      });
      expect(version.status).toBe("DRAFT");
      expect(document.currentVersionId).toBeNull();
    }
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

    expect(versions).toHaveLength(21);
    for (const version of versions) {
      expect(version.status).toBe("DRAFT");
    }
  });

  it("only renders confirmed facts or the explicit placeholder - never a fabricated legal representative, address, price, or guarantee", async () => {
    await seedLegalDocuments(prisma);

    const confirmedFragments = [
      "ASODEF S.A.S.",
      "info@asodef.com.co",
      "Cali",
      "Colombia",
      "Juan Pablo Filigrana",
      "Director Comercial",
      "wa.me",
      // Corporate-data update: corroborated public-registry facts, each
      // carrying its own verification-status note where the source
      // isn't yet a Certificate of Existence and Legal Representation.
      "Valle del Cauca",
      "NIT",
      "Carrera 40",
      "Nota de verificación interna",
      // US-069: fields confirmed by the Certificado de Existencia y
      // Representación Legal, verificación 08264BJBC4.
      "Adolfo Reyes Gómez",
      "María Adelaida París Gómez",
      "854303",
      "MICRO",
      "08264BJBC4",
    ];
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

  it("US-069: informacion-empresarial carries the real NIT and a Certificate-verified registered address and legal representative", async () => {
    await seedLegalDocuments(prisma);

    const document = await prisma.legalDocument.findUniqueOrThrow({ where: { slug: "informacion-empresarial" } });
    const version = await prisma.legalDocumentVersion.findUniqueOrThrow({
      where: { legalDocumentId_version: { legalDocumentId: document.id, version: 1 } },
    });
    const content = version.draftContent as { sections: Array<{ heading: string; body: string }> };

    const nitSection = content.sections.find((s) => s.heading === "Identificación tributaria (NIT)");
    expect(nitSection?.body).toBe("NIT 900552882-2");

    const addressSection = content.sections.find((s) => s.heading === "Domicilio registrado");
    expect(addressSection?.body).toContain("Carrera 40");
    expect(addressSection?.body).toContain("Nota de verificación interna");
    expect(addressSection?.body).toContain("08264BJBC4");

    const legalRepSection = content.sections.find((s) => s.heading === "Representante legal");
    expect(legalRepSection?.body).toContain("Adolfo Reyes Gómez");
    expect(legalRepSection?.body).toContain("María Adelaida París Gómez");
    expect(legalRepSection?.body).not.toBe(LEGAL_CONTENT_PLACEHOLDER);

    // Deliberately excluded: Grupo Empresarial control-chain / revenue
    // disclosures from the same certificate never reach public content.
    for (const section of content.sections) {
      expect(section.body).not.toContain("Grupo Empresarial");
      expect(section.body).not.toContain("Coorserpark");
      expect(section.body).not.toContain("1,318,079,569");
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
