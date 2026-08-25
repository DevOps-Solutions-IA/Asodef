import { createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  AuditEventResult,
  KnowledgeAudience,
  KnowledgeDataClassification,
  KnowledgeLifecycleStatus,
  KnowledgeSourceType,
  Prisma,
  type KnowledgeDomain,
} from "@prisma/client";
import type {
  DataClassification,
  GatewayRequestContext,
  KnowledgeGateway,
  KnowledgeGatewayErrorCode,
  KnowledgeGatewayRequest,
  KnowledgeGatewayResult,
  KnowledgeGroundingOutcome,
  KnowledgeItemContract,
  KnowledgePublicationSnapshotContract,
  KnowledgeVersionContract,
} from "@asodef/connect-contracts";
import { PrismaService } from "../../database/prisma.service";
import { KnowledgePublicationPolicy } from "../ai-gateway/knowledge-contracts";
import type {
  CreateFileKnowledgeDto,
  CreateManualKnowledgeDto,
  KnowledgeDraftMetadataDto,
  KnowledgeLifecycleCommandDto,
  KnowledgePreviewDto,
  ListKnowledgeItemsQueryDto,
  OfficialWebImportDto,
} from "./knowledge.dto";
import {
  resolveKnowledgeAccessScope,
  type ResolvedKnowledgeAccessScope,
} from "./knowledge-access-scope";
import {
  groundKnowledge,
  type KnowledgeGroundingResult,
} from "./knowledge-grounding";
import {
  validateKnowledgeFile,
  validateManualKnowledge,
  type ValidatedKnowledgeFile,
} from "./knowledge-ingestion-policy";
import {
  chunkKnowledgeContent,
  parseKnowledgeContent,
  parseValidatedKnowledgeFile,
  type ParsedKnowledgeDocument,
} from "./knowledge-parser";
import {
  retrievePublishedKnowledge,
  qualifyGroundingEvidence,
  type KnowledgeClaim,
  type RankedKnowledgeEvidence,
  type ScoredKnowledgeCandidate,
} from "./knowledge-retrieval";
import {
  validateKnowledgeWebImportRequest,
  KNOWLEDGE_WEB_IMPORT_STATUS,
} from "./knowledge-web-import-policy";
import {
  KNOWLEDGE_BINARY_PARSERS,
  KNOWLEDGE_RETRIEVAL_CONFIG,
  type KnowledgeBinaryParsers,
  type KnowledgeRuntimeRetrievalConfig,
} from "./knowledge.tokens";

export interface KnowledgeMutationContext {
  actorUserId: string;
  correlationId?: string;
  requestId?: string;
}

const CLASSIFICATIONS: readonly DataClassification[] = [
  "PUBLIC",
  "INTERNAL",
  "PERSONAL",
  "SENSITIVE",
  "HIGHLY_SENSITIVE",
];

@Injectable()
export class KnowledgeService implements KnowledgeGateway {
  private readonly publicationPolicy = new KnowledgePublicationPolicy();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(KNOWLEDGE_BINARY_PARSERS)
    private readonly binaryParsers: KnowledgeBinaryParsers,
    @Inject(KNOWLEDGE_RETRIEVAL_CONFIG)
    private readonly retrievalConfig: KnowledgeRuntimeRetrievalConfig,
  ) {}

  async listItems(query: ListKnowledgeItemsQueryDto) {
    const where: Prisma.KnowledgeItemWhereInput = {
      tenantKey: "ASODEF",
      ...(query.search
        ? {
            OR: [
              {
                stableKey: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
              {
                versions: {
                  some: {
                    title: {
                      contains: query.search,
                      mode: "insensitive" as const,
                    },
                  },
                },
              },
            ],
          }
        : {}),
      ...(query.domain || query.audience || query.classification
        ? {
            versions: {
              some: {
                ...(query.domain
                  ? { domain: query.domain as KnowledgeDomain }
                  : {}),
                ...(query.audience
                  ? { audience: query.audience as KnowledgeAudience }
                  : {}),
                ...(query.classification
                  ? {
                      classification:
                        query.classification as KnowledgeDataClassification,
                    }
                  : {}),
              },
            },
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.knowledgeItem.count({ where }),
      this.prisma.knowledgeItem.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          versions: {
            orderBy: { version: "desc" },
            include: { source: true, publicationSnapshot: true },
          },
        },
      }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        versions: item.versions.map(stripKnowledgeContent),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getItem(id: string) {
    const item = await this.prisma.knowledgeItem.findFirst({
      where: { id, tenantKey: "ASODEF" },
      include: {
        versions: {
          orderBy: { version: "desc" },
          include: {
            source: true,
            chunks: { orderBy: { ordinal: "asc" } },
            publicationSnapshot: true,
            auditEvents: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException("KnowledgeItem no encontrado.");
    return {
      ...item,
      versions: item.versions.map(stripKnowledgeContent),
    };
  }

  async getVersionDiff(id: string, context: KnowledgeMutationContext) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.knowledgeVersion.findFirst({
        where: { id, knowledgeItem: { tenantKey: "ASODEF" } },
        include: { source: true },
      });
      if (!current)
        throw new NotFoundException("Versión de conocimiento no encontrada.");
      const previous = await tx.knowledgeVersion.findFirst({
        where: {
          knowledgeItemId: current.knowledgeItemId,
          knowledgeItem: { tenantKey: "ASODEF" },
          version: { lt: current.version },
        },
        orderBy: { version: "desc" },
        include: { source: true },
      });
      await this.recordAudit(
        tx,
        current.id,
        current.knowledgeItemId,
        context,
        "knowledge.version.diff_viewed",
        current.status,
        current.status,
        "Consulta de diff administrativo gobernado",
        current.revision,
        current.revision,
        { previousVersionId: previous?.id ?? null },
      );
      return {
        knowledgeItemId: current.knowledgeItemId,
        current: {
          id: current.id,
          version: current.version,
          title: current.title,
          content: current.content,
          sourceChecksum: current.source?.sourceChecksum ?? null,
        },
        previous: previous
          ? {
              id: previous.id,
              version: previous.version,
              title: previous.title,
              content: previous.content,
              sourceChecksum: previous.source?.sourceChecksum ?? null,
            }
          : null,
      };
    });
  }

  async createManualDraft(
    dto: CreateManualKnowledgeDto,
    context: KnowledgeMutationContext,
  ) {
    const validated = validateManualKnowledge({
      kind: "MANUAL",
      language: dto.language,
      content: dto.content,
    });
    const content = parseKnowledgeContent(validated.content, "MARKDOWN");
    return this.createDraft(
      dto,
      {
        content,
        parser: "asodef-markdown",
        parserVersion: "v1",
        chunks: chunkKnowledgeContent(content),
      },
      {
        type: KnowledgeSourceType.MANUAL_AUTHORING,
        checksum: validated.checksumSha256,
      },
      context,
    );
  }

  async createFileDraft(
    dto: CreateFileKnowledgeDto,
    file: { originalname: string; mimetype: string; buffer: Buffer },
    context: KnowledgeMutationContext,
  ) {
    const validated = validateKnowledgeFile({
      kind: "FILE",
      language: dto.language,
      originalName: file.originalname,
      mimeType: file.mimetype,
      bytes: file.buffer,
    });
    const parsed = await parseValidatedKnowledgeFile(
      validated,
      this.binaryParsers,
    );
    return this.createDraft(
      dto,
      parsed,
      {
        type: KnowledgeSourceType.FILE_UPLOAD,
        checksum: validated.checksumSha256,
        file: validated,
      },
      context,
    );
  }

  registerOfficialWebImport(dto: OfficialWebImportDto): never {
    validateKnowledgeWebImportRequest({ url: dto.url, language: dto.language });
    throw new ServiceUnavailableException(KNOWLEDGE_WEB_IMPORT_STATUS);
  }

  submitReview(
    id: string,
    command: KnowledgeLifecycleCommandDto,
    context: KnowledgeMutationContext,
  ) {
    return this.transition(
      id,
      command,
      context,
      [KnowledgeLifecycleStatus.DRAFT],
      KnowledgeLifecycleStatus.REVIEW,
    );
  }

  returnToDraft(
    id: string,
    command: KnowledgeLifecycleCommandDto,
    context: KnowledgeMutationContext,
  ) {
    return this.transition(
      id,
      command,
      context,
      [KnowledgeLifecycleStatus.REVIEW],
      KnowledgeLifecycleStatus.DRAFT,
    );
  }

  approve(
    id: string,
    command: KnowledgeLifecycleCommandDto,
    context: KnowledgeMutationContext,
  ) {
    return this.transition(
      id,
      command,
      context,
      [KnowledgeLifecycleStatus.REVIEW],
      KnowledgeLifecycleStatus.APPROVED,
    );
  }

  retire(
    id: string,
    command: KnowledgeLifecycleCommandDto,
    context: KnowledgeMutationContext,
  ) {
    return this.transition(
      id,
      command,
      context,
      [KnowledgeLifecycleStatus.APPROVED, KnowledgeLifecycleStatus.PUBLISHED],
      KnowledgeLifecycleStatus.RETIRED,
    );
  }

  async publish(
    id: string,
    command: KnowledgeLifecycleCommandDto,
    context: KnowledgeMutationContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.knowledgeVersion.findUnique({
        where: { id },
        include: {
          knowledgeItem: true,
          source: true,
          chunks: { orderBy: { ordinal: "asc" } },
        },
      });
      if (!version || !version.source)
        throw new NotFoundException("Versión de conocimiento no encontrada.");
      if (version.status !== KnowledgeLifecycleStatus.APPROVED) {
        throw new ConflictException(
          "Solo una versión aprobada puede publicarse.",
        );
      }
      if (version.revision !== command.expectedRevision) throw concurrent();

      await tx.$queryRaw`SELECT id FROM knowledge_items WHERE id = ${version.knowledgeItemId}::uuid FOR UPDATE`;
      const now = new Date();
      const previouslyPublished = await tx.knowledgeVersion.findMany({
        where: {
          knowledgeItemId: version.knowledgeItemId,
          status: KnowledgeLifecycleStatus.PUBLISHED,
          id: { not: version.id },
        },
      });
      for (const previous of previouslyPublished) {
        await tx.knowledgeVersion.update({
          where: { id: previous.id },
          data: {
            status: KnowledgeLifecycleStatus.RETIRED,
            retiredAt: now,
            revision: { increment: 1 },
            changeReason: `Reemplazada por KnowledgeVersion ${version.id}`,
          },
        });
        await this.recordAudit(
          tx,
          previous.id,
          previous.knowledgeItemId,
          context,
          "knowledge.version.retired_by_replacement",
          previous.status,
          KnowledgeLifecycleStatus.RETIRED,
          command.changeReason,
          previous.revision,
          previous.revision + 1,
        );
      }

      const updated = await tx.knowledgeVersion.updateMany({
        where: {
          id,
          revision: command.expectedRevision,
          status: KnowledgeLifecycleStatus.APPROVED,
        },
        data: {
          status: KnowledgeLifecycleStatus.PUBLISHED,
          publishedById: context.actorUserId,
          publishedAt: now,
          changeReason: command.changeReason,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw concurrent();

      const chunkSetChecksum = digest(
        version.chunks.map((chunk) => chunk.checksumSha256).join(":"),
      );
      const snapshot = await tx.knowledgePublicationSnapshot.create({
        data: {
          knowledgeVersionId: version.id,
          knowledgeItemId: version.knowledgeItemId,
          sourceId: version.source.id,
          domain: version.domain,
          audience: version.audience,
          classification: version.classification,
          language: version.language,
          sourceReference: version.source.sourceReference,
          sourceChecksum: version.source.sourceChecksum,
          chunkSetChecksum,
          publishedById: context.actorUserId,
          publishedAt: now,
          effectiveFrom: version.effectiveFrom,
          effectiveUntil: version.effectiveUntil,
        },
      });
      await this.recordAudit(
        tx,
        version.id,
        version.knowledgeItemId,
        context,
        "knowledge.version.published",
        version.status,
        KnowledgeLifecycleStatus.PUBLISHED,
        command.changeReason,
        version.revision,
        version.revision + 1,
        { snapshotId: snapshot.id, chunkSetChecksum },
      );
      return tx.knowledgeVersion.findUniqueOrThrow({
        where: { id },
        include: {
          source: true,
          chunks: { orderBy: { ordinal: "asc" } },
          publicationSnapshot: true,
        },
      });
    });
  }

  async preview(
    id: string,
    dto: KnowledgePreviewDto,
    context: KnowledgeMutationContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.knowledgeVersion.findUnique({
        where: { id },
        include: { source: true, chunks: { orderBy: { ordinal: "asc" } } },
      });
      if (!version || !version.source)
        throw new NotFoundException("Versión de conocimiento no encontrada.");
      if (version.status === KnowledgeLifecycleStatus.RETIRED)
        throw new ConflictException(
          "Una versión retirada no puede previsualizarse.",
        );
      const tokens = queryTokens(dto.query);
      const chunks = version.chunks
        .map((chunk) => ({ chunk, score: keywordScore(tokens, chunk.content) }))
        .filter(({ score }) => score > 0)
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.chunk.ordinal - right.chunk.ordinal,
        )
        .slice(0, dto.limit);
      const outcome: KnowledgeGroundingOutcome =
        chunks.length === 0 ? "NO_EVIDENCE" : "PARTIAL_EVIDENCE";
      await this.recordAudit(
        tx,
        version.id,
        version.knowledgeItemId,
        context,
        "knowledge.version.previewed",
        version.status,
        version.status,
        "Vista previa administrativa aislada",
        version.revision,
        version.revision,
        {
          queryDigest: digest(dto.query),
          citationCount: chunks.length,
          outcome,
        },
      );
      return {
        preview: true,
        statusUnchanged: version.status,
        outcome,
        citations: chunks.map(({ chunk, score }) => ({
          knowledgeItemId: version.knowledgeItemId,
          knowledgeVersionId: version.id,
          knowledgeChunkId: chunk.id,
          knowledgeSourceId: version.source!.id,
          title: version.title,
          excerpt: chunk.content,
          score,
        })),
      };
    });
  }

  async search(
    request: KnowledgeGatewayRequest,
    context: GatewayRequestContext,
  ): Promise<KnowledgeGatewayResult> {
    const scope = this.resolveGatewayScope(context);
    if (!scope.ok)
      return this.rejectSearch(
        request,
        context,
        "TENANT_SCOPE_UNRESOLVED",
        scope.error.code,
      );
    if (!context.identity.permissions.includes("knowledge.read"))
      return this.rejectSearch(
        request,
        context,
        "AUTHORIZATION_DENIED",
        "KNOWLEDGE_READ_DENIED",
        scope.scope,
      );
    if (Date.parse(context.deadlineAt) <= Date.now())
      return this.rejectSearch(
        request,
        context,
        "TIMEOUT",
        "KNOWLEDGE_DEADLINE_EXCEEDED",
        scope.scope,
      );
    if (
      !request.query.trim() ||
      request.limit < 1 ||
      request.limit > 50 ||
      request.domainKeys.length < 1
    )
      return this.rejectSearch(
        request,
        context,
        "INVALID_REQUEST",
        "INVALID_KNOWLEDGE_REQUEST",
        scope.scope,
      );
    const tokens = queryTokens(request.query);
    if (tokens.length === 0)
      return this.rejectSearch(
        request,
        context,
        "INVALID_REQUEST",
        "KNOWLEDGE_QUERY_TERMS_REQUIRED",
        scope.scope,
      );

    const now = new Date();
    const allowedAudiences = audiencesFor(scope.scope.audience);
    const allowedClassifications = classificationsFor(
      scope.scope.dataClassification,
    );
    const snapshots = await this.prisma.knowledgePublicationSnapshot.findMany({
      where: {
        domain: { in: request.domainKeys as KnowledgeDomain[] },
        audience: { in: allowedAudiences },
        classification: { in: allowedClassifications },
        language: "es",
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
          { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
        ],
        knowledgeItem: { tenantKey: scope.scope.tenant },
        knowledgeVersion: { status: KnowledgeLifecycleStatus.PUBLISHED },
      },
      include: {
        source: true,
        knowledgeItem: true,
        knowledgeVersion: {
          include: {
            chunks: {
              where: {
                OR: tokens.map((token) => ({
                  content: { contains: token, mode: "insensitive" },
                })),
              },
              orderBy: { ordinal: "asc" },
              take: this.retrievalConfig.candidateLimit,
            },
          },
        },
      },
      take: this.retrievalConfig.candidateLimit,
      orderBy: { publishedAt: "desc" },
    });

    const readableSnapshots = snapshots.filter((snapshot) => {
      const item: KnowledgeItemContract = {
        version: "v1",
        id: snapshot.knowledgeItem.id,
        stableKey: snapshot.knowledgeItem.stableKey,
        tenantKey: "ASODEF",
        revision: snapshot.knowledgeItem.revision,
      };
      const version: KnowledgeVersionContract = {
        id: snapshot.knowledgeVersion.id,
        status: snapshot.knowledgeVersion.status,
        createdAt: snapshot.knowledgeVersion.createdAt.toISOString(),
        createdBy: snapshot.knowledgeVersion.createdById,
        version: snapshot.knowledgeVersion.version,
        knowledgeItemId: snapshot.knowledgeVersion.knowledgeItemId,
        title: snapshot.knowledgeVersion.title,
        domain: snapshot.knowledgeVersion.domain,
        audience: snapshot.knowledgeVersion.audience,
        dataClassification: snapshot.knowledgeVersion.classification,
        language: "es",
        ...(snapshot.knowledgeVersion.effectiveFrom
          ? {
              effectiveFrom:
                snapshot.knowledgeVersion.effectiveFrom.toISOString(),
            }
          : {}),
        ...(snapshot.knowledgeVersion.effectiveUntil
          ? {
              effectiveUntil:
                snapshot.knowledgeVersion.effectiveUntil.toISOString(),
            }
          : {}),
        ...(snapshot.knowledgeVersion.requiresRevalidationAt
          ? {
              requiresRevalidationAt:
                snapshot.knowledgeVersion.requiresRevalidationAt.toISOString(),
            }
          : {}),
        revision: snapshot.knowledgeVersion.revision,
        changeReason: snapshot.knowledgeVersion.changeReason,
      };
      const publication: KnowledgePublicationSnapshotContract = {
        version: "v1",
        id: snapshot.id,
        knowledgeItemId: snapshot.knowledgeItemId,
        knowledgeVersionId: snapshot.knowledgeVersionId,
        knowledgeSourceId: snapshot.sourceId,
        sourceReference: snapshot.sourceReference,
        sourceChecksumSha256: snapshot.sourceChecksum,
        chunkSetChecksumSha256: snapshot.chunkSetChecksum,
        audience: snapshot.audience,
        dataClassification: snapshot.classification,
        ...(snapshot.effectiveFrom
          ? { effectiveFrom: snapshot.effectiveFrom.toISOString() }
          : {}),
        ...(snapshot.effectiveUntil
          ? { effectiveUntil: snapshot.effectiveUntil.toISOString() }
          : {}),
        publishedBy: snapshot.publishedById,
        publishedAt: snapshot.publishedAt.toISOString(),
      };
      try {
        this.publicationPolicy.assertKoralReadable(
          item,
          version,
          publication,
          context,
          now,
        );
        return true;
      } catch {
        return false;
      }
    });

    const keywordCandidates: ScoredKnowledgeCandidate[] =
      readableSnapshots.flatMap((snapshot) =>
        snapshot.knowledgeVersion.chunks.map((chunk) => ({
          score: keywordScore(tokens, chunk.content),
          candidate: {
            trace: {
              itemId: snapshot.knowledgeItemId,
              versionId: snapshot.knowledgeVersionId,
              chunkId: chunk.id,
              sourceId: snapshot.sourceId,
            },
            tenantId: snapshot.knowledgeItem.tenantKey,
            audiences: candidateAudiences(snapshot.audience),
            dataClassification: snapshot.classification as DataClassification,
            publicationStatus: "PUBLISHED" as const,
            effectiveFrom: snapshot.effectiveFrom?.toISOString(),
            effectiveTo: snapshot.effectiveUntil?.toISOString(),
            language: snapshot.language,
            content: chunk.content,
            claims: parseClaims(chunk.metadata),
          },
        })),
      );
    const ranked = retrievePublishedKnowledge(
      {
        query: request.query,
        serverScope: {
          tenantId: scope.scope.tenant,
          audience: scope.scope.audience,
          maximumDataClassification: scope.scope.dataClassification,
          language: "es",
          effectiveAt: now.toISOString(),
        },
        keywordCandidates,
        semanticCandidates: [],
      },
      { ...this.retrievalConfig, limit: request.limit },
    );
    const relevance = qualifyGroundingEvidence(ranked.evidence);
    const grounding = groundRuntimeEvidence(
      relevance.evidence,
      this.retrievalConfig.sufficientEvidenceScore,
    );
    const snapshotByVersion = new Map(
      readableSnapshots.map((snapshot) => [
        snapshot.knowledgeVersionId,
        snapshot,
      ]),
    );
    const citations = grounding.evidence.map((evidence) => {
      const snapshot = snapshotByVersion.get(evidence.trace.versionId)!;
      return {
        publicationId: snapshot.id,
        knowledgeItemId: evidence.trace.itemId,
        knowledgeVersionId: evidence.trace.versionId,
        knowledgeChunkId: evidence.trace.chunkId,
        knowledgeSourceId: evidence.trace.sourceId,
        title: snapshot.knowledgeVersion.title,
        excerpt: evidence.content,
        dataClassification: evidence.dataClassification,
        audience: snapshot.audience,
        language: "es" as const,
        sourceReference: snapshot.sourceReference,
        sourceChecksumSha256: snapshot.sourceChecksum,
        score: evidence.fusedScore,
      };
    });
    const outcome = grounding.outcome;
    await this.recordRetrieval(
      context,
      scope.scope,
      request.query,
      outcome,
      citations.length,
      relevanceAuditReason(relevance),
    );
    return {
      ok: true,
      response: {
        version: "v1",
        outcome,
        citations,
        correlationId: context.audit.correlationId,
      },
    };
  }

  private async createDraft(
    dto: KnowledgeDraftMetadataDto,
    parsed: ParsedKnowledgeDocument,
    source: {
      type: KnowledgeSourceType;
      checksum: string;
      file?: ValidatedKnowledgeFile;
    },
    context: KnowledgeMutationContext,
  ) {
    validateDraftSemantics(dto);
    return this.prisma.$transaction(async (tx) => {
      let item;
      if (dto.knowledgeItemId) {
        if (dto.expectedItemRevision === undefined) throw concurrent();
        item = await tx.knowledgeItem.findUnique({
          where: { id: dto.knowledgeItemId },
        });
        if (!item || item.tenantKey !== "ASODEF")
          throw new NotFoundException("KnowledgeItem no encontrado.");
        const changed = await tx.knowledgeItem.updateMany({
          where: { id: item.id, revision: dto.expectedItemRevision },
          data: { revision: { increment: 1 } },
        });
        if (changed.count !== 1) throw concurrent();
      } else {
        if (!dto.stableKey)
          throw new ConflictException(
            "stableKey es obligatorio para un KnowledgeItem nuevo.",
          );
        item = await tx.knowledgeItem.create({
          data: {
            tenantKey: "ASODEF",
            stableKey: dto.stableKey,
            createdById: context.actorUserId,
          },
        });
      }
      const latest = await tx.knowledgeVersion.findFirst({
        where: { knowledgeItemId: item.id },
        orderBy: { version: "desc" },
      });
      const created = await tx.knowledgeVersion.create({
        data: {
          knowledgeItemId: item.id,
          version: (latest?.version ?? 0) + 1,
          title: dto.title.trim(),
          domain: dto.domain as KnowledgeDomain,
          audience: dto.audience as KnowledgeAudience,
          classification: dto.classification as KnowledgeDataClassification,
          language: "es",
          content: parsed.content,
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
          effectiveUntil: dto.effectiveUntil
            ? new Date(dto.effectiveUntil)
            : null,
          requiresRevalidationAt: dto.requiresRevalidationAt
            ? new Date(dto.requiresRevalidationAt)
            : null,
          changeReason: dto.changeReason,
          createdById: context.actorUserId,
          source: {
            create: {
              sourceType: source.type,
              sourceReference: dto.sourceReference,
              sourceOwner: dto.sourceOwner,
              sourceChecksum: source.checksum,
              originalFileName: source.file?.originalName,
              mimeType: source.file?.mimeType,
            },
          },
          chunks: {
            create: parsed.chunks.map((chunk) => ({
              ...chunk,
              checksumSha256: digest(chunk.content),
              metadata: {
                ...chunk.metadata,
                parser: parsed.parser,
                parserVersion: parsed.parserVersion,
              },
            })),
          },
        },
        include: { source: true, chunks: { orderBy: { ordinal: "asc" } } },
      });
      await this.recordAudit(
        tx,
        created.id,
        created.knowledgeItemId,
        context,
        "knowledge.version.created",
        null,
        KnowledgeLifecycleStatus.DRAFT,
        dto.changeReason,
        null,
        0,
        {
          sourceChecksum: source.checksum,
          chunkCount: created.chunks.length,
          sourceType: source.type,
        },
      );
      return created;
    });
  }

  private async transition(
    id: string,
    command: KnowledgeLifecycleCommandDto,
    context: KnowledgeMutationContext,
    allowedFrom: readonly KnowledgeLifecycleStatus[],
    next: KnowledgeLifecycleStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.knowledgeVersion.findUnique({ where: { id } });
      if (!current)
        throw new NotFoundException("Versión de conocimiento no encontrada.");
      if (!allowedFrom.includes(current.status))
        throw new ConflictException(
          `Transición de conocimiento inválida: ${current.status} -> ${next}`,
        );
      if (current.revision !== command.expectedRevision) throw concurrent();
      const now = new Date();
      const data: Prisma.KnowledgeVersionUpdateManyMutationInput = {
        status: next,
        revision: { increment: 1 },
        changeReason: command.changeReason,
      };
      if (next === KnowledgeLifecycleStatus.REVIEW)
        Object.assign(data, {
          reviewedById: context.actorUserId,
          reviewedAt: now,
        });
      if (next === KnowledgeLifecycleStatus.DRAFT)
        Object.assign(data, { reviewedById: null, reviewedAt: null });
      if (next === KnowledgeLifecycleStatus.APPROVED)
        Object.assign(data, {
          approvedById: context.actorUserId,
          approvedAt: now,
        });
      if (next === KnowledgeLifecycleStatus.RETIRED)
        Object.assign(data, { retiredAt: now });
      const updated = await tx.knowledgeVersion.updateMany({
        where: {
          id,
          revision: command.expectedRevision,
          status: current.status,
        },
        data,
      });
      if (updated.count !== 1) throw concurrent();
      await this.recordAudit(
        tx,
        id,
        current.knowledgeItemId,
        context,
        `knowledge.version.${next.toLowerCase()}`,
        current.status,
        next,
        command.changeReason,
        current.revision,
        current.revision + 1,
      );
      return tx.knowledgeVersion.findUniqueOrThrow({
        where: { id },
        include: {
          source: true,
          chunks: { orderBy: { ordinal: "asc" } },
          publicationSnapshot: true,
        },
      });
    });
  }

  private resolveGatewayScope(context: GatewayRequestContext) {
    const effective = context.effectiveScope;
    return resolveKnowledgeAccessScope({
      authority: effective?.authority,
      serverDerivedScope: effective
        ? {
            source: effective.authority,
            tenant: effective.tenantKey,
            audience: effective.audience,
            dataClassification: effective.maximumDataClassification,
            organizationIds: effective.organizationIds,
            affiliateId: effective.affiliateSubjectId,
          }
        : undefined,
    });
  }

  private async rejectSearch(
    request: KnowledgeGatewayRequest,
    context: GatewayRequestContext,
    code: KnowledgeGatewayErrorCode,
    message: string,
    scope?: ResolvedKnowledgeAccessScope,
  ): Promise<KnowledgeGatewayResult> {
    if (scope)
      await this.recordRetrieval(
        context,
        scope,
        request.query,
        "DENIED",
        0,
        code,
      );
    return {
      ok: false,
      error: {
        code,
        message,
        retryable: false,
        correlationId: context.audit.correlationId,
      },
    };
  }

  private recordRetrieval(
    context: GatewayRequestContext,
    scope: ResolvedKnowledgeAccessScope,
    query: string,
    result: string,
    citationCount: number,
    reasonCode?: string,
  ) {
    return this.prisma.knowledgeRetrievalAudit.create({
      data: {
        effectiveActorId: context.identity.effectiveActorId,
        principalType: context.identity.principalType,
        tenantKey: scope.tenant,
        audience: scope.audience as KnowledgeAudience,
        queryDigest: digest(query),
        result,
        reasonCode,
        correlationId: context.audit.correlationId,
        citationCount,
      },
    });
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    knowledgeVersionId: string,
    knowledgeItemId: string,
    context: KnowledgeMutationContext,
    action: string,
    previousStatus: string | null,
    newStatus: string | null,
    reason: string,
    expectedRevision: number | null,
    newRevision: number,
    metadata: Prisma.InputJsonObject = {},
  ) {
    return tx.knowledgeAuditEvent.create({
      data: {
        knowledgeVersionId,
        knowledgeItemId,
        actorUserId: context.actorUserId,
        tenantKey: "ASODEF",
        action,
        previousStatus: previousStatus as KnowledgeLifecycleStatus | null,
        nextStatus: newStatus as KnowledgeLifecycleStatus | null,
        result: AuditEventResult.SUCCESS,
        changeReason: reason,
        requestId: context.requestId,
        correlationId: context.correlationId,
        sanitizedMetadata: { ...metadata, expectedRevision, newRevision },
      },
    });
  }
}

function stripKnowledgeContent<T extends { content: string; chunks?: unknown }>(
  version: T,
): Omit<T, "content" | "chunks"> {
  const metadata = { ...version } as Partial<T>;
  delete metadata.content;
  delete metadata.chunks;
  return metadata as Omit<T, "content" | "chunks">;
}

function validateDraftSemantics(dto: KnowledgeDraftMetadataDto): void {
  if (
    dto.language.trim().toLowerCase() !== "es" &&
    !/^es-[a-z]{2}$/u.test(dto.language.trim().toLowerCase())
  )
    throw new ConflictException("LANGUAGE_UNSUPPORTED");
  if (
    dto.classification === "HIGHLY_SENSITIVE" &&
    dto.audience !== "ADMIN_ONLY"
  )
    throw new ForbiddenException(
      "HIGHLY_SENSITIVE requiere audiencia ADMIN_ONLY.",
    );
  if (
    dto.effectiveFrom &&
    dto.effectiveUntil &&
    Date.parse(dto.effectiveUntil) <= Date.parse(dto.effectiveFrom)
  )
    throw new ConflictException("La vigencia del conocimiento no es válida.");
}

function audiencesFor(audience: string): KnowledgeAudience[] {
  if (audience === "PUBLIC") return [KnowledgeAudience.PUBLIC];
  if (audience === "AUTHENTICATED_AFFILIATE")
    return [
      KnowledgeAudience.PUBLIC,
      KnowledgeAudience.AUTHENTICATED_AFFILIATE,
    ];
  if (audience === "INTERNAL")
    return [KnowledgeAudience.PUBLIC, KnowledgeAudience.INTERNAL];
  return [
    KnowledgeAudience.PUBLIC,
    KnowledgeAudience.AUTHENTICATED_AFFILIATE,
    KnowledgeAudience.INTERNAL,
    KnowledgeAudience.ADMIN_ONLY,
  ];
}

function candidateAudiences(audience: KnowledgeAudience): string[] {
  if (audience === KnowledgeAudience.PUBLIC) {
    return ["PUBLIC", "AUTHENTICATED_AFFILIATE", "INTERNAL", "ADMIN_ONLY"];
  }
  if (audience === KnowledgeAudience.AUTHENTICATED_AFFILIATE) {
    return ["AUTHENTICATED_AFFILIATE", "ADMIN_ONLY"];
  }
  if (audience === KnowledgeAudience.INTERNAL) {
    return ["INTERNAL", "ADMIN_ONLY"];
  }
  return ["ADMIN_ONLY"];
}

function classificationsFor(
  maximum: DataClassification,
): KnowledgeDataClassification[] {
  if (maximum === "HIGHLY_SENSITIVE") maximum = "SENSITIVE";
  return CLASSIFICATIONS.slice(0, CLASSIFICATIONS.indexOf(maximum) + 1).map(
    (value) => value as KnowledgeDataClassification,
  );
}

function parseClaims(
  metadata: Prisma.JsonValue,
): readonly KnowledgeClaim[] | undefined {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object")
    return undefined;
  const claims = (metadata as Record<string, unknown>).claims;
  if (!Array.isArray(claims)) return undefined;
  const valid = claims.filter(
    (claim): claim is KnowledgeClaim =>
      !!claim &&
      typeof claim === "object" &&
      typeof (claim as KnowledgeClaim).key === "string" &&
      typeof (claim as KnowledgeClaim).value === "string",
  );
  return valid.length ? valid : undefined;
}

function groundRuntimeEvidence(
  evidence: readonly RankedKnowledgeEvidence[],
  sufficientEvidenceScore: number,
): KnowledgeGroundingResult {
  if (evidence.length === 0) {
    return {
      outcome: "NO_EVIDENCE",
      evidence: [],
      coverage: [],
      conflicts: [],
      responseDirective: "DO_NOT_ANSWER_WITHOUT_EVIDENCE",
    };
  }
  const claimKeys = [
    ...new Set(
      evidence.flatMap((item) =>
        (item.claims ?? []).map((claim) => claim.key.trim().toLowerCase()),
      ),
    ),
  ].filter(Boolean);
  if (claimKeys.length > 0) {
    return groundKnowledge(
      { requiredClaimKeys: claimKeys, evidence },
      { minimumEvidencePerClaim: 1 },
    );
  }
  const sufficient = evidence[0]!.fusedScore >= sufficientEvidenceScore;
  return {
    outcome: sufficient ? "SUFFICIENT_EVIDENCE" : "PARTIAL_EVIDENCE",
    evidence,
    coverage: [],
    conflicts: [],
    responseDirective: sufficient
      ? "ANSWER_ONLY_FROM_EVIDENCE"
      : "QUALIFY_AND_LIMIT_TO_EVIDENCE",
  };
}

function relevanceAuditReason(selection: {
  candidateCount: number;
  selectedCount: number;
  rejectedCount: number;
}): string {
  const outcome =
    selection.candidateCount === 0
      ? "NO_RETRIEVAL_CANDIDATES"
      : selection.selectedCount === 0
        ? "NO_FULL_QUERY_TERM_COVERAGE"
        : "FULL_QUERY_TERM_COVERAGE";
  return [
    outcome,
    `CANDIDATES_${selection.candidateCount}`,
    `SELECTED_${selection.selectedCount}`,
    `REJECTED_${selection.rejectedCount}`,
  ].join(":");
}

function queryTokens(query: string): string[] {
  return [
    ...new Set(
      query
        .toLocaleLowerCase("es")
        .split(/[^\p{L}\p{N}]+/u)
        .filter(
          (token) =>
            token.length > 1 && !SPANISH_RETRIEVAL_STOP_WORDS.has(token),
        ),
    ),
  ];
}

const SPANISH_RETRIEVAL_STOP_WORDS = new Set([
  "a",
  "al",
  "como",
  "con",
  "cuál",
  "cuáles",
  "de",
  "del",
  "el",
  "en",
  "es",
  "la",
  "las",
  "los",
  "para",
  "por",
  "qué",
  "que",
  "se",
  "sobre",
  "son",
  "un",
  "una",
  "y",
]);

function keywordScore(tokens: readonly string[], content: string): number {
  if (tokens.length === 0) return 0;
  const normalized = content.toLocaleLowerCase("es");
  return (
    tokens.filter((token) => normalized.includes(token)).length / tokens.length
  );
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function concurrent(): ConflictException {
  return new ConflictException("KNOWLEDGE_CONCURRENT_CHANGE");
}
