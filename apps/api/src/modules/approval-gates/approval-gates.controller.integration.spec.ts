import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { ApprovalGate, User } from "@prisma/client";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "../auth/password.service";
import { RedisService } from "../../common/redis/redis.service";
import { APPROVAL_GATE_CATALOG } from "../../database/approval-gate-catalog";
import { seedApprovalGates } from "../../database/seed-approval-gates";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("Approval gate endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];

  let admin: { user: User; cookies: string[] };
  let readOnlyActor: { user: User; cookies: string[] };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);
    await seedApprovalGates(prisma);

    const redisClient = app.get(RedisService).getClient();
    const loginKeys = await redisClient.keys("ratelimit:login:*");
    if (loginKeys.length > 0) {
      await redisClient.del(...loginKeys);
    }

    // approvals.manage is a deliberate PLATFORM_ONLY_KEYS permission
    // (rbac-catalog.ts) - excluded from ADMIN by design, only
    // SUPER_ADMIN has it.
    admin = await createActor("SUPER_ADMIN");
    readOnlyActor = await createActor("CUSTOMER");
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `approval-gate-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Approval Gate Test User",
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

  it("returns 403 listing approval gates without approvals.manage", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/approval-gates").set("Cookie", readOnlyActor.cookies);
    expect(response.status).toBe(403);
  });

  it("seeds exactly the catalog's 16 gates, all starting PENDING or already-managed - the AC's own prose says 15 but its literal enumerated list has 16 (flagged, not resolved by dropping one)", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/approval-gates").set("Cookie", admin.cookies);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(APPROVAL_GATE_CATALOG.length);
    expect(response.body).toHaveLength(16);
    const keys = response.body.map((gate: { key: string }) => gate.key).sort();
    expect(keys).toEqual([...APPROVAL_GATE_CATALOG.map((entry) => entry.key)].sort());
  });

  it("gets a single gate by key", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/approval-gates/nit").set("Cookie", admin.cookies);
    expect(response.status).toBe(200);
    expect(response.body.key).toBe("nit");
  });

  it("returns 404 for an unknown gate key", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/approval-gates/not-a-real-gate").set("Cookie", admin.cookies);
    expect(response.status).toBe(404);
  });

  describe("gate lifecycle + isProductionPaymentsEnabled (uses the real shared singleton gates - snapshotted and always restored)", () => {
    let originalGates: ApprovalGate[];

    beforeAll(async () => {
      originalGates = await prisma.approvalGate.findMany();
    });

    afterEach(async () => {
      // Restore every gate to its exact pre-test state after each test
      // in this block, since these are shared singleton rows (unique
      // by key) other tests/the live review environment also read.
      for (const gate of originalGates) {
        await prisma.approvalGate.update({
          where: { key: gate.key },
          data: {
            status: gate.status,
            approvedByUserId: gate.approvedByUserId,
            approvalDate: gate.approvalDate,
            supportingDocumentPath: gate.supportingDocumentPath,
            notes: gate.notes,
            expirationDate: gate.expirationDate,
          },
        });
      }
    });

    it("transitioning a gate records the approver, date, and optional notes/document", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/admin/approval-gates/nit/transition")
        .set("Cookie", admin.cookies)
        .send({ status: "APPROVED", notes: "NIT confirmado con certificado de cámara de comercio." });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("APPROVED");
      expect(response.body.approvedByUserId).toBe(admin.user.id);
      expect(response.body.approvalDate).not.toBeNull();
      expect(response.body.notes).toBe("NIT confirmado con certificado de cámara de comercio.");
    });

    it("Example (AC): approving every gate except one still leaves isProductionPaymentsEnabled() returning false", async () => {
      const allKeys = APPROVAL_GATE_CATALOG.map((entry) => entry.key);
      const [heldBackKey, ...approvedKeys] = allKeys;

      for (const key of approvedKeys) {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/admin/approval-gates/${key}/transition`)
          .set("Cookie", admin.cookies)
          .send({ status: "APPROVED" });
        expect(response.status).toBe(200);
      }
      // heldBackKey deliberately left at whatever its current status is
      // (may already be APPROVED from a prior real admin action in this
      // shared environment - force it to PENDING to guarantee the
      // "not every gate" condition for this test specifically).
      await request(app.getHttpServer())
        .post(`/api/v1/admin/approval-gates/${heldBackKey}/transition`)
        .set("Cookie", admin.cookies)
        .send({ status: "PENDING" });

      const statusWithOneMissing = await request(app.getHttpServer())
        .get("/api/v1/admin/approval-gates/production-payments-status")
        .set("Cookie", admin.cookies);
      expect(statusWithOneMissing.body.enabled).toBe(false);

      const finalApproval = await request(app.getHttpServer())
        .post(`/api/v1/admin/approval-gates/${heldBackKey}/transition`)
        .set("Cookie", admin.cookies)
        .send({ status: "APPROVED" });
      expect(finalApproval.status).toBe(200);

      const statusWithAllApproved = await request(app.getHttpServer())
        .get("/api/v1/admin/approval-gates/production-payments-status")
        .set("Cookie", admin.cookies);
      expect(statusWithAllApproved.body.enabled).toBe(true);
    });

    it("an expired gate keeps isProductionPaymentsEnabled() false even if its status is APPROVED", async () => {
      for (const entry of APPROVAL_GATE_CATALOG) {
        await request(app.getHttpServer())
          .post(`/api/v1/admin/approval-gates/${entry.key}/transition`)
          .set("Cookie", admin.cookies)
          .send({ status: "APPROVED" });
      }
      const allApproved = await request(app.getHttpServer())
        .get("/api/v1/admin/approval-gates/production-payments-status")
        .set("Cookie", admin.cookies);
      expect(allApproved.body.enabled).toBe(true);

      const someKey = APPROVAL_GATE_CATALOG[0]!.key;
      await request(app.getHttpServer())
        .post(`/api/v1/admin/approval-gates/${someKey}/transition`)
        .set("Cookie", admin.cookies)
        .send({ status: "APPROVED", expirationDate: new Date(Date.now() - 60_000).toISOString() });

      const withExpiredGate = await request(app.getHttpServer())
        .get("/api/v1/admin/approval-gates/production-payments-status")
        .set("Cookie", admin.cookies);
      expect(withExpiredGate.body.enabled).toBe(false);
    });
  });
});
