import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../app.module";
import { configureApp } from "../bootstrap-app";

describe("Health endpoints (integration, real Postgres + Redis, full app config)", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/health returns 200 ok", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("GET /api/v1/health/live returns 200 ok", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health/live");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("GET /api/v1/health/ready returns 200 ok with both dependencies healthy", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health/ready");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", checks: { database: "ok", redis: "ok" } });
  });

  it("attaches a request id header to every response", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health");
    expect(response.headers["x-request-id"]).toBeDefined();
  });

  it("sets security headers via helmet", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});
