import { PrismaClient, type KnowledgeVersion } from "@prisma/client";
import { KnowledgeService } from "../modules/knowledge/knowledge.service";
import { DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG } from "../modules/knowledge/knowledge.tokens";

export const LOCAL_PREVIEW_KNOWLEDGE_STABLE_KEY =
  "local-preview-public-benefits";
export const LOCAL_PREVIEW_KNOWLEDGE_TITLE = "Beneficios de ASODEF";
export const LOCAL_PREVIEW_KNOWLEDGE_QUERY =
  "¿Qué información de beneficios publica ASODEF en este entorno de revisión?";

const LOCAL_PREVIEW_KNOWLEDGE_CONTENT = [
  "Información de beneficios que publica ASODEF en este entorno de revisión.",
  "En este entorno de revisión, ASODEF publica información de beneficios institucionales únicamente para demostrar el flujo gobernado de Knowledge.",
  "Este contenido es sintético, no describe beneficios comerciales reales y es exclusivo de Local Preview.",
].join("\n\n");
const LOCAL_PREVIEW_SOURCE_REFERENCE =
  "local-preview://knowledge/beneficios";

export interface LocalPreviewKnowledgeResult {
  created: boolean;
  knowledgeItemCount: number;
  publishedFixtureCount: number;
}

export function assertLocalPreviewKnowledgeEnvironment(
  environment: NodeJS.ProcessEnv,
): URL {
  if (environment.LOCAL_PREVIEW !== "true") {
    throw new Error("Local Preview Knowledge requires LOCAL_PREVIEW=true.");
  }
  if (environment.NODE_ENV === "production") {
    throw new Error("Local Preview Knowledge is forbidden in production.");
  }
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const target = new URL(databaseUrl);
  if (
    target.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    !target.pathname.startsWith("/asodef_preview_")
  ) {
    throw new Error(
      "Local Preview Knowledge requires an isolated local asodef_preview_ database.",
    );
  }
  return target;
}

export async function prepareLocalPreviewKnowledge(
  environment: NodeJS.ProcessEnv,
): Promise<LocalPreviewKnowledgeResult> {
  const target = assertLocalPreviewKnowledgeEnvironment(environment);
  const actorEmail = environment.ADMIN_ACCOUNT_EMAIL?.trim();
  if (!actorEmail) throw new Error("ADMIN_ACCOUNT_EMAIL is required.");
  const prisma = new PrismaClient({ datasourceUrl: target.toString() });
  try {
    const actor = await prisma.user.findUniqueOrThrow({
      where: { email: actorEmail },
      select: { id: true },
    });
    return ensureLocalPreviewKnowledgeFixture(prisma, actor.id);
  } finally {
    await prisma.$disconnect();
  }
}

/** Harness-only setup that drives the canonical Knowledge lifecycle. It is
 * invoked by Local Preview preparation and never imported by product runtime. */
export async function ensureLocalPreviewKnowledgeFixture(
  prisma: PrismaClient,
  actorUserId: string,
): Promise<LocalPreviewKnowledgeResult> {
  const service = new KnowledgeService(
    prisma as unknown as ConstructorParameters<typeof KnowledgeService>[0],
    [],
    DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG,
  );
  const context = {
    actorUserId,
    correlationId: `local-preview:${LOCAL_PREVIEW_KNOWLEDGE_STABLE_KEY}`,
    requestId: `local-preview:${LOCAL_PREVIEW_KNOWLEDGE_STABLE_KEY}`,
  };
  const existing = await prisma.knowledgeItem.findUnique({
    where: {
      tenantKey_stableKey: {
        tenantKey: "ASODEF",
        stableKey: LOCAL_PREVIEW_KNOWLEDGE_STABLE_KEY,
      },
    },
    include: {
      versions: {
        orderBy: { version: "asc" },
        include: {
          source: true,
          chunks: { orderBy: { ordinal: "asc" } },
          publicationSnapshot: true,
        },
      },
    },
  });

  let created = false;
  let version: KnowledgeVersion;
  if (!existing) {
    version = await service.createManualDraft(
      {
        stableKey: LOCAL_PREVIEW_KNOWLEDGE_STABLE_KEY,
        title: LOCAL_PREVIEW_KNOWLEDGE_TITLE,
        domain: "BENEFICIOS_Y_CONVENIOS",
        audience: "PUBLIC",
        classification: "PUBLIC",
        language: "es",
        sourceReference: LOCAL_PREVIEW_SOURCE_REFERENCE,
        sourceOwner: "ASODEF",
        changeReason: "Fixture sintético exclusivo de Local Preview",
        content: LOCAL_PREVIEW_KNOWLEDGE_CONTENT,
      },
      context,
    );
    created = true;
  } else {
    if (existing.versions.length !== 1) {
      throw new Error("Local Preview Knowledge fixture has unexpected versions.");
    }
    const current = existing.versions[0]!;
    assertFixtureParity(current);
    version = current;
  }

  if (version.status === "DRAFT") {
    version = await service.submitReview(
      version.id,
      command(version.revision, "Enviar fixture Local Preview a revisión"),
      context,
    );
  }
  if (version.status === "REVIEW") {
    version = await service.approve(
      version.id,
      command(version.revision, "Aprobar fixture sintético Local Preview"),
      context,
    );
  }
  if (version.status === "APPROVED") {
    version = await service.publish(
      version.id,
      command(version.revision, "Publicar fixture sintético Local Preview"),
      context,
    );
  }
  if (version.status !== "PUBLISHED") {
    throw new Error(
      `Local Preview Knowledge fixture is not publishable: ${version.status}.`,
    );
  }

  const [knowledgeItemCount, publishedFixtureCount] = await Promise.all([
    prisma.knowledgeItem.count({
      where: {
        tenantKey: "ASODEF",
        stableKey: LOCAL_PREVIEW_KNOWLEDGE_STABLE_KEY,
      },
    }),
    prisma.knowledgeVersion.count({
      where: {
        status: "PUBLISHED",
        knowledgeItem: {
          tenantKey: "ASODEF",
          stableKey: LOCAL_PREVIEW_KNOWLEDGE_STABLE_KEY,
        },
      },
    }),
  ]);
  if (knowledgeItemCount !== 1 || publishedFixtureCount !== 1) {
    throw new Error("Local Preview Knowledge fixture is not idempotent.");
  }
  return { created, knowledgeItemCount, publishedFixtureCount };
}

function command(expectedRevision: number, changeReason: string) {
  return { expectedRevision, changeReason };
}

function assertFixtureParity(
  version: KnowledgeVersion & {
    source: { sourceReference: string; sourceOwner: string } | null;
    chunks: readonly unknown[];
    publicationSnapshot: unknown | null;
  },
): void {
  if (
    version.version !== 1 ||
    version.title !== LOCAL_PREVIEW_KNOWLEDGE_TITLE ||
    version.domain !== "BENEFICIOS_Y_CONVENIOS" ||
    version.audience !== "PUBLIC" ||
    version.classification !== "PUBLIC" ||
    version.language !== "es" ||
    version.content !== LOCAL_PREVIEW_KNOWLEDGE_CONTENT ||
    version.source?.sourceReference !== LOCAL_PREVIEW_SOURCE_REFERENCE ||
    version.source.sourceOwner !== "ASODEF" ||
    version.chunks.length < 1 ||
    (version.status === "PUBLISHED" && !version.publicationSnapshot)
  ) {
    throw new Error("Local Preview Knowledge fixture does not match its canonical contract.");
  }
}
