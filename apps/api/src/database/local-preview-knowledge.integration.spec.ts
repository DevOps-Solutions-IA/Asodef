import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "./test-db-client";
import {
  assertLocalPreviewKnowledgeEnvironment,
  ensureLocalPreviewKnowledgeFixture,
  LOCAL_PREVIEW_KNOWLEDGE_QUERY,
  LOCAL_PREVIEW_KNOWLEDGE_STABLE_KEY,
} from "./local-preview-knowledge";
import { KnowledgeService } from "../modules/knowledge/knowledge.service";
import { DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG } from "../modules/knowledge/knowledge.tokens";

const RETRIEVAL_CORRELATION_ID = "local-preview-knowledge-integration-retrieval";

describe("Local Preview reviewable Knowledge", () => {
  let prisma: PrismaClient;
  let actorId: string;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
    const actor = await prisma.user.create({
      data: {
        email: `local-preview-knowledge-${randomUUID()}@test.invalid`,
        fullName: "Local Preview Knowledge Test Actor",
        passwordHash: "test-only-password-hash",
        status: "ACTIVE",
      },
    });
    actorId = actor.id;
  });

  afterAll(async () => {
    await prisma.knowledgeRetrievalAudit.deleteMany({
      where: { correlationId: RETRIEVAL_CORRELATION_ID },
    });
    const item = await prisma.knowledgeItem.findUnique({
      where: {
        tenantKey_stableKey: {
          tenantKey: "ASODEF",
          stableKey: LOCAL_PREVIEW_KNOWLEDGE_STABLE_KEY,
        },
      },
      include: { versions: { select: { id: true } } },
    });
    if (item) {
      const versionIds = item.versions.map(({ id }) => id);
      await prisma.knowledgeAuditEvent.deleteMany({
        where: { knowledgeItemId: item.id },
      });
      await prisma.knowledgePublicationSnapshot.deleteMany({
        where: { knowledgeItemId: item.id },
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
      await prisma.knowledgeItem.delete({ where: { id: item.id } });
    }
    await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it("publishes exactly one canonical fixture across three preparation runs", async () => {
    const first = await ensureLocalPreviewKnowledgeFixture(prisma, actorId);
    const second = await ensureLocalPreviewKnowledgeFixture(prisma, actorId);
    const third = await ensureLocalPreviewKnowledgeFixture(prisma, actorId);

    expect(first).toEqual({
      created: true,
      knowledgeItemCount: 1,
      publishedFixtureCount: 1,
    });
    expect(second).toEqual({
      created: false,
      knowledgeItemCount: 1,
      publishedFixtureCount: 1,
    });
    expect(third).toEqual(second);
    await expect(
      prisma.knowledgeVersion.count({
        where: {
          knowledgeItem: {
            tenantKey: "ASODEF",
            stableKey: LOCAL_PREVIEW_KNOWLEDGE_STABLE_KEY,
          },
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.knowledgePublicationSnapshot.count({
        where: {
          knowledgeItem: {
            tenantKey: "ASODEF",
            stableKey: LOCAL_PREVIEW_KNOWLEDGE_STABLE_KEY,
          },
        },
      }),
    ).resolves.toBe(1);

    const service = new KnowledgeService(
      prisma as unknown as ConstructorParameters<typeof KnowledgeService>[0],
      [],
      DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG,
    );
    await expect(
      service.search(
        {
          version: "v1",
          query: LOCAL_PREVIEW_KNOWLEDGE_QUERY,
          domainKeys: ["BENEFICIOS_Y_CONVENIOS"],
          limit: 10,
        },
        {
          version: "v1",
          identity: {
            principalType: "KORAL",
            principalId: "KORAL",
            effectiveActorId: actorId,
            identityLevel: "AUTHENTICATED",
            permissions: ["knowledge.read"],
          },
          audit: { correlationId: RETRIEVAL_CORRELATION_ID },
          policy: {
            purpose: "KNOWLEDGE_ASSISTANCE",
            consentPurposeKeys: [],
            consentVerified: false,
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
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      response: {
        outcome: "SUFFICIENT_EVIDENCE",
        citations: [{ title: "Beneficios de ASODEF" }],
      },
    });
  });

  it("fails closed outside an isolated non-production Local Preview", () => {
    expect(() =>
      assertLocalPreviewKnowledgeEnvironment({
        LOCAL_PREVIEW: "false",
        DATABASE_URL:
          "postgresql://preview:preview@127.0.0.1:5432/asodef_preview_test",
      }),
    ).toThrow("LOCAL_PREVIEW=true");
    expect(() =>
      assertLocalPreviewKnowledgeEnvironment({
        LOCAL_PREVIEW: "true",
        NODE_ENV: "production",
        DATABASE_URL:
          "postgresql://preview:preview@127.0.0.1:5432/asodef_preview_test",
      }),
    ).toThrow("forbidden in production");
    expect(() =>
      assertLocalPreviewKnowledgeEnvironment({
        LOCAL_PREVIEW: "true",
        NODE_ENV: "test",
        DATABASE_URL:
          "postgresql://preview:preview@production.example/asodef_preview_test",
      }),
    ).toThrow("isolated local");
  });
});
