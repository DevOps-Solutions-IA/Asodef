import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PlanVersionStatus, Prisma } from "@prisma/client";
import type {
  AdminPlan,
  AdminPlanVersion,
  PlanCatalogItem,
  PlanLifecycle,
  PublishedPlanVersion,
} from "@asodef/connect-contracts";
import { PLAN_BILLING_PERIODS } from "@asodef/connect-contracts";
import { PrismaService } from "../../database/prisma.service";
import {
  AdminBusinessIdempotencyService,
  type BusinessTransactionClient,
} from "../../common/idempotency/admin-business-idempotency.service";
import { AuditService, AuditSource } from "../audit/audit.service";
import type { CreatePlanDto } from "./dto/create-plan.dto";
import type { CreatePlanVersionDto } from "./dto/create-plan-version.dto";
import type { UpdatePlanVersionDto } from "./dto/update-plan-version.dto";
import type { PlanVersionContentDto } from "./dto/plan-version-content.dto";

const NOT_FOUND = "No se encontraron resultados.";
const CANONICAL_STATUSES = new Set<string>([
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "RETIRED",
]);

function requireIdempotencyKey(key?: string): string {
  if (!key) throw new BadRequestException("Idempotency-Key es requerida.");
  return key;
}

function catalogItems(
  value: Prisma.JsonValue | null,
): PlanCatalogItem[] | null {
  if (!Array.isArray(value)) return null;
  const records = value as unknown[];
  if (
    !records.every((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item))
        return false;
      const record = item as Record<string, unknown>;
      return (
        typeof record.code === "string" &&
        typeof record.name === "string" &&
        (record.description === undefined ||
          record.description === null ||
          typeof record.description === "string")
      );
    })
  )
    return null;
  return records.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      code: String(record.code),
      name: String(record.name),
      description:
        typeof record.description === "string" ? record.description : null,
    };
  });
}

function validateCatalogItems(
  value: unknown[],
  field: string,
): PlanCatalogItem[] {
  const result = catalogItems(value as Prisma.JsonArray);
  if (
    !result ||
    result.some(
      (item) =>
        !/^[A-Z][A-Z0-9_]{1,63}$/.test(item.code) || item.name.trim() === "",
    )
  ) {
    throw new BadRequestException(
      `${field} debe contener objetos {code, name, description?} con códigos estables.`,
    );
  }
  const codes = result.map((item) => item.code);
  if (new Set(codes).size !== codes.length)
    throw new BadRequestException(`${field} contiene códigos duplicados.`);
  return result;
}

function validateContent(content: PlanVersionContentDto): void {
  validateCatalogItems(content.features, "features");
  validateCatalogItems(content.benefits, "benefits");
  const currency = content.pricing.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    throw new BadRequestException(
      "currency debe ser un código ISO 4217 de tres letras mayúsculas.",
    );
  if (
    !PLAN_BILLING_PERIODS.includes(
      content.billingPeriod as (typeof PLAN_BILLING_PERIODS)[number],
    )
  )
    throw new BadRequestException("billingPeriod no es válido.");
  if (
    content.effectiveFrom &&
    content.effectiveTo &&
    new Date(content.effectiveFrom) >= new Date(content.effectiveTo)
  )
    throw new BadRequestException(
      "effectiveTo debe ser posterior a effectiveFrom.",
    );
}

function contentData(
  content: PlanVersionContentDto,
): Omit<Prisma.PlanVersionUncheckedCreateInput, "planId" | "version"> {
  validateContent(content);
  return {
    internalName: content.internalName,
    publicName: content.name,
    description: content.description,
    coverage: content.coverage,
    features: content.features as Prisma.InputJsonValue,
    benefits: content.benefits as Prisma.InputJsonValue,
    exclusions: content.exclusions as Prisma.InputJsonValue | undefined,
    eligibility: content.eligibility,
    beneficiaryRules: content.beneficiaryRules,
    priceCents: content.pricing.amountMinor,
    currency: content.pricing.currency.toUpperCase(),
    billingPeriod: content.billingPeriod,
    taxes: content.taxes,
    effectiveFrom: content.effectiveFrom
      ? new Date(content.effectiveFrom)
      : undefined,
    effectiveTo: content.effectiveTo
      ? new Date(content.effectiveTo)
      : undefined,
    commercialText: content.commercialText,
    publicVisibility: content.visibility.public,
    koralVisibility: content.visibility.koral,
    crmVisibility: content.visibility.crm,
    contractVisibility: content.visibility.contracts,
    recommended: content.recommended,
    displayOrder: content.displayOrder,
    terms: content.terms,
    cancellationRules: content.cancellationRules,
    renewalRules: content.renewalRules,
    paymentConditions: content.paymentConditions,
  };
}

type VersionWithPlan = Prisma.PlanVersionGetPayload<{
  include: { plan: true };
}>;

function toAdminVersion(version: VersionWithPlan): AdminPlanVersion {
  const canonicalStatus = CANONICAL_STATUSES.has(version.status)
    ? (version.status as PlanLifecycle)
    : "LEGACY_UNMAPPED";
  return {
    planId: version.planId,
    planVersionId: version.id,
    code: version.plan.code ?? "",
    version: version.version,
    internalName: version.internalName,
    name: version.publicName,
    description: version.description,
    features: catalogItems(version.features),
    benefits: catalogItems(version.benefits),
    eligibility: version.eligibility,
    pricing: {
      amountMinor: version.priceCents,
      currency: version.currency,
      billingPeriod: version.billingPeriod,
    },
    commercialText: version.commercialText,
    terms: version.terms,
    recommended: version.recommended,
    displayOrder: version.displayOrder,
    effectiveFrom: version.effectiveFrom?.toISOString() ?? null,
    effectiveTo: version.effectiveTo?.toISOString() ?? null,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    status: canonicalStatus,
    legacyStatus: canonicalStatus === "LEGACY_UNMAPPED" ? version.status : null,
    revision: version.revision,
    visibility: {
      public: version.publicVisibility,
      koral: version.koralVisibility,
      crm: version.crmVisibility,
      contracts: version.contractVisibility,
    },
    reviewedAt: version.reviewedAt?.toISOString() ?? null,
    retiredAt: version.retiredAt?.toISOString() ?? null,
  };
}

function toPublished(version: VersionWithPlan): PublishedPlanVersion {
  const features = catalogItems(version.features);
  const benefits = catalogItems(version.benefits);
  if (
    !version.plan.code ||
    !version.currency ||
    !features ||
    !benefits ||
    !version.publishedAt
  )
    throw new ConflictException(
      "La versión publicada no satisface el contrato canónico.",
    );
  return {
    planId: version.planId,
    planVersionId: version.id,
    code: version.plan.code,
    version: version.version,
    name: version.publicName,
    description: version.description,
    features,
    benefits,
    eligibility: version.eligibility,
    pricing: {
      amountMinor: version.priceCents,
      currency: version.currency,
      billingPeriod:
        version.billingPeriod as PublishedPlanVersion["pricing"]["billingPeriod"],
    },
    commercialText: version.commercialText,
    terms: version.terms,
    recommended: version.recommended,
    displayOrder: version.displayOrder,
    effectiveFrom: version.effectiveFrom?.toISOString() ?? null,
    effectiveTo: version.effectiveTo?.toISOString() ?? null,
    publishedAt: version.publishedAt.toISOString(),
  };
}

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency: AdminBusinessIdempotencyService,
  ) {}

  async listAdmin(): Promise<AdminPlan[]> {
    const plans = await this.prisma.plan.findMany({
      include: {
        versions: { include: { plan: true }, orderBy: { version: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    return plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      currentVersionId: plan.currentVersionId,
      createdAt: plan.createdAt.toISOString(),
      versions: plan.versions.map(toAdminVersion),
    }));
  }

  async getAdmin(id: string): Promise<AdminPlan> {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: {
        versions: { include: { plan: true }, orderBy: { version: "desc" } },
      },
    });
    if (!plan) throw new NotFoundException(NOT_FOUND);
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      currentVersionId: plan.currentVersionId,
      createdAt: plan.createdAt.toISOString(),
      versions: plan.versions.map(toAdminVersion),
    };
  }

  async listPublished(
    audience: "PUBLIC" | "KORAL" | "CRM" | "CONTRACTS",
    code?: string,
  ): Promise<PublishedPlanVersion[]> {
    const now = new Date();
    const visibility =
      audience === "PUBLIC"
        ? { publicVisibility: true }
        : audience === "KORAL"
          ? { koralVisibility: true }
          : audience === "CRM"
            ? { crmVisibility: true }
            : { contractVisibility: true };
    const versions = await this.prisma.planVersion.findMany({
      where: {
        status: PlanVersionStatus.PUBLISHED,
        ...visibility,
        plan: {
          code: code ? code : { not: null },
          currentVersionId: { not: null },
        },
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      include: { plan: true },
      orderBy: [{ displayOrder: "asc" }, { publishedAt: "desc" }],
    });
    return versions
      .filter((version) => version.plan.currentVersionId === version.id)
      .map(toPublished);
  }

  async assertContractSelectable(
    tx: BusinessTransactionClient,
    planVersionId: string,
  ): Promise<void> {
    const now = new Date();
    const version = await tx.planVersion.findUnique({
      where: { id: planVersionId },
    });
    if (
      !version ||
      version.status !== PlanVersionStatus.PUBLISHED ||
      !version.contractVisibility ||
      !version.publishedAt ||
      !version.effectiveFrom ||
      version.effectiveFrom > now ||
      (version.effectiveTo !== null && version.effectiveTo <= now)
    ) {
      throw new ConflictException(
        "El contrato solo puede fijar una PlanVersion publicada, vigente y visible para contratos.",
      );
    }
  }

  async create(
    actorUserId: string,
    key: string | undefined,
    dto: CreatePlanDto,
  ): Promise<AdminPlan> {
    return this.idempotency.execute({
      actorUserId,
      operation: "plans.create",
      key: requireIdempotencyKey(key),
      payload: dto,
      work: async (tx) => {
        const versionData = contentData(dto.version);
        const plan = await tx.plan.create({
          data: {
            code: dto.code,
            name: dto.name,
            versions: {
              create: {
                ...versionData,
                version: 1,
                status: PlanVersionStatus.DRAFT,
              },
            },
          },
          include: { versions: { include: { plan: true } } },
        });
        await this.audit.record(tx as Prisma.TransactionClient, {
          planVersionId: plan.versions[0]!.id,
          actorUserId,
          action: "plan.created",
          previousStatus: null,
          newStatus: PlanVersionStatus.DRAFT,
          applied: true,
          source: AuditSource.MANUAL,
        });
        return {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          currentVersionId: null,
          createdAt: plan.createdAt.toISOString(),
          versions: plan.versions.map(toAdminVersion),
        };
      },
    });
  }

  async createVersion(
    planId: string,
    actorUserId: string,
    key: string | undefined,
    dto: CreatePlanVersionDto,
  ): Promise<AdminPlanVersion> {
    return this.idempotency.execute({
      actorUserId,
      operation: `plans.${planId}.version.create`,
      key: requireIdempotencyKey(key),
      payload: dto,
      work: async (tx) => {
        await this.lockPlan(tx, planId);
        const latest = await tx.planVersion.findFirst({
          where: { planId },
          orderBy: { version: "desc" },
        });
        const created = await tx.planVersion.create({
          data: {
            ...contentData(dto.version),
            planId,
            version: (latest?.version ?? 0) + 1,
            status: PlanVersionStatus.DRAFT,
          },
          include: { plan: true },
        });
        await this.audit.record(tx as Prisma.TransactionClient, {
          planVersionId: created.id,
          actorUserId,
          action: "plan_version.created",
          previousStatus: null,
          newStatus: created.status,
          applied: true,
          source: AuditSource.MANUAL,
        });
        return toAdminVersion(created);
      },
    });
  }

  async updateDraft(
    versionId: string,
    actorUserId: string,
    key: string | undefined,
    dto: UpdatePlanVersionDto,
  ): Promise<AdminPlanVersion> {
    return this.idempotency.execute({
      actorUserId,
      operation: `plans.version.${versionId}.update`,
      key: requireIdempotencyKey(key),
      payload: dto,
      work: async (tx) => {
        const existing = await tx.planVersion.findUnique({
          where: { id: versionId },
        });
        if (!existing) throw new NotFoundException(NOT_FOUND);
        const result = await tx.planVersion.updateMany({
          where: {
            id: versionId,
            status: PlanVersionStatus.DRAFT,
            revision: dto.expectedRevision,
          },
          data: { ...contentData(dto.version), revision: { increment: 1 } },
        });
        if (result.count !== 1)
          throw new ConflictException(
            "La versión no está en borrador o su revisión cambió.",
          );
        const updated = await tx.planVersion.findUniqueOrThrow({
          where: { id: versionId },
          include: { plan: true },
        });
        await this.audit.record(tx as Prisma.TransactionClient, {
          planVersionId: updated.id,
          actorUserId,
          action: "plan_version.updated",
          previousStatus: existing.status,
          newStatus: updated.status,
          applied: true,
          source: AuditSource.MANUAL,
        });
        return toAdminVersion(updated);
      },
    });
  }

  submitReview(
    versionId: string,
    actorUserId: string,
    key: string | undefined,
    expectedRevision: number,
    reason: string,
  ) {
    return this.transition(
      versionId,
      actorUserId,
      key,
      expectedRevision,
      reason,
      PlanVersionStatus.DRAFT,
      PlanVersionStatus.REVIEW,
      "plan_version.submitted_review",
    );
  }

  async publish(
    versionId: string,
    actorUserId: string,
    key: string | undefined,
    expectedRevision: number,
    reason: string,
  ): Promise<AdminPlanVersion> {
    return this.idempotency.execute({
      actorUserId,
      operation: `plans.version.${versionId}.publish`,
      key: requireIdempotencyKey(key),
      payload: { expectedRevision, reason },
      work: async (tx) => {
        const anchor = await tx.planVersion.findUnique({
          where: { id: versionId },
          select: { planId: true },
        });
        if (!anchor) throw new NotFoundException(NOT_FOUND);
        await this.lockPlan(tx, anchor.planId);
        const target = await tx.planVersion.findUniqueOrThrow({
          where: { id: versionId },
          include: { plan: true },
        });
        if (
          target.status !== PlanVersionStatus.REVIEW ||
          target.revision !== expectedRevision
        )
          throw new ConflictException(
            "Solo una revisión vigente puede publicarse.",
          );
        this.assertPublishable(target);
        const plan = await tx.plan.findUniqueOrThrow({
          where: { id: target.planId },
        });
        if (plan.currentVersionId && plan.currentVersionId !== target.id) {
          const priorState = await tx.planVersion.findUniqueOrThrow({
            where: { id: plan.currentVersionId },
            select: { status: true },
          });
          const prior = await tx.planVersion.update({
            where: { id: plan.currentVersionId },
            data: {
              status: PlanVersionStatus.RETIRED,
              retiredAt: new Date(),
              revision: { increment: 1 },
            },
          });
          await this.audit.record(tx as Prisma.TransactionClient, {
            planVersionId: prior.id,
            actorUserId,
            action: "plan_version.superseded",
            previousStatus: priorState.status,
            newStatus: PlanVersionStatus.RETIRED,
            applied: true,
            reason,
            source: AuditSource.MANUAL,
          });
        }
        const published = await tx.planVersion.update({
          where: { id: target.id },
          data: {
            status: PlanVersionStatus.PUBLISHED,
            publishedAt: new Date(),
            revision: { increment: 1 },
          },
          include: { plan: true },
        });
        await tx.plan.update({
          where: { id: target.planId },
          data: { currentVersionId: published.id },
        });
        await this.audit.record(tx as Prisma.TransactionClient, {
          planVersionId: published.id,
          actorUserId,
          action: "plan_version.published",
          previousStatus: PlanVersionStatus.REVIEW,
          newStatus: PlanVersionStatus.PUBLISHED,
          applied: true,
          reason,
          source: AuditSource.MANUAL,
        });
        return toAdminVersion(published);
      },
    });
  }

  async retire(
    versionId: string,
    actorUserId: string,
    key: string | undefined,
    expectedRevision: number,
    reason: string,
  ): Promise<AdminPlanVersion> {
    return this.idempotency.execute({
      actorUserId,
      operation: `plans.version.${versionId}.retire`,
      key: requireIdempotencyKey(key),
      payload: { expectedRevision, reason },
      work: async (tx) => {
        const anchor = await tx.planVersion.findUnique({
          where: { id: versionId },
          select: { planId: true },
        });
        if (!anchor) throw new NotFoundException(NOT_FOUND);
        await this.lockPlan(tx, anchor.planId);
        const target = await tx.planVersion.findUniqueOrThrow({
          where: { id: versionId },
          include: { plan: true },
        });
        if (
          target.status !== PlanVersionStatus.PUBLISHED ||
          target.revision !== expectedRevision
        )
          throw new ConflictException(
            "Solo la versión publicada vigente puede retirarse.",
          );
        const result = await tx.planVersion.update({
          where: { id: target.id },
          data: {
            status: PlanVersionStatus.RETIRED,
            retiredAt: new Date(),
            revision: { increment: 1 },
          },
          include: { plan: true },
        });
        await tx.plan.updateMany({
          where: { id: target.planId, currentVersionId: target.id },
          data: { currentVersionId: null },
        });
        await this.audit.record(tx as Prisma.TransactionClient, {
          planVersionId: target.id,
          actorUserId,
          action: "plan_version.retired",
          previousStatus: PlanVersionStatus.PUBLISHED,
          newStatus: PlanVersionStatus.RETIRED,
          applied: true,
          reason,
          source: AuditSource.MANUAL,
        });
        return toAdminVersion(result);
      },
    });
  }

  private async transition(
    versionId: string,
    actorUserId: string,
    key: string | undefined,
    expectedRevision: number,
    reason: string,
    from: PlanVersionStatus,
    to: PlanVersionStatus,
    action: string,
  ): Promise<AdminPlanVersion> {
    return this.idempotency.execute({
      actorUserId,
      operation: `plans.version.${versionId}.${to}`,
      key: requireIdempotencyKey(key),
      payload: { expectedRevision, reason },
      work: async (tx) => {
        const current = await tx.planVersion.findUnique({
          where: { id: versionId },
        });
        if (!current) throw new NotFoundException(NOT_FOUND);
        const update = await tx.planVersion.updateMany({
          where: { id: versionId, status: from, revision: expectedRevision },
          data: {
            status: to,
            reviewedAt:
              to === PlanVersionStatus.REVIEW ? new Date() : undefined,
            revision: { increment: 1 },
          },
        });
        if (update.count !== 1)
          throw new ConflictException(
            "La transición no es válida o la revisión cambió.",
          );
        const result = await tx.planVersion.findUniqueOrThrow({
          where: { id: versionId },
          include: { plan: true },
        });
        await this.audit.record(tx as Prisma.TransactionClient, {
          planVersionId: versionId,
          actorUserId,
          action,
          previousStatus: from,
          newStatus: to,
          applied: true,
          reason,
          source: AuditSource.MANUAL,
        });
        return toAdminVersion(result);
      },
    });
  }

  private async lockPlan(
    tx: BusinessTransactionClient,
    planId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM plans WHERE id = ${planId}::uuid FOR UPDATE`;
    if (!rows[0]) throw new NotFoundException(NOT_FOUND);
  }

  private assertPublishable(version: VersionWithPlan): void {
    if (
      !version.plan.code ||
      !version.currency ||
      !catalogItems(version.features) ||
      !catalogItems(version.benefits) ||
      !PLAN_BILLING_PERIODS.includes(version.billingPeriod as never)
    )
      throw new ConflictException(
        "La versión no satisface el contrato canónico de publicación.",
      );
    if (
      !version.publicVisibility &&
      !version.koralVisibility &&
      !version.crmVisibility &&
      !version.contractVisibility
    )
      throw new ConflictException(
        "La versión publicada debe tener al menos una audiencia visible.",
      );
    if (!version.effectiveFrom)
      throw new ConflictException("effectiveFrom es requerido para publicar.");
    if (version.effectiveTo && version.effectiveFrom >= version.effectiveTo)
      throw new ConflictException("La ventana de vigencia no es válida.");
  }
}
