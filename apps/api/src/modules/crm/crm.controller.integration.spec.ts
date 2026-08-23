import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { User } from "@prisma/client";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "../auth/password.service";
import { RedisService } from "../../common/redis/redis.service";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("CRM endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdLeadIds: string[] = [];
  const createdProspectIds: string[] = [];
  const createdOpportunityIds: string[] = [];
  const createdCompanyIds: string[] = [];

  let admin: { user: User; cookies: string[] };
  let noPermActor: { user: User; cookies: string[] };
  let readOnlyActor: { user: User; cookies: string[] };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);

    const redisClient = app.get(RedisService).getClient();
    const loginKeys = await redisClient.keys("ratelimit:login:*");
    if (loginKeys.length > 0) {
      await redisClient.del(...loginKeys);
    }

    admin = await createActor("ADMIN");
    noPermActor = await createActor("CUSTOMER");
    // AUDITOR holds crm.read but not crm.manage (rbac-catalog.ts) - the
    // exact "read-only" role US-061 AC5 describes.
    readOnlyActor = await createActor("AUDITOR");
  });

  afterAll(async () => {
    // commercial_activities / opportunity_status_history / audit_logs /
    // proposals / agreements all hold Restrict FKs into opportunities,
    // which itself holds a Restrict FK into prospects - this order
    // mirrors that dependency chain exactly (same lesson as US-050's
    // own cleanup fix). agreements also hold a Restrict FK into
    // companies, so they must clear before companies are deleted.
    if (createdOpportunityIds.length > 0) {
      await prisma.commercialActivity.deleteMany({ where: { opportunityId: { in: createdOpportunityIds } } });
      await prisma.opportunityStatusHistory.deleteMany({ where: { opportunityId: { in: createdOpportunityIds } } });
      await prisma.auditLog.deleteMany({ where: { opportunityId: { in: createdOpportunityIds } } });
      await prisma.proposal.deleteMany({ where: { opportunityId: { in: createdOpportunityIds } } });
      await prisma.agreement.deleteMany({ where: { opportunityId: { in: createdOpportunityIds } } });
      await prisma.opportunity.deleteMany({ where: { id: { in: createdOpportunityIds } } });
    }
    if (createdProspectIds.length > 0) {
      await prisma.prospect.deleteMany({ where: { id: { in: createdProspectIds } } });
    }
    if (createdLeadIds.length > 0) {
      await prisma.leadSubmission.deleteMany({ where: { id: { in: createdLeadIds } } });
    }
    if (createdCompanyIds.length > 0) {
      await prisma.company.deleteMany({ where: { id: { in: createdCompanyIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.adminIdempotency.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `crm-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "CRM Test User",
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

  async function createLead() {
    const lead = await prisma.leadSubmission.create({
      data: {
        fullName: "Prospecto de Prueba",
        company: "Empresa de Prueba CRM",
        position: "Gerente",
        city: "Cali",
        phone: "3000000000",
        email: `crm-lead-${randomUUID()}@example.com`,
        sector: "Servicios",
        message: "Interesado en afiliación.",
        consentAccepted: true,
      },
    });
    createdLeadIds.push(lead.id);
    return lead;
  }

  async function createCompany() {
    const company = await prisma.company.create({
      data: {
        name: "Empresa Acuerdo CRM",
        nit: `900${randomUUID().slice(0, 6)}-${Math.floor(Math.random() * 10)}`,
        contactName: "Contacto Empresa",
        contactEmail: `crm-company-${randomUUID()}@example.com`,
        sector: "Servicios",
      },
    });
    createdCompanyIds.push(company.id);
    return company;
  }

  async function promoteLeadAndCreateOpportunity() {
    const lead = await createLead();
    const promote = await request(app.getHttpServer())
      .post(`/api/v1/admin/leads/${lead.id}/promote`)
      .set("Cookie", admin.cookies)
      .send({ type: "COMPANY", documentOrNit: `900${randomUUID().slice(0, 6)}` });
    expect(promote.status).toBe(201);
    createdProspectIds.push(promote.body.id);

    const createOpp = await request(app.getHttpServer())
      .post(`/api/v1/admin/prospects/${promote.body.id}/opportunities`)
      .set("Cookie", admin.cookies)
      .send({});
    expect(createOpp.status).toBe(201);
    createdOpportunityIds.push(createOpp.body.id);

    return { lead, prospect: promote.body, opportunity: createOpp.body };
  }

  it("US-061 AC5: an actor with crm.read but not crm.manage can read prospects/opportunities but gets 403 on mutating routes", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();

    const readProspects = await request(app.getHttpServer()).get("/api/v1/admin/prospects").set("Cookie", readOnlyActor.cookies);
    expect(readProspects.status).toBe(200);

    const readOpportunities = await request(app.getHttpServer()).get("/api/v1/admin/opportunities").set("Cookie", readOnlyActor.cookies);
    expect(readOpportunities.status).toBe(200);

    const mutate = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/stage`)
      .set("Cookie", readOnlyActor.cookies)
      .send({ stage: "QUALIFIED" });
    expect(mutate.status).toBe(403);
  });

  it("returns 403 for the promote endpoint without crm.manage", async () => {
    const lead = await createLead();
    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/leads/${lead.id}/promote`)
      .set("Cookie", noPermActor.cookies)
      .send({ type: "COMPANY", documentOrNit: "900123456" });
    expect(response.status).toBe(403);
  });

  it("promotes a lead into a Prospect, linking prospectId and defaulting fields from the lead", async () => {
    const lead = await createLead();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/leads/${lead.id}/promote`)
      .set("Cookie", admin.cookies)
      .send({ type: "COMPANY", documentOrNit: "900999888" });

    expect(response.status).toBe(201);
    createdProspectIds.push(response.body.id);
    expect(response.body.fullNameOrLegalName).toBe(lead.company);
    expect(response.body.sector).toBe(lead.sector);
    expect(response.body.city).toBe(lead.city);
    expect(response.body.stage).toBe("NEW_PROSPECT");

    const updatedLead = await prisma.leadSubmission.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.prospectId).toBe(response.body.id);
  });

  it("rejects promoting the same lead twice", async () => {
    const lead = await createLead();
    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/leads/${lead.id}/promote`)
      .set("Cookie", admin.cookies)
      .send({ type: "INDIVIDUAL", documentOrNit: "1000000111" });
    createdProspectIds.push(first.body.id);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/admin/leads/${lead.id}/promote`)
      .set("Cookie", admin.cookies)
      .send({ type: "INDIVIDUAL", documentOrNit: "1000000111" });

    expect(second.status).toBe(409);
  });

  it("Example (AC): promote -> create Opportunity -> move to QUALIFIED produces exactly one OpportunityStatusHistory row", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();
    expect(opportunity.stage).toBe("NEW_PROSPECT");

    const historyBeforeChange = await prisma.opportunityStatusHistory.count({ where: { opportunityId: opportunity.id } });
    expect(historyBeforeChange).toBe(0);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/stage`)
      .set("Cookie", admin.cookies)
      .send({ stage: "QUALIFIED", note: "Prospecto calificado tras primera llamada." });

    expect(response.status).toBe(200);
    expect(response.body.stage).toBe("QUALIFIED");
    // NEW_PROSPECT -> QUALIFIED skips CONTACTED in the primary pipeline
    // order, so a warning is expected here too - the AC's own Example
    // only asserts the history-row count/content, not warning absence.
    expect(response.body.warning).toContain("CONTACTED");

    const historyRows = await prisma.opportunityStatusHistory.findMany({ where: { opportunityId: opportunity.id } });
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.fromStage).toBe("NEW_PROSPECT");
    expect(historyRows[0]?.toStage).toBe("QUALIFIED");

    const auditEntries = await prisma.auditLog.findMany({ where: { opportunityId: opportunity.id } });
    expect(auditEntries.map((entry) => entry.action)).toEqual(expect.arrayContaining(["opportunity.created", "opportunity.stage_changed"]));
    expect(auditEntries.filter((entry) => entry.action === "opportunity.stage_changed")).toHaveLength(1);
  });

  it("Negative case (AC): jumping from NEW_PROSPECT to ACTIVE_PARTNER succeeds but returns a skip warning, and is still fully audited", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/stage`)
      .set("Cookie", admin.cookies)
      .send({ stage: "ACTIVE_PARTNER", note: "Cierre acelerado excepcional." });

    expect(response.status).toBe(200);
    expect(response.body.stage).toBe("ACTIVE_PARTNER");
    expect(response.body.warning).not.toBeNull();
    expect(response.body.warning).toContain("LEGAL_REVIEW");
    expect(response.body.warning).toContain("CONTRACT_PENDING");

    const historyRows = await prisma.opportunityStatusHistory.findMany({ where: { opportunityId: opportunity.id } });
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.toStage).toBe("ACTIVE_PARTNER");

    const auditEntries = await prisma.auditLog.findMany({ where: { opportunityId: opportunity.id } });
    const stageAuditEntries = auditEntries.filter((entry) => entry.action === "opportunity.stage_changed");
    expect(stageAuditEntries).toHaveLength(1);
    expect(stageAuditEntries[0]?.applied).toBe(true);
  });

  it("a single forward step (e.g. NEW_PROSPECT -> CONTACTED) produces no warning", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/stage`)
      .set("Cookie", admin.cookies)
      .send({ stage: "CONTACTED", note: "Primer contacto realizado." });

    expect(response.status).toBe(200);
    expect(response.body.warning).toBeNull();
  });

  it("a move into a side/terminal state (e.g. LOST_OPPORTUNITY) produces no skip warning", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/stage`)
      .set("Cookie", admin.cookies)
      .send({ stage: "LOST_OPPORTUNITY", note: "El prospecto no continuó el proceso." });

    expect(response.status).toBe(200);
    expect(response.body.stage).toBe("LOST_OPPORTUNITY");
    expect(response.body.warning).toBeNull();
  });

  it("schedules and completes a CommercialActivity tied to an opportunity", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();

    const schedule = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/activities`)
      .set("Cookie", admin.cookies)
      .send({ type: "CALL", assignedUserId: admin.user.id, note: "Llamar para agendar reunión." });

    expect(schedule.status).toBe(201);
    expect(schedule.body.completedAt).toBeNull();
    expect(schedule.body.assignedUserId).toBe(admin.user.id);

    const complete = await request(app.getHttpServer())
      .post(`/api/v1/admin/activities/${schedule.body.id}/complete`)
      .set("Cookie", admin.cookies);

    expect(complete.status).toBe(200);
    expect(complete.body.completedAt).not.toBeNull();

    const completeAgain = await request(app.getHttpServer())
      .post(`/api/v1/admin/activities/${schedule.body.id}/complete`)
      .set("Cookie", admin.cookies);
    expect(completeAgain.status).toBe(409);
  });

  it("list() returns created prospects and opportunities", async () => {
    const { prospect, opportunity } = await promoteLeadAndCreateOpportunity();

    const prospects = await request(app.getHttpServer()).get("/api/v1/admin/prospects").set("Cookie", admin.cookies);
    expect(prospects.status).toBe(200);
    expect(prospects.body.items.some((p: { id: string }) => p.id === prospect.id)).toBe(true);

    const opportunities = await request(app.getHttpServer()).get("/api/v1/admin/opportunities").set("Cookie", admin.cookies);
    expect(opportunities.status).toBe(200);
    expect(opportunities.body.items.some((o: { id: string }) => o.id === opportunity.id)).toBe(true);
  });

  it("validates bounded pagination and applies server-side prospect search", async () => {
    const { prospect } = await promoteLeadAndCreateOpportunity();
    const invalid = await request(app.getHttpServer()).get("/api/v1/admin/prospects?pageSize=101").set("Cookie", admin.cookies);
    expect(invalid.status).toBe(400);

    const filtered = await request(app.getHttpServer())
      .get(`/api/v1/admin/prospects?search=${encodeURIComponent(prospect.documentOrNit)}&pageSize=1&sortBy=fullNameOrLegalName&sortOrder=asc`)
      .set("Cookie", admin.cookies);
    expect(filtered.status).toBe(200);
    expect(filtered.body).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(filtered.body.items[0].id).toBe(prospect.id);
  });

  it("rejects a stale opportunity stage write with 409 and does not append history", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();
    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/stage`)
      .set("Cookie", admin.cookies)
      .send({ stage: "CONTACTED", expectedUpdatedAt: opportunity.updatedAt });
    expect(first.status).toBe(200);

    const stale = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/stage`)
      .set("Cookie", admin.cookies)
      .send({ stage: "QUALIFIED", expectedUpdatedAt: opportunity.updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.message).toContain("modificada por otra persona");
    expect(await prisma.opportunityStatusHistory.count({ where: { opportunityId: opportunity.id } })).toBe(1);
  });

  it("assigns existing owners with optimistic concurrency and audits opportunity ownership changes", async () => {
    const { prospect, opportunity } = await promoteLeadAndCreateOpportunity();
    const assignedProspect = await request(app.getHttpServer())
      .patch(`/api/v1/admin/prospects/${prospect.id}/assignment`)
      .set("Cookie", admin.cookies)
      .send({ assignedUserId: admin.user.id, expectedUpdatedAt: prospect.updatedAt });
    expect(assignedProspect.status).toBe(200);
    expect(assignedProspect.body.assignedUserId).toBe(admin.user.id);

    const assignedOpportunity = await request(app.getHttpServer())
      .patch(`/api/v1/admin/opportunities/${opportunity.id}/assignment`)
      .set("Cookie", admin.cookies)
      .send({ assignedUserId: admin.user.id, expectedUpdatedAt: opportunity.updatedAt });
    expect(assignedOpportunity.status).toBe(200);
    expect(assignedOpportunity.body.assignedUserId).toBe(admin.user.id);
    const audit = await prisma.auditLog.findFirst({ where: { opportunityId: opportunity.id, action: "opportunity.assignment_changed" } });
    expect(audit?.actorUserId).toBe(admin.user.id);
    expect(audit?.metadata).toMatchObject({ before: { assignedUserId: null }, after: { assignedUserId: admin.user.id } });

    const stale = await request(app.getHttpServer())
      .patch(`/api/v1/admin/opportunities/${opportunity.id}/assignment`)
      .set("Cookie", admin.cookies)
      .send({ assignedUserId: null, expectedUpdatedAt: opportunity.updatedAt });
    expect(stale.status).toBe(409);
  });

  it("rejects assigning a CRM entity to a nonexistent user", async () => {
    const { prospect } = await promoteLeadAndCreateOpportunity();
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/admin/prospects/${prospect.id}/assignment`)
      .set("Cookie", admin.cookies)
      .send({ assignedUserId: randomUUID(), expectedUpdatedAt: prospect.updatedAt });
    expect(response.status).toBe(404);
  });

  it("serializes concurrent proposal creation into distinct sequential versions", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/admin/opportunities/${opportunity.id}/proposals`).set("Cookie", admin.cookies).send({ content: { source: "concurrent-a" } }),
      request(app.getHttpServer()).post(`/api/v1/admin/opportunities/${opportunity.id}/proposals`).set("Cookie", admin.cookies).send({ content: { source: "concurrent-b" } }),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect([first.body.version, second.body.version].sort()).toEqual([1, 2]);
  });

  it("replays an admin proposal idempotency key safely and rejects payload drift", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();
    const key = randomUUID();
    const endpoint = `/api/v1/admin/opportunities/${opportunity.id}/proposals`;
    const payload = { content: { benefit: "Propuesta idempotente" } };
    const first = await request(app.getHttpServer()).post(endpoint).set("Cookie", admin.cookies).set("Idempotency-Key", key).send(payload);
    const replay = await request(app.getHttpServer()).post(endpoint).set("Cookie", admin.cookies).set("Idempotency-Key", key).send(payload);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(await prisma.proposal.count({ where: { opportunityId: opportunity.id } })).toBe(1);

    const drift = await request(app.getHttpServer()).post(endpoint).set("Cookie", admin.cookies).set("Idempotency-Key", key).send({ content: { benefit: "Otro contenido" } });
    expect(drift.status).toBe(409);
  });

  it("Example (AC): creating two Proposal versions for the same opportunity preserves both, with the latest flagged as current", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();

    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/proposals`)
      .set("Cookie", admin.cookies)
      .send({ content: { benefit: "Plan básico", priceCents: 50000 } });
    expect(first.status).toBe(201);
    expect(first.body.version).toBe(1);
    expect(first.body.isCurrent).toBe(true);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/proposals`)
      .set("Cookie", admin.cookies)
      .send({ content: { benefit: "Plan premium", priceCents: 80000 } });
    expect(second.status).toBe(201);
    expect(second.body.version).toBe(2);
    expect(second.body.isCurrent).toBe(true);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/opportunities/${opportunity.id}/proposals`)
      .set("Cookie", admin.cookies);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);

    const v1 = list.body.find((p: { version: number }) => p.version === 1);
    const v2 = list.body.find((p: { version: number }) => p.version === 2);
    expect(v1.isCurrent).toBe(false);
    expect(v1.content).toEqual({ benefit: "Plan básico", priceCents: 50000 });
    expect(v2.isCurrent).toBe(true);
    expect(v2.content).toEqual({ benefit: "Plan premium", priceCents: 80000 });
  });

  it("Negative case (AC): creating an Agreement while the opportunity is still in qualified returns 409 with a clear stage-requirement message", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();
    const company = await createCompany();

    const stageChange = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/stage`)
      .set("Cookie", admin.cookies)
      .send({ stage: "QUALIFIED" });
    expect(stageChange.status).toBe(200);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/agreement`)
      .set("Cookie", admin.cookies)
      .send({ companyId: company.id });

    expect(response.status).toBe(409);
    expect(response.body.message).toEqual(expect.stringContaining("contract_pending"));
  });

  it("US-061: lists LeadSubmissions, including their prospectId once promoted", async () => {
    const unpromoted = await createLead();
    const { lead: promoted, prospect } = await promoteLeadAndCreateOpportunity();

    const response = await request(app.getHttpServer()).get("/api/v1/admin/leads").set("Cookie", admin.cookies);
    expect(response.status).toBe(200);

    const unpromotedEntry = response.body.items.find((l: { id: string }) => l.id === unpromoted.id);
    const promotedEntry = response.body.items.find((l: { id: string }) => l.id === promoted.id);
    expect(unpromotedEntry.prospectId).toBeNull();
    expect(promotedEntry.prospectId).toBe(prospect.id);
  });

  it("US-061: lists an opportunity's full status history, most recent first", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();

    await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/stage`)
      .set("Cookie", admin.cookies)
      .send({ stage: "CONTACTED" });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/stage`)
      .set("Cookie", admin.cookies)
      .send({ stage: "QUALIFIED" });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/opportunities/${opportunity.id}/status-history`)
      .set("Cookie", admin.cookies);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].toStage).toBe("QUALIFIED");
    expect(response.body[1].toStage).toBe("CONTACTED");
  });

  it("US-061: lists an opportunity's scheduled activities", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();

    const schedule = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/activities`)
      .set("Cookie", admin.cookies)
      .send({ type: "EMAIL", note: "Enviar propuesta." });
    expect(schedule.status).toBe(201);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/opportunities/${opportunity.id}/activities`)
      .set("Cookie", admin.cookies);

    expect(response.status).toBe(200);
    expect(response.body.some((a: { id: string }) => a.id === schedule.body.id)).toBe(true);
  });

  it("returns a bounded unified opportunity timeline with domain and audit events", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();
    await request(app.getHttpServer()).post(`/api/v1/admin/opportunities/${opportunity.id}/activities`).set("Cookie", admin.cookies).send({ type: "TASK", note: "Seguimiento" });
    await request(app.getHttpServer()).post(`/api/v1/admin/opportunities/${opportunity.id}/stage`).set("Cookie", admin.cookies).send({ stage: "CONTACTED" });
    const response = await request(app.getHttpServer()).get(`/api/v1/admin/opportunities/${opportunity.id}/timeline?pageSize=20`).set("Cookie", admin.cookies);
    expect(response.status).toBe(200);
    expect(response.body.pageSize).toBe(20);
    expect(response.body.total).toBeGreaterThanOrEqual(5);
    expect(response.body.items.map((item: { kind: string }) => item.kind)).toEqual(expect.arrayContaining(["ACTIVITY", "STAGE_CHANGE", "AUDIT"]));
    expect(response.body.items.map((item: { occurredAt: string }) => item.occurredAt)).toEqual([...response.body.items.map((item: { occurredAt: string }) => item.occurredAt)].sort().reverse());
    const invalid = await request(app.getHttpServer()).get(`/api/v1/admin/opportunities/${opportunity.id}/timeline?pageSize=101`).set("Cookie", admin.cookies);
    expect(invalid.status).toBe(400);
  });

  it("creates an Agreement once the opportunity reaches contract_pending", async () => {
    const { opportunity } = await promoteLeadAndCreateOpportunity();
    const company = await createCompany();

    const stageChange = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/stage`)
      .set("Cookie", admin.cookies)
      .send({ stage: "CONTRACT_PENDING" });
    expect(stageChange.status).toBe(200);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/opportunities/${opportunity.id}/agreement`)
      .set("Cookie", admin.cookies)
      .send({ companyId: company.id, signedDate: "2026-08-05T00:00:00.000Z" });

    expect(response.status).toBe(201);
    expect(response.body.companyId).toBe(company.id);
    expect(response.body.signedDate).not.toBeNull();

    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/opportunities/${opportunity.id}/agreements`)
      .set("Cookie", admin.cookies);
    expect(list.status).toBe(200);
    expect(list.body.some((a: { id: string }) => a.id === response.body.id)).toBe(true);
  });
});
