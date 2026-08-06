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

  it("US-068: each additional document exists and reseeding never changes its workflow or current version", async () => {
    const before = await prisma.legalDocument.findMany({ where: { slug: { in: LEGAL_DOCUMENT_CATALOG.map((entry) => entry.slug) } }, include: { versions: { where: { version: 1 } } } });
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
      const previous = before.find((item) => item.slug === slug)!;
      expect(version.status).toBe(previous.versions[0]?.status);
      expect(document.currentVersionId).toBe(previous.currentVersionId);
    }
  });

  it("Example (AC): querying the seeded 'terminos-y-condiciones' document returns DRAFT status with all required sections present and non-empty", async () => {
    await seedLegalDocuments(prisma);

    const content = LEGAL_DOCUMENT_CATALOG.find((entry) => entry.slug === "terminos-y-condiciones")!;
    expect(content.sections.map((s) => s.heading)).toEqual(expect.arrayContaining(["Aceptación y alcance", "Cuentas y seguridad", "Precios, impuestos y pagos", "Propiedad intelectual", "Ley y solución de solicitudes"]));
    expect(content.sections.length).toBeGreaterThanOrEqual(10);
    for (const section of content.sections) {
      expect(section.body.length).toBeGreaterThan(0);
    }
  });

  it("Negative case (AC): seeding performs no approval or publication transition", async () => {
    const before = await prisma.legalDocumentVersion.findMany({
      where: { legalDocument: { slug: { in: LEGAL_DOCUMENT_CATALOG.map((e) => e.slug) } }, version: 1 },
      select: { id: true, status: true },
    });
    await seedLegalDocuments(prisma);

    const versions = await prisma.legalDocumentVersion.findMany({
      where: { legalDocument: { slug: { in: LEGAL_DOCUMENT_CATALOG.map((e) => e.slug) } }, version: 1 },
    });

    expect(versions).toHaveLength(21);
    expect(versions.map(({ id, status }) => ({ id, status })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(before.sort((a, b) => a.id.localeCompare(b.id)));
  });

  it("contains complete ASODEF-specific prose with no placeholders, fabricated price or universal guarantee", async () => {
    await seedLegalDocuments(prisma);
    for (const entry of LEGAL_DOCUMENT_CATALOG) {
      expect(entry.sources.length).toBeGreaterThan(0);
      for (const section of entry.sections) {
        expect(section.heading.trim().length).toBeGreaterThan(0);
        expect(section.body.trim().length).toBeGreaterThan(40);
        expect(section.body).not.toContain(LEGAL_CONTENT_PLACEHOLDER);
        expect(section.body).not.toContain("LEGAL_CONTENT_PLACEHOLDER");
        expect(section.body).not.toMatch(/Lorem ipsum|\bPor definir\b/i);
      }
    }
  });

  it("US-069: informacion-empresarial carries the real NIT and a Certificate-verified registered address and legal representative", async () => {
    await seedLegalDocuments(prisma);

    const content = LEGAL_DOCUMENT_CATALOG.find((entry) => entry.slug === "informacion-empresarial")!;

    const nitSection = content.sections.find((s) => s.heading === "Identificación");
    expect(nitSection?.body).toContain("900552882-2");

    const addressSection = content.sections.find((s) => s.heading === "Domicilio y notificaciones");
    expect(addressSection?.body).toContain("Carrera 40");

    const legalRepSection = content.sections.find((s) => s.heading === "Representación");
    expect(legalRepSection?.body).toContain("Adolfo Reyes Gómez");
    expect(legalRepSection?.body).not.toBe(LEGAL_CONTENT_PLACEHOLDER);

    // Deliberately excluded: Grupo Empresarial control-chain / revenue
    // disclosures from the same certificate never reach public content.
    for (const section of content.sections) {
      expect(section.body).not.toContain("Grupo Empresarial");
      expect(section.body).not.toContain("Coorserpark");
      expect(section.body).not.toContain("1,318,079,569");
    }
  });

  it("does not overwrite any existing version, including an unreviewed DRAFT, on a subsequent seed run", async () => {
    await seedLegalDocuments(prisma);

    const document = await prisma.legalDocument.findUniqueOrThrow({ where: { slug: "seguridad" } });
    const version = await prisma.legalDocumentVersion.findUniqueOrThrow({
      where: { legalDocumentId_version: { legalDocumentId: document.id, version: 1 } },
    });

    const reviewedContent = { sections: [{ heading: "Contenido revisado manualmente", body: "Texto ya en revisión legal real." }] };
    await prisma.legalDocumentVersion.update({
      where: { id: version.id },
      data: { status: "DRAFT", draftContent: reviewedContent },
    });

    await seedLegalDocuments(prisma);

    const afterReseed = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(afterReseed.status).toBe("DRAFT");
    expect(afterReseed.draftContent).toEqual(reviewedContent);

    await prisma.legalDocumentVersion.update({ where: { id: version.id }, data: { status: "DRAFT", draftContent: version.draftContent as object } });
  });
});
