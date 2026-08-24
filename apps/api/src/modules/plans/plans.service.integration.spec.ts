import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "../../database/test-db-client";
import { AdminBusinessIdempotencyService } from "../../common/idempotency/admin-business-idempotency.service";
import { AuditService } from "../audit/audit.service";
import { PlansService } from "./plans.service";
import type { PlanVersionContentDto } from "./dto/plan-version-content.dto";

function canonicalContent(name: string, amountMinor: number, visibility = { public: true, koral: true, crm: true, contracts: true }): PlanVersionContentDto {
  return {
    internalName: name,
    name,
    description: `${name} description`,
    features: [{ code: "FEATURE_ONE", name: "Feature one" }],
    benefits: [{ code: "BENEFIT_ONE", name: "Benefit one", description: "Persisted benefit" }],
    pricing: { amountMinor, currency: "COP" },
    billingPeriod: "MONTHLY",
    visibility,
    recommended: false,
    displayOrder: 1,
    effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
  };
}

describe("PlansService canonical lifecycle (integration)", () => {
  let prisma: PrismaClient;
  let service: PlansService;
  let actorId: string;
  const planIds: string[] = [];
  const contractIds: string[] = [];

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
    const actor = await prisma.user.create({ data: { email: `${randomUUID()}@example.com`, fullName: "Plans Test Actor", passwordHash: "test-only-hash", status: "ACTIVE" } });
    actorId = actor.id;
    service = new PlansService(
      prisma as unknown as ConstructorParameters<typeof PlansService>[0],
      new AuditService(),
      new AdminBusinessIdempotencyService(prisma as unknown as ConstructorParameters<typeof AdminBusinessIdempotencyService>[0]),
    );
  });

  afterAll(async () => {
    await prisma.contract.updateMany({ where: { id: { in: contractIds } }, data: { currentVersionId: null } });
    await prisma.contractVersion.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.contract.deleteMany({ where: { id: { in: contractIds } } });
    await prisma.auditLog.deleteMany({ where: { planVersion: { planId: { in: planIds } } } });
    await prisma.adminIdempotency.deleteMany({ where: { actorUserId: actorId } });
    await prisma.plan.updateMany({ where: { id: { in: planIds } }, data: { currentVersionId: null } });
    await prisma.planVersion.deleteMany({ where: { planId: { in: planIds } } });
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it("publishes exclusively, serves Public/Koral from one source, and preserves contract pinning", async () => {
    const marker = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const plan = await service.create(actorId, `create-${marker}-0001`, { code: `PLAN_${marker}`, name: `Plan ${marker}`, version: canonicalContent("Version one", 100_000) });
    planIds.push(plan.id);
    const firstDraft = plan.versions[0]!;
    const review = await service.submitReview(firstDraft.planVersionId, actorId, `review-${marker}-0001`, firstDraft.revision, "Ready for review");
    const firstPublished = await service.publish(review.planVersionId, actorId, `publish-${marker}-001`, review.revision, "Approved commercial publication");

    await expect(service.listPublished("PUBLIC", plan.code!)).resolves.toMatchObject([{ planVersionId: firstPublished.planVersionId, pricing: { amountMinor: 100_000, currency: "COP" } }]);
    await expect(service.listPublished("KORAL", plan.code!)).resolves.toHaveLength(1);

    const contract = await prisma.contract.create({ data: { type: "TEST", internalReference: `contract-${marker}` } });
    contractIds.push(contract.id);
    const pinned = await prisma.contractVersion.create({ data: { contractId: contract.id, version: 1, documentPath: `/tmp/${marker}`, checksum: marker, planVersionId: firstPublished.planVersionId } });
    await prisma.contract.update({ where: { id: contract.id }, data: { currentVersionId: pinned.id } });

    const secondDraft = await service.createVersion(plan.id, actorId, `version-${marker}-001`, { version: canonicalContent("Version two", 125_000, { public: true, koral: false, crm: true, contracts: true }) });
    const secondReview = await service.submitReview(secondDraft.planVersionId, actorId, `review-${marker}-0002`, secondDraft.revision, "Review version two");
    const secondPublished = await service.publish(secondReview.planVersionId, actorId, `publish-${marker}-002`, secondReview.revision, "Publish version two");

    expect((await prisma.contractVersion.findUniqueOrThrow({ where: { id: pinned.id } })).planVersionId).toBe(firstPublished.planVersionId);
    expect(await prisma.planVersion.findUniqueOrThrow({ where: { id: firstPublished.planVersionId } })).toMatchObject({ status: "RETIRED", priceCents: 100_000 });
    await expect(service.listPublished("PUBLIC", plan.code!)).resolves.toMatchObject([{ planVersionId: secondPublished.planVersionId, pricing: { amountMinor: 125_000 } }]);
    await expect(service.listPublished("KORAL", plan.code!)).resolves.toEqual([]);

    await expect(prisma.planVersion.create({ data: { planId: plan.id, version: 3, internalName: "Duplicate", publicName: "Duplicate", description: "Duplicate", priceCents: 1, billingPeriod: "MONTHLY", status: "PUBLISHED" } })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("preserves legacy records without publishing an inferred mapping", async () => {
    const marker = randomUUID().slice(0, 8);
    const legacy = await prisma.plan.create({ data: { name: `Legacy ${marker}`, versions: { create: { version: 1, internalName: "Legacy", publicName: "Legacy", description: "Unmapped", priceCents: 99, billingPeriod: "mensual", status: "ACTIVE" } } }, include: { versions: true } });
    planIds.push(legacy.id);
    await prisma.plan.update({ where: { id: legacy.id }, data: { currentVersionId: legacy.versions[0]!.id } });

    const admin = (await service.getAdmin(legacy.id)).versions[0]!;
    expect(admin).toMatchObject({ status: "LEGACY_UNMAPPED", legacyStatus: "ACTIVE", code: "" });
    await expect(service.listPublished("PUBLIC")).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ planId: legacy.id })]));
  });
});
