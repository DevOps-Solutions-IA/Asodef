import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
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

describe("Contract endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdContractIds: string[] = [];

  let admin: { user: User; cookies: string[] };
  let noPermActor: { user: User; cookies: string[] };

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
  });

  afterAll(async () => {
    if (createdContractIds.length > 0) {
      const versions = await prisma.contractVersion.findMany({ where: { contractId: { in: createdContractIds } } });
      const versionIds = versions.map((v) => v.id);
      await prisma.contractDownloadToken.deleteMany({ where: { contractVersionId: { in: versionIds } } });
      await prisma.contractAcceptance.deleteMany({ where: { contractVersionId: { in: versionIds } } });
      await prisma.contractSigner.deleteMany({ where: { contractVersionId: { in: versionIds } } });
      await prisma.contract.updateMany({ where: { id: { in: createdContractIds } }, data: { currentVersionId: null } });
      await prisma.contractVersion.deleteMany({ where: { contractId: { in: createdContractIds } } });
      await prisma.contract.deleteMany({ where: { id: { in: createdContractIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `contract-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Contract Test User",
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

  async function createContract() {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/contracts")
      .set("Cookie", admin.cookies)
      .send({ type: "convenio_comercial", internalReference: `CT-${randomUUID().slice(0, 8)}` });
    expect(response.status).toBe(201);
    createdContractIds.push(response.body.id);
    return response.body;
  }

  async function uploadVersion(contractId: string, contents = "contenido del contrato de prueba") {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/contracts/${contractId}/versions`)
      .set("Cookie", admin.cookies)
      .attach("file", Buffer.from(contents), "contrato.pdf")
      .field("changeSummary", "Versión inicial de prueba");
    expect(response.status).toBe(201);
    return response.body;
  }

  it("returns 403 creating a contract without contracts.manage", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/contracts")
      .set("Cookie", noPermActor.cookies)
      .send({ type: "convenio_comercial", internalReference: "CT-NOPERM" });
    expect(response.status).toBe(403);
  });

  it("creates a Contract in DRAFT status", async () => {
    const contract = await createContract();
    expect(contract.status).toBe("DRAFT");
    expect(contract.currentVersionId).toBeNull();
  });

  it("uploads a ContractVersion, computes a real checksum, and sets it as currentVersion", async () => {
    const contract = await createContract();
    const version = await uploadVersion(contract.id, "contenido único de prueba");

    const expectedChecksum = createHash("sha256").update(Buffer.from("contenido único de prueba")).digest("hex");
    expect(version.checksum).toBe(expectedChecksum);
    expect(version.version).toBe(1);
    expect(version).not.toHaveProperty("documentPath");

    const reloaded = await request(app.getHttpServer()).get(`/api/v1/admin/contracts/${contract.id}`).set("Cookie", admin.cookies);
    expect(reloaded.body.currentVersionId).toBe(version.id);
  });

  it("blocks setting status directly to ACTIVE via transition()", async () => {
    const contract = await createContract();
    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/contracts/${contract.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "ACTIVE" });
    expect(response.status).toBe(409);
  });

  it("Example (AC): uploading a version, adding two signers, and recording both acceptances transitions PENDING_ACCEPTANCE to ACTIVE", async () => {
    const contract = await createContract();
    const version = await uploadVersion(contract.id);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/contracts/${contract.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "UNDER_REVIEW" });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/contracts/${contract.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "PENDING_ACCEPTANCE" });

    const signerOne = await request(app.getHttpServer())
      .post(`/api/v1/admin/contract-versions/${version.id}/signers`)
      .set("Cookie", admin.cookies)
      .send({ fullName: "Firmante Uno", role: "Representante legal", email: `firmante1-${randomUUID()}@example.com` });
    expect(signerOne.status).toBe(201);

    const signerTwo = await request(app.getHttpServer())
      .post(`/api/v1/admin/contract-versions/${version.id}/signers`)
      .set("Cookie", admin.cookies)
      .send({ fullName: "Firmante Dos", role: "Testigo", email: `firmante2-${randomUUID()}@example.com` });
    expect(signerTwo.status).toBe(201);

    const acceptOne = await request(app.getHttpServer())
      .post(`/api/v1/admin/contract-versions/${version.id}/acceptances`)
      .set("Cookie", admin.cookies)
      .send({ signerId: signerOne.body.id, evidenceReference: "correo-confirmacion-1" });
    expect(acceptOne.status).toBe(201);
    expect(acceptOne.body.contractStatus).toBe("PENDING_ACCEPTANCE");
    expect(acceptOne.body.ipAddress).not.toBeNull();

    const acceptTwo = await request(app.getHttpServer())
      .post(`/api/v1/admin/contract-versions/${version.id}/acceptances`)
      .set("Cookie", admin.cookies)
      .send({ signerId: signerTwo.body.id, evidenceReference: "correo-confirmacion-2" });
    expect(acceptTwo.status).toBe(201);
    expect(acceptTwo.body.contractStatus).toBe("ACTIVE");

    const reloaded = await request(app.getHttpServer()).get(`/api/v1/admin/contracts/${contract.id}`).set("Cookie", admin.cookies);
    expect(reloaded.body.status).toBe("ACTIVE");
  });

  it("rejects recording an acceptance while the contract is still DRAFT", async () => {
    const contract = await createContract();
    const version = await uploadVersion(contract.id);
    const signer = await request(app.getHttpServer())
      .post(`/api/v1/admin/contract-versions/${version.id}/signers`)
      .set("Cookie", admin.cookies)
      .send({ fullName: "Firmante Solo", email: `solo-${randomUUID()}@example.com` });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/contract-versions/${version.id}/acceptances`)
      .set("Cookie", admin.cookies)
      .send({ signerId: signer.body.id });
    expect(response.status).toBe(409);
  });

  it("Negative case (AC): requesting a download URL without contracts.read returns 403", async () => {
    const contract = await createContract();
    const version = await uploadVersion(contract.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/contract-versions/${version.id}/download-url`)
      .set("Cookie", noPermActor.cookies);
    expect(response.status).toBe(403);
  });

  it("issues a signed download URL and the token successfully downloads the exact uploaded bytes", async () => {
    const contract = await createContract();
    const version = await uploadVersion(contract.id, "contenido descargable de prueba");

    const issued = await request(app.getHttpServer())
      .post(`/api/v1/admin/contract-versions/${version.id}/download-url`)
      .set("Cookie", admin.cookies);
    expect(issued.status).toBe(200);
    expect(issued.body.token).toBeTruthy();

    const download = await request(app.getHttpServer()).get(`/api/v1/contracts/downloads/${issued.body.token}`);
    expect(download.status).toBe(200);
    expect(Buffer.from(download.body).toString("utf-8")).toBe("contenido descargable de prueba");
  });

  it("Negative case (AC): requesting an expired signed download URL returns 410", async () => {
    const contract = await createContract();
    const version = await uploadVersion(contract.id);

    const issued = await request(app.getHttpServer())
      .post(`/api/v1/admin/contract-versions/${version.id}/download-url`)
      .set("Cookie", admin.cookies);
    expect(issued.status).toBe(200);

    await prisma.contractDownloadToken.updateMany({
      where: { contractVersionId: version.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app.getHttpServer()).get(`/api/v1/contracts/downloads/${issued.body.token}`);
    expect(response.status).toBe(410);
  });

  it("returns 404 for an unknown download token", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/contracts/downloads/this-token-does-not-exist");
    expect(response.status).toBe(404);
  });

  it("list()/get() return created contracts for authorized readers", async () => {
    const contract = await createContract();

    const list = await request(app.getHttpServer()).get("/api/v1/admin/contracts").set("Cookie", admin.cookies);
    expect(list.status).toBe(200);
    expect(list.body.some((c: { id: string }) => c.id === contract.id)).toBe(true);

    const found = await request(app.getHttpServer()).get(`/api/v1/admin/contracts/${contract.id}`).set("Cookie", admin.cookies);
    expect(found.status).toBe(200);
    expect(found.body.id).toBe(contract.id);
  });
});
