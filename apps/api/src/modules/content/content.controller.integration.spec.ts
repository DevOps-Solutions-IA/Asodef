import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { CONTENT_CATALOG } from "../../database/content-catalog";
import { seedContent } from "../../database/seed-content";

describe("Content endpoints (integration, real HTTP via the exact configureApp() setup)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const createdKeys: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await seedContent(prisma);
  });

  afterAll(async () => {
    if (createdKeys.length > 0) {
      await prisma.contentEntry.deleteMany({ where: { key: { in: createdKeys } } });
    }
    await app.close();
  });

  it("does not require authentication (public endpoint)", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/content");
    expect(response.status).toBe(200);
  });

  it("returns the seeded catalog entries with only key/value, no internal fields", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/content").expect(200);

    for (const catalogEntry of CONTENT_CATALOG) {
      const entry = (response.body as Array<{ key: string; value: string }>).find((e) => e.key === catalogEntry.key);
      expect(entry).toEqual({ key: catalogEntry.key, value: catalogEntry.value });
    }

    for (const entry of response.body as Array<Record<string, unknown>>) {
      expect(Object.keys(entry).sort()).toEqual(["key", "value"]);
    }
  });

  it("never returns a DRAFT entry", async () => {
    const draftKey = `test.draft.${randomUUID()}`;
    createdKeys.push(draftKey);
    await prisma.contentEntry.create({ data: { key: draftKey, value: "Borrador sin publicar", status: "DRAFT" } });

    const response = await request(app.getHttpServer()).get("/api/v1/content").expect(200);
    const found = (response.body as Array<{ key: string }>).find((e) => e.key === draftKey);
    expect(found).toBeUndefined();
  });

  it("sets a short, cacheable Cache-Control header", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/content").expect(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=30");
  });

  it("reflects a value changed directly in the database on the next request, without a rebuild", async () => {
    const key = `test.dynamic.${randomUUID()}`;
    createdKeys.push(key);
    await prisma.contentEntry.create({ data: { key, value: "Valor original", status: "PUBLISHED" } });

    const before = await request(app.getHttpServer()).get("/api/v1/content").expect(200);
    expect((before.body as Array<{ key: string; value: string }>).find((e) => e.key === key)?.value).toBe("Valor original");

    await prisma.contentEntry.update({ where: { key }, data: { value: "Valor actualizado" } });

    const after = await request(app.getHttpServer()).get("/api/v1/content").expect(200);
    expect((after.body as Array<{ key: string; value: string }>).find((e) => e.key === key)?.value).toBe("Valor actualizado");
  });
});
