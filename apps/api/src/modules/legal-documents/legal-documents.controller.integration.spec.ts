import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { User } from "@prisma/client";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "../auth/password.service";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("Legal documents endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdDocumentIds: string[] = [];

  let superAdmin: { user: User; cookies: string[] };
  let admin: { user: User; cookies: string[] };
  let noPermActor: { user: User; cookies: string[] };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);

    superAdmin = await createActor("SUPER_ADMIN");
    admin = await createActor("ADMIN");
    noPermActor = await createActor("CUSTOMER");
  });

  afterAll(async () => {
    if (createdDocumentIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { legalDocumentVersion: { legalDocumentId: { in: createdDocumentIds } } } });
      await prisma.legalDocument.updateMany({ where: { id: { in: createdDocumentIds } }, data: { currentVersionId: null } });
      await prisma.legalDocumentVersion.deleteMany({ where: { legalDocumentId: { in: createdDocumentIds } } });
      await prisma.legalDocument.deleteMany({ where: { id: { in: createdDocumentIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `legal-docs-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Legal Docs Test User",
        status: "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function assignRole(userId: string, roleName: string): Promise<void> {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });
  }

  async function loginAs(user: User): Promise<string[]> {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: user.email, password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    const raw = response.headers["set-cookie"];
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  }

  async function createActor(roleName: string): Promise<{ user: User; cookies: string[] }> {
    const user = await createUser();
    await assignRole(user.id, roleName);
    const cookies = await loginAs(user);
    return { user, cookies };
  }

  async function createDraftDocument(slugSuffix = randomUUID()) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/legal-documents")
      .set("Cookie", admin.cookies)
      .send({
        type: "terminos-y-condiciones",
        title: "Términos y condiciones",
        slug: `terminos-${slugSuffix}`,
        draftContent: { sections: [{ heading: "Identificación de la empresa", body: "ASODEF S.A.S." }] },
      });
    expect(response.status).toBe(201);
    createdDocumentIds.push(response.body.id);
    return response.body as { id: string; versions: { id: string; version: number; status: string }[] };
  }

  it("US-062: list() returns the document with its latest version's status and number", async () => {
    const document = await createDraftDocument();

    const response = await request(app.getHttpServer()).get("/api/v1/admin/legal-documents").set("Cookie", admin.cookies);
    expect(response.status).toBe(200);

    const entry = response.body.find((d: { id: string }) => d.id === document.id);
    expect(entry).toBeDefined();
    expect(entry.latestVersionStatus).toBe("DRAFT");
    expect(entry.latestVersionNumber).toBe(1);
  });

  it("US-089: blocks incomplete known content with every section error and a durable no-op audit", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/admin/legal-documents")
      .set("Cookie", admin.cookies)
      .send({
        type: "privacy_policy",
        title: "Política incompleta de prueba",
        slug: `privacy-incomplete-${randomUUID()}`,
        draftContent: { sections: [{ heading: "Responsable y contacto", body: "Pendiente de confirmación legal" }, { heading: "", body: "" }] },
      });
    expect(created.status).toBe(201);
    createdDocumentIds.push(created.body.id);
    const versionId = created.body.versions[0].id;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/legal-documents/versions/${versionId}/submit-for-review`)
      .set("Cookie", admin.cookies);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe("LEGAL_CONTENT_INCOMPLETE");
    expect(response.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "PLACEHOLDER" }), expect.objectContaining({ code: "EMPTY_HEADING" }), expect.objectContaining({ code: "EMPTY_BODY" }), expect.objectContaining({ code: "MISSING_REQUIRED_SECTION" })]));

    const version = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version.status).toBe("DRAFT");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { legalDocumentVersionId: versionId, action: "legal_document_version.content_validation_blocked" }, orderBy: { createdAt: "desc" } });
    expect(audit.applied).toBe(false);
  });

  describe("Example (AC): draft -> review -> approval produces exactly one APPROVED version with a full audit trail", () => {
    it("runs the full happy path", async () => {
      const document = await createDraftDocument();
      const versionId = document.versions[0]!.id;

      const review = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${versionId}/submit-for-review`)
        .set("Cookie", admin.cookies);
      expect(review.status).toBe(200);
      expect(review.body.status).toBe("LEGAL_REVIEW");

      const approval = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${versionId}/submit-for-approval`)
        .set("Cookie", admin.cookies);
      expect(approval.status).toBe(200);
      expect(approval.body.status).toBe("PENDING_APPROVAL");

      const approved = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${versionId}/approve`)
        .set("Cookie", superAdmin.cookies);
      expect(approved.status).toBe(200);
      expect(approved.body.status).toBe("APPROVED");
      expect(approved.body.approvedContent).toEqual({ sections: [{ heading: "Identificación de la empresa", body: "ASODEF S.A.S." }] });
      expect(approved.body.approvedByUserId).toBe(superAdmin.user.id);

      const versions = await prisma.legalDocumentVersion.findMany({ where: { legalDocumentId: document.id } });
      expect(versions).toHaveLength(1);
      expect(versions[0]?.status).toBe("APPROVED");

      const auditTrail = await prisma.auditLog.findMany({ where: { legalDocumentVersionId: versionId }, orderBy: { createdAt: "asc" } });
      expect(auditTrail.map((entry) => entry.action)).toEqual([
        "legal_document.created",
        "legal_document_version.submitted_for_review",
        "legal_document_version.submitted_for_approval",
        "legal_document_version.approved",
      ]);
      expect(auditTrail.every((entry) => entry.applied)).toBe(true);
    });
  });

  describe("Negative case (AC): publishing a DRAFT or PENDING_APPROVAL version returns 409 and changes nothing", () => {
    it("blocks publishing a DRAFT version", async () => {
      const document = await createDraftDocument();
      const versionId = document.versions[0]!.id;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${versionId}/publish`)
        .set("Cookie", superAdmin.cookies);
      expect(response.status).toBe(409);

      const version = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: versionId } });
      expect(version.status).toBe("DRAFT");
      expect(version.publicationDate).toBeNull();
    });

    it("blocks publishing a PENDING_APPROVAL version", async () => {
      const document = await createDraftDocument();
      const versionId = document.versions[0]!.id;
      await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${versionId}/submit-for-review`).set("Cookie", admin.cookies);
      await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${versionId}/submit-for-approval`)
        .set("Cookie", admin.cookies);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${versionId}/publish`)
        .set("Cookie", superAdmin.cookies);
      expect(response.status).toBe(409);

      const version = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: versionId } });
      expect(version.status).toBe("PENDING_APPROVAL");
    });

    it("US-065 Negative case (AC): a PENDING_APPROVAL v2 fails to publish, and the public query still serves the previous PUBLISHED v1 unaffected", async () => {
      const document = await createDraftDocument();
      const v1Id = document.versions[0]!.id;
      await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${v1Id}/submit-for-review`).set("Cookie", admin.cookies);
      await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${v1Id}/submit-for-approval`).set("Cookie", admin.cookies);
      await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${v1Id}/approve`).set("Cookie", superAdmin.cookies);
      const v1Publish = await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${v1Id}/publish`).set("Cookie", superAdmin.cookies);
      expect(v1Publish.status).toBe(200);
      const slug: string = (await prisma.legalDocument.findUniqueOrThrow({ where: { id: document.id } })).slug;

      const v2Response = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/${document.id}/versions`)
        .set("Cookie", admin.cookies)
        .send({ draftContent: { sections: [{ heading: "Identificación de la empresa", body: "ASODEF S.A.S. (borrador v2, nunca aprobado)" }] } });
      expect(v2Response.status).toBe(201);
      const v2Id = v2Response.body.id;
      await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${v2Id}/submit-for-review`).set("Cookie", admin.cookies);
      await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${v2Id}/submit-for-approval`).set("Cookie", admin.cookies);

      const v2Publish = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${v2Id}/publish`)
        .set("Cookie", superAdmin.cookies);
      expect(v2Publish.status).toBe(409);

      const v2After = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: v2Id } });
      expect(v2After.status).toBe("PENDING_APPROVAL");
      expect(v2After.publicationDate).toBeNull();

      // The public-facing query is completely unaffected by the failed
      // v2 publish attempt - it still serves v1's own content.
      const publicResponse = await request(app.getHttpServer()).get(`/api/v1/legal-documents/${slug}`);
      expect(publicResponse.status).toBe(200);
      expect(publicResponse.body.version).toBe(1);
      expect(publicResponse.body.content).toEqual({ sections: [{ heading: "Identificación de la empresa", body: "ASODEF S.A.S." }] });

      const documentAfter = await prisma.legalDocument.findUniqueOrThrow({ where: { id: document.id } });
      expect(documentAfter.currentVersionId).toBe(v1Id);
    });
  });

  async function approveVersion(versionId: string) {
    await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${versionId}/submit-for-review`).set("Cookie", admin.cookies);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/legal-documents/versions/${versionId}/submit-for-approval`)
      .set("Cookie", admin.cookies);
    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/legal-documents/versions/${versionId}/approve`)
      .set("Cookie", superAdmin.cookies);
    expect(response.status).toBe(200);
  }

  describe("Publication and supersession", () => {
    it("publishing an APPROVED version sets publicationDate and becomes the document's current version", async () => {
      const document = await createDraftDocument();
      const versionId = document.versions[0]!.id;
      await approveVersion(versionId);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${versionId}/publish`)
        .set("Cookie", superAdmin.cookies);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("PUBLISHED");
      expect(response.body.publicationDate).not.toBeNull();

      const updatedDocument = await prisma.legalDocument.findUniqueOrThrow({ where: { id: document.id } });
      expect(updatedDocument.currentVersionId).toBe(versionId);
    });

    it("publishing a new version marks the prior PUBLISHED version as REPLACED, never deleting it", async () => {
      const document = await createDraftDocument();
      const v1Id = document.versions[0]!.id;
      await approveVersion(v1Id);
      await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${v1Id}/publish`).set("Cookie", superAdmin.cookies);

      const newVersionResponse = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/${document.id}/versions`)
        .set("Cookie", admin.cookies)
        .send({ draftContent: { sections: [{ heading: "Identificación de la empresa", body: "ASODEF S.A.S. (actualizado)" }] } });
      expect(newVersionResponse.status).toBe(201);
      expect(newVersionResponse.body.version).toBe(2);
      const v2Id = newVersionResponse.body.id;
      await approveVersion(v2Id);
      await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${v2Id}/publish`).set("Cookie", superAdmin.cookies);

      const v1After = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: v1Id } });
      expect(v1After.status).toBe("REPLACED");

      const updatedDocument = await prisma.legalDocument.findUniqueOrThrow({ where: { id: document.id } });
      expect(updatedDocument.currentVersionId).toBe(v2Id);

      // History is preserved, never deleted.
      const allVersions = await prisma.legalDocumentVersion.findMany({ where: { legalDocumentId: document.id } });
      expect(allVersions).toHaveLength(2);
    });
  });

  describe("Draft editing", () => {
    it("allows editing a DRAFT version's content", async () => {
      const document = await createDraftDocument();
      const versionId = document.versions[0]!.id;

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/legal-documents/versions/${versionId}`)
        .set("Cookie", admin.cookies)
        .send({ draftContent: { sections: [{ heading: "Cambiado", body: "Contenido editado" }] } });
      expect(response.status).toBe(200);
      expect(response.body.draftContent).toEqual({ sections: [{ heading: "Cambiado", body: "Contenido editado" }] });
    });

    it("rejects editing an APPROVED version and leaves its content unchanged", async () => {
      const document = await createDraftDocument();
      const versionId = document.versions[0]!.id;
      await approveVersion(versionId);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/legal-documents/versions/${versionId}`)
        .set("Cookie", admin.cookies)
        .send({ draftContent: { sections: [{ heading: "No debería aplicarse", body: "x" }] } });
      expect(response.status).toBe(409);

      const version = await prisma.legalDocumentVersion.findUniqueOrThrow({ where: { id: versionId } });
      expect(version.draftContent).toEqual({ sections: [{ heading: "Identificación de la empresa", body: "ASODEF S.A.S." }] });
    });
  });

  describe("Public retrieval", () => {
    it("returns only PUBLISHED content for a published document", async () => {
      const document = await createDraftDocument();
      const versionId = document.versions[0]!.id;
      await approveVersion(versionId);
      const publishRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${versionId}/publish`)
        .set("Cookie", superAdmin.cookies);
      const slug: string = (await prisma.legalDocument.findUniqueOrThrow({ where: { id: document.id } })).slug;
      expect(publishRes.status).toBe(200);

      const publicResponse = await request(app.getHttpServer()).get(`/api/v1/legal-documents/${slug}`);
      expect(publicResponse.status).toBe(200);
      expect(publicResponse.body.content).toEqual({ sections: [{ heading: "Identificación de la empresa", body: "ASODEF S.A.S." }] });
      expect(publicResponse.body).not.toHaveProperty("id");
      expect(publicResponse.body).not.toHaveProperty("draftContent");
    });

    it("Negative case: a DRAFT-only document is not publicly visible (generic 404, not an error)", async () => {
      const document = await createDraftDocument();
      const slug: string = (await prisma.legalDocument.findUniqueOrThrow({ where: { id: document.id } })).slug;

      const response = await request(app.getHttpServer()).get(`/api/v1/legal-documents/${slug}`);
      expect(response.status).toBe(404);
      expect(response.body.message).toBe("No se encontraron resultados.");
    });

    it("a PUBLISHED version with a future effectiveDate is not yet publicly visible", async () => {
      const document = await createDraftDocument();
      const versionId = document.versions[0]!.id;
      await prisma.legalDocumentVersion.update({
        where: { id: versionId },
        data: { effectiveDate: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      });
      await approveVersion(versionId);
      await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${versionId}/publish`).set("Cookie", superAdmin.cookies);
      const slug: string = (await prisma.legalDocument.findUniqueOrThrow({ where: { id: document.id } })).slug;

      const response = await request(app.getHttpServer()).get(`/api/v1/legal-documents/${slug}`);
      expect(response.status).toBe(404);
    });

    it("does not require authentication", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/legal-documents/does-not-exist");
      expect(response.status).not.toBe(401);
    });
  });

  describe("Authorization boundaries", () => {
    it("rejects an actor without content.manage from creating a document (403)", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/admin/legal-documents")
        .set("Cookie", noPermActor.cookies)
        .send({ type: "x", title: "x", slug: `forbidden-${randomUUID()}`, draftContent: {} });
      expect(response.status).toBe(403);
    });

    it("rejects an ADMIN (content.manage but not legal.approve) from approving a version (403)", async () => {
      const document = await createDraftDocument();
      const versionId = document.versions[0]!.id;
      await request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${versionId}/submit-for-review`).set("Cookie", admin.cookies);
      await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${versionId}/submit-for-approval`)
        .set("Cookie", admin.cookies);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${versionId}/approve`)
        .set("Cookie", admin.cookies);
      expect(response.status).toBe(403);
    });

    it("requires authentication (401) for admin routes with no session at all", async () => {
      const response = await request(app.getHttpServer()).post("/api/v1/admin/legal-documents").send({});
      expect(response.status).toBe(401);
    });
  });

  describe("Concurrency", () => {
    it("10 concurrent new-version creations for the same document never produce a duplicate version number", async () => {
      const document = await createDraftDocument();

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app.getHttpServer())
            .post(`/api/v1/admin/legal-documents/${document.id}/versions`)
            .set("Cookie", admin.cookies)
            .send({ draftContent: { sections: [{ heading: "x", body: "y" }] } }),
        ),
      );
      expect(responses.every((r) => r.status === 201)).toBe(true);

      const versions = await prisma.legalDocumentVersion.findMany({ where: { legalDocumentId: document.id } });
      const versionNumbers = versions.map((v) => v.version);
      expect(new Set(versionNumbers).size).toBe(versionNumbers.length);
      // version 1 (the initial draft) plus the 10 concurrent ones.
      expect(versions).toHaveLength(11);
    });

    it("concurrent publication attempts for two competing APPROVED versions never leave two current versions", async () => {
      const document = await createDraftDocument();
      const v1Id = document.versions[0]!.id;
      await approveVersion(v1Id);

      const v2Response = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/${document.id}/versions`)
        .set("Cookie", admin.cookies)
        .send({ draftContent: { sections: [{ heading: "x", body: "y" }] } });
      const v2Id = v2Response.body.id;
      await approveVersion(v2Id);

      const [r1, r2] = await Promise.all([
        request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${v1Id}/publish`).set("Cookie", superAdmin.cookies),
        request(app.getHttpServer()).post(`/api/v1/admin/legal-documents/versions/${v2Id}/publish`).set("Cookie", superAdmin.cookies),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 200]);

      const publishedVersions = await prisma.legalDocumentVersion.findMany({
        where: { legalDocumentId: document.id, status: "PUBLISHED" },
      });
      // Whichever publish() ran second is what ends up PUBLISHED - the
      // other was correctly superseded to REPLACED by it, so exactly one
      // PUBLISHED version survives regardless of ordering.
      expect(publishedVersions).toHaveLength(1);
    });
  });

  describe("Invalid transitions", () => {
    it("rejects submitting an already-APPROVED version for review again", async () => {
      const document = await createDraftDocument();
      const versionId = document.versions[0]!.id;
      await approveVersion(versionId);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/legal-documents/versions/${versionId}/submit-for-review`)
        .set("Cookie", admin.cookies);
      expect(response.status).toBe(409);

      const blockedEntry = await prisma.auditLog.findFirst({
        where: { legalDocumentVersionId: versionId, action: "legal_document_version.submitted_for_review", applied: false },
      });
      expect(blockedEntry).not.toBeNull();
    });
  });
});
