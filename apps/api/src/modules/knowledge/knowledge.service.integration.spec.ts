import { randomUUID } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import {
  KnowledgeLifecycleStatus,
  PrismaClient,
} from "@prisma/client";
import type {
  GatewayRequestContext,
  KnowledgeGatewayRequest,
} from "@asodef/connect-contracts";
import { createTestPrismaClient } from "../../database/test-db-client";
import type { CreateManualKnowledgeDto } from "./knowledge.dto";
import { KnowledgeService } from "./knowledge.service";
import { DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG } from "./knowledge.tokens";

describe("KnowledgeService governed lifecycle (integration)", () => {
  let prisma: PrismaClient;
  let service: KnowledgeService;
  let actorId: string;

  const itemIds: string[] = [];
  const versionIds: string[] = [];
  const correlationPrefix = `knowledge-integration-${randomUUID()}`;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
    const actor = await prisma.user.create({
      data: {
        email: `${randomUUID()}@knowledge.test`,
        fullName: "Knowledge Integration Actor",
        passwordHash: "test-only-password-hash",
        status: "ACTIVE",
      },
    });
    actorId = actor.id;
    service = new KnowledgeService(
      prisma as unknown as ConstructorParameters<typeof KnowledgeService>[0],
      [],
      DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG,
    );
  });

  afterAll(async () => {
    await prisma.knowledgeRetrievalAudit.deleteMany({
      where: { correlationId: { startsWith: correlationPrefix } },
    });
    await prisma.knowledgeAuditEvent.deleteMany({
      where: { knowledgeVersionId: { in: versionIds } },
    });
    await prisma.knowledgePublicationSnapshot.deleteMany({
      where: { knowledgeItemId: { in: itemIds } },
    });
    await prisma.knowledgeChunk.deleteMany({
      where: { knowledgeVersionId: { in: versionIds } },
    });
    await prisma.knowledgeSource.deleteMany({
      where: { knowledgeVersionId: { in: versionIds } },
    });
    await prisma.knowledgeVersion.deleteMany({
      where: { id: { in: versionIds } },
    });
    await prisma.knowledgeItem.deleteMany({ where: { id: { in: itemIds } } });
    await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it("retrieves only PUBLISHED knowledge with complete source traceability", async () => {
    const marker = uniqueMarker("lifecycle");
    const draft = await createDraft(marker);

    await expect(search(marker)).resolves.toMatchObject({
      ok: true,
      response: { outcome: "NO_EVIDENCE", citations: [] },
    });

    const review = await service.submitReview(
      draft.id,
      command(draft.revision, "Enviar a revisión"),
      mutationContext("review"),
    );
    expect(review.status).toBe(KnowledgeLifecycleStatus.REVIEW);
    await expect(search(marker)).resolves.toMatchObject({
      ok: true,
      response: { outcome: "NO_EVIDENCE", citations: [] },
    });

    const approved = await service.approve(
      draft.id,
      command(review.revision, "Aprobar contenido"),
      mutationContext("approve"),
    );
    expect(approved.status).toBe(KnowledgeLifecycleStatus.APPROVED);
    await expect(search(marker)).resolves.toMatchObject({
      ok: true,
      response: { outcome: "NO_EVIDENCE", citations: [] },
    });

    const published = await service.publish(
      draft.id,
      command(approved.revision, "Publicar contenido aprobado"),
      mutationContext("publish"),
    );
    expect(published.status).toBe(KnowledgeLifecycleStatus.PUBLISHED);

    const result = await search(marker);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.response.outcome).not.toBe("NO_EVIDENCE");
    expect(result.response.citations).toHaveLength(1);
    expect(result.response.citations[0]).toMatchObject({
      knowledgeItemId: draft.knowledgeItemId,
      knowledgeVersionId: draft.id,
      knowledgeChunkId: published.chunks[0]!.id,
      knowledgeSourceId: published.source!.id,
      sourceReference: `manual://${marker}`,
      sourceChecksumSha256: published.source!.sourceChecksum,
      language: "es",
      audience: "PUBLIC",
    });
    expect(result.response.citations[0]!.publicationId).toBe(
      published.publicationSnapshot!.id,
    );
    const listed = await service.listItems({
      search: marker,
      page: 1,
      pageSize: 30,
    });
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.id).toBe(draft.knowledgeItemId);
    expect(listed.items[0]?.versions[0]).not.toHaveProperty("content");
    const detail = await service.getItem(draft.knowledgeItemId);
    expect(detail.versions[0]?.source?.sourceReference).toBe(`manual://${marker}`);
    expect(detail.versions[0]).not.toHaveProperty("content");
    expect(detail.versions[0]).not.toHaveProperty("chunks");
    const diff = await service.getVersionDiff(
      draft.id,
      mutationContext("diff"),
    );
    expect(diff.current.content).toContain(marker);
    expect(diff.previous).toBeNull();
    const auditEvents = await prisma.knowledgeAuditEvent.findMany({
      where: { knowledgeVersionId: draft.id },
      orderBy: { createdAt: "asc" },
    });
    expect(auditEvents.map(({ action }) => action)).toEqual([
      "knowledge.version.created",
      "knowledge.version.review",
      "knowledge.version.approved",
      "knowledge.version.published",
      "knowledge.version.diff_viewed",
    ]);
    expect(auditEvents.every((event) => event.knowledgeItemId === draft.knowledgeItemId)).toBe(true);
    expect(JSON.stringify(auditEvents)).not.toContain(
      `${marker} información institucional verificable`,
    );
  });

  it("denies expired and future publications while preserving their published records", async () => {
    const expiredMarker = uniqueMarker("expired");
    const futureMarker = uniqueMarker("future");
    const expired = await createAndPublish(expiredMarker, {
      effectiveFrom: "2020-01-01T00:00:00.000Z",
      effectiveUntil: "2021-01-01T00:00:00.000Z",
    });
    const future = await createAndPublish(futureMarker, {
      effectiveFrom: "2099-01-01T00:00:00.000Z",
      effectiveUntil: "2100-01-01T00:00:00.000Z",
    });

    await expect(search(expiredMarker)).resolves.toMatchObject({
      ok: true,
      response: { outcome: "NO_EVIDENCE", citations: [] },
    });
    await expect(search(futureMarker)).resolves.toMatchObject({
      ok: true,
      response: { outcome: "NO_EVIDENCE", citations: [] },
    });
    const timeBoundVersions = await prisma.knowledgeVersion.findMany({
      where: { id: { in: [expired.id, future.id] } },
      select: { status: true },
    });
    expect(timeBoundVersions).toHaveLength(2);
    expect(
      timeBoundVersions.every(
        ({ status }) => status === KnowledgeLifecycleStatus.PUBLISHED,
      ),
    ).toBe(true);
  });

  it("fails closed on runtime publication inconsistency and produces SOURCE_CONFLICT without guessing", async () => {
    const mismatchMarker = uniqueMarker("binding-mismatch");
    const mismatched = await createAndPublish(mismatchMarker);
    await prisma.knowledgeVersion.update({
      where: { id: mismatched.id },
      data: { audience: "INTERNAL" },
    });
    await expect(search(mismatchMarker)).resolves.toMatchObject({
      ok: true,
      response: { outcome: "NO_EVIDENCE", citations: [] },
    });

    const conflictMarker = uniqueMarker("source-conflict");
    const first = await createAndPublish(`${conflictMarker}-a`, {
      content: `${conflictMarker} orientación institucional vigente`,
    });
    const second = await createAndPublish(`${conflictMarker}-b`, {
      content: `${conflictMarker} orientación institucional vigente`,
    });
    await prisma.knowledgeChunk.update({
      where: {
        knowledgeVersionId_ordinal: {
          knowledgeVersionId: first.id,
          ordinal: 0,
        },
      },
      data: { metadata: { claims: [{ key: "canal", value: "web" }] } },
    });
    await prisma.knowledgeChunk.update({
      where: {
        knowledgeVersionId_ordinal: {
          knowledgeVersionId: second.id,
          ordinal: 0,
        },
      },
      data: { metadata: { claims: [{ key: "canal", value: "oficina" }] } },
    });

    const conflict = await search(conflictMarker);
    expect(conflict).toMatchObject({
      ok: true,
      response: { outcome: "SOURCE_CONFLICT" },
    });
    if (!conflict.ok) throw new Error(conflict.error.code);
    expect(conflict.response.citations).toHaveLength(2);
  });

  it("fails stale CAS writes and forbids mutating a published version through lifecycle transitions", async () => {
    const marker = uniqueMarker("cas");
    const draft = await createDraft(marker);
    const review = await service.submitReview(
      draft.id,
      command(draft.revision, "Revisión inicial"),
      mutationContext("cas-review"),
    );

    await expect(
      service.approve(
        draft.id,
        command(draft.revision, "Revisión obsoleta"),
        mutationContext("cas-stale"),
      ),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      response: { message: "KNOWLEDGE_CONCURRENT_CHANGE" },
    });

    const approved = await service.approve(
      draft.id,
      command(review.revision, "Aprobación válida"),
      mutationContext("cas-approve"),
    );
    const published = await service.publish(
      draft.id,
      command(approved.revision, "Publicación válida"),
      mutationContext("cas-publish"),
    );

    await expect(
      service.submitReview(
        draft.id,
        command(published.revision, "Mutación prohibida"),
        mutationContext("published-mutation"),
      ),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      response: {
        message: "Transición de conocimiento inválida: PUBLISHED -> REVIEW",
      },
    });
    await expect(
      prisma.knowledgeVersion.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({
      status: KnowledgeLifecycleStatus.PUBLISHED,
      revision: published.revision,
    });
  });

  it("publishes V2 atomically, retires V1, and preserves the immutable V1 publication evidence", async () => {
    const marker = uniqueMarker("versioning");
    const v1 = await createAndPublish(marker);
    const v1SnapshotBefore = await prisma.knowledgePublicationSnapshot.findUniqueOrThrow(
      { where: { knowledgeVersionId: v1.id } },
    );
    const v1SourceBefore = await prisma.knowledgeSource.findUniqueOrThrow({
      where: { knowledgeVersionId: v1.id },
    });

    const v2 = await createDraft(`${marker}-v2`, {
      knowledgeItemId: v1.knowledgeItemId,
      expectedItemRevision: 0,
      stableKey: undefined,
      sourceReference: `manual://${marker}/v2`,
      content: `${marker} información institucional revisada versión dos`,
    });
    expect(v2.version).toBe(2);
    expect(v2.source!.sourceChecksum).not.toBe(v1SourceBefore.sourceChecksum);
    const review = await service.submitReview(
      v2.id,
      command(v2.revision, "Revisar versión dos"),
      mutationContext("v2-review"),
    );
    const approved = await service.approve(
      v2.id,
      command(review.revision, "Aprobar versión dos"),
      mutationContext("v2-approve"),
    );
    const publishedV2 = await service.publish(
      v2.id,
      command(approved.revision, "Reemplazar versión activa"),
      mutationContext("v2-publish"),
    );

    const activeVersions = await prisma.knowledgeVersion.findMany({
      where: { knowledgeItemId: v1.knowledgeItemId },
      orderBy: { version: "asc" },
      select: { id: true, version: true, status: true },
    });
    expect(activeVersions).toEqual([
      { id: v1.id, version: 1, status: KnowledgeLifecycleStatus.RETIRED },
      { id: v2.id, version: 2, status: KnowledgeLifecycleStatus.PUBLISHED },
    ]);

    const v1SnapshotAfter = await prisma.knowledgePublicationSnapshot.findUniqueOrThrow(
      { where: { knowledgeVersionId: v1.id } },
    );
    const v1SourceAfter = await prisma.knowledgeSource.findUniqueOrThrow({
      where: { knowledgeVersionId: v1.id },
    });
    expect(v1SnapshotAfter).toEqual(v1SnapshotBefore);
    expect(v1SourceAfter).toEqual(v1SourceBefore);
    expect(publishedV2.publicationSnapshot).toMatchObject({
      knowledgeItemId: v1.knowledgeItemId,
      sourceChecksum: publishedV2.source!.sourceChecksum,
    });
  });

  it("keeps DRAFT preview isolated, leaves status unchanged, audits it, and returns NO_EVIDENCE safely", async () => {
    const marker = uniqueMarker("preview");
    const draft = await createDraft(marker);
    const preview = await service.preview(
      draft.id,
      { query: marker, limit: 10 },
      mutationContext("preview-hit"),
    );
    expect(preview).toMatchObject({
      preview: true,
      statusUnchanged: KnowledgeLifecycleStatus.DRAFT,
      outcome: "PARTIAL_EVIDENCE",
    });
    expect(preview.citations[0]).toMatchObject({
      knowledgeItemId: draft.knowledgeItemId,
      knowledgeVersionId: draft.id,
      knowledgeChunkId: draft.chunks[0]!.id,
      knowledgeSourceId: draft.source!.id,
    });

    const noEvidence = await service.preview(
      draft.id,
      { query: `ausente-${randomUUID()}`, limit: 10 },
      mutationContext("preview-empty"),
    );
    expect(noEvidence).toMatchObject({
      preview: true,
      statusUnchanged: KnowledgeLifecycleStatus.DRAFT,
      outcome: "NO_EVIDENCE",
      citations: [],
    });
    await expect(
      prisma.knowledgeVersion.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({
      status: KnowledgeLifecycleStatus.DRAFT,
      revision: draft.revision,
    });
    await expect(
      prisma.knowledgeAuditEvent.count({
        where: {
          knowledgeVersionId: draft.id,
          action: "knowledge.version.previewed",
        },
      }),
    ).resolves.toBe(2);
    await expect(search(marker)).resolves.toMatchObject({
      ok: true,
      response: { outcome: "NO_EVIDENCE", citations: [] },
    });
  });

  async function createDraft(
    marker: string,
    overrides: Partial<CreateManualKnowledgeDto> = {},
  ) {
    const dto: CreateManualKnowledgeDto = {
      stableKey: `knowledge-${marker}`,
      title: `Conocimiento ${marker}`,
      domain: "ASODEF_INSTITUCIONAL",
      audience: "PUBLIC",
      classification: "PUBLIC",
      language: "es",
      sourceReference: `manual://${marker}`,
      sourceOwner: "Equipo ASODEF",
      changeReason: "Fixture de integración Knowledge V1",
      content: `${marker} información institucional verificable de ASODEF`,
      ...overrides,
    };
    const created = await service.createManualDraft(
      dto,
      mutationContext(`create-${marker}`),
    );
    if (!itemIds.includes(created.knowledgeItemId))
      itemIds.push(created.knowledgeItemId);
    versionIds.push(created.id);
    return created;
  }

  async function createAndPublish(
    marker: string,
    overrides: Partial<CreateManualKnowledgeDto> = {},
  ) {
    const draft = await createDraft(marker, overrides);
    const review = await service.submitReview(
      draft.id,
      command(draft.revision, "Enviar a revisión"),
      mutationContext(`review-${marker}`),
    );
    const approved = await service.approve(
      draft.id,
      command(review.revision, "Aprobar"),
      mutationContext(`approve-${marker}`),
    );
    return service.publish(
      draft.id,
      command(approved.revision, "Publicar"),
      mutationContext(`publish-${marker}`),
    );
  }

  function search(query: string) {
    const request: KnowledgeGatewayRequest = {
      version: "v1",
      query,
      domainKeys: ["ASODEF_INSTITUCIONAL"],
      limit: 10,
    };
    return service.search(request, gatewayContext(`search-${query}`));
  }

  function gatewayContext(suffix: string): GatewayRequestContext {
    return {
      version: "v1",
      identity: {
        principalType: "KORAL",
        principalId: "KORAL",
        effectiveActorId: actorId,
        identityLevel: "AUTHENTICATED",
        permissions: ["knowledge.read"],
      },
      audit: { correlationId: `${correlationPrefix}-${suffix}` },
      policy: {
        purpose: "KNOWLEDGE_ASSISTANCE",
        consentPurposeKeys: [],
        consentVerified: true,
        piiPolicy: "DENY",
        dataClassification: "PUBLIC",
      },
      effectiveScope: {
        authority: "SERVER_SIDE",
        tenantKey: "ASODEF",
        audience: "PUBLIC",
        organizationIds: [],
        maximumDataClassification: "PUBLIC",
      },
      deadlineAt: new Date(Date.now() + 30_000).toISOString(),
    };
  }

  function mutationContext(suffix: string) {
    return {
      actorUserId: actorId,
      correlationId: `${correlationPrefix}-${suffix}`,
      requestId: `request-${suffix}`,
    };
  }
});

function command(expectedRevision: number, changeReason: string) {
  return { expectedRevision, changeReason };
}

function uniqueMarker(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll("-", "")}`;
}
