import { randomUUID } from "node:crypto";
import type { PrismaClient, User } from "@prisma/client";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "../auth/password.service";
import { RedisService } from "../../common/redis/redis.service";
import { publishDraftForTest, type PublishedForTestHandle } from "../../database/publish-legal-document-for-test";
import { upsertActivePlanDemo } from "../../database/seed-payments";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("Admin payment-orders endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdCustomerIds: string[] = [];
  const createdUserIds: string[] = [];
  let terminosHandle: PublishedForTestHandle | null = null;

  let finance: { user: User; cookies: string[] };
  let noPermActor: { user: User; cookies: string[] };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);
    terminosHandle = await publishDraftForTest(prisma as unknown as PrismaClient, "terminos-de-pago");

    const redisClient = app.get(RedisService).getClient();
    const loginKeys = await redisClient.keys("ratelimit:login:*");
    if (loginKeys.length > 0) {
      await redisClient.del(...loginKeys);
    }

    finance = await createActor("FINANCE");
    noPermActor = await createActor("CUSTOMER");
  });

  afterAll(async () => {
    if (terminosHandle) {
      await terminosHandle.restore();
    }
    if (createdCustomerIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentEvent.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentOrder.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.obligation.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `admin-payment-orders-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Admin Payment Orders Test User",
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

  async function createOrder() {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `admin-po-test-${randomUUID()}`,
        fullName: "Cliente Búsqueda Admin",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);

    const plan = await upsertActivePlanDemo(prisma);
    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        concept: "Cuota búsqueda admin",
        amountCents: 500_000,
        currency: "COP",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    const response = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });
    expect(response.status).toBe(201);

    const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { publicReference: response.body.publicReference } });
    return { customer, order };
  }

  it("returns 403 without payments.read", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/payment-orders/search").set("Cookie", noPermActor.cookies);
    expect(response.status).toBe(403);
  });

  it("US-063 AC1: searches by document number", async () => {
    const { customer, order } = await createOrder();

    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/payment-orders/search?search=${customer.documentNumber}`)
      .set("Cookie", finance.cookies);

    expect(response.status).toBe(200);
    expect(response.body.items.some((o: { id: string }) => o.id === order.id)).toBe(true);
  });

  it("US-063 AC1: searches by publicReference", async () => {
    const { order } = await createOrder();

    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/payment-orders/search?search=${order.publicReference}`)
      .set("Cookie", finance.cookies);

    expect(response.status).toBe(200);
    expect(response.body.items.some((o: { id: string }) => o.id === order.id)).toBe(true);
  });

  it("filters by status", async () => {
    const { order } = await createOrder();

    const response = await request(app.getHttpServer()).get(`/api/v1/admin/payment-orders/search?status=PENDING`).set("Cookie", finance.cookies);

    expect(response.status).toBe(200);
    expect(response.body.items.some((o: { id: string }) => o.id === order.id)).toBe(true);
    expect(response.body.items.every((o: { status: string }) => o.status === "PENDING")).toBe(true);
  });

  it("US-063 AC1: returns the full detail with unmasked customer identity", async () => {
    const { customer, order } = await createOrder();

    const response = await request(app.getHttpServer()).get(`/api/v1/admin/payment-orders/${order.id}`).set("Cookie", finance.cookies);

    expect(response.status).toBe(200);
    expect(response.body.customer.documentNumber).toBe(customer.documentNumber);
    expect(response.body.statusLabel).toBe("Pendiente");
  });

  it("US-063 AC1: lists the full PaymentEvent history for an order", async () => {
    const { order } = await createOrder();
    await prisma.paymentEvent.create({
      data: {
        paymentOrderId: order.id,
        source: "bold",
        eventType: "payment.approved",
        idempotencyKey: randomUUID(),
        payload: { status: "approved" },
      },
    });

    const response = await request(app.getHttpServer()).get(`/api/v1/admin/payment-orders/${order.id}/events`).set("Cookie", finance.cookies);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].eventType).toBe("payment.approved");
  });

  it("returns 404 for a nonexistent order id", async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/admin/payment-orders/${randomUUID()}`).set("Cookie", finance.cookies);
    expect(response.status).toBe(404);
  });
});
