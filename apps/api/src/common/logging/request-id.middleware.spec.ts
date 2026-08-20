import { Logger } from "@nestjs/common";
import express, { type Request } from "express";
import request from "supertest";
import { requestIdMiddleware, type RequestWithId } from "./request-id.middleware";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function testApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/v1/auth/probe", (_req, res) => res.json({ ok: true }));
  app.get("/api/v1/admin/probe", (req, res) => {
    (req as Request & { user?: { id: string } }).user = { id: "actor-1" };
    res.json({ ok: true });
  });
  return app;
}

describe("requestIdMiddleware", () => {
  afterEach(() => jest.restoreAllMocks());

  it("accepts canonical UUID identifiers and keeps correlation distinct", async () => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const response = await request(testApp())
      .get("/api/v1/health")
      .set("X-Request-Id", "63B7A54D-CABE-4B3F-A6B3-40A10291BB6F")
      .set("X-Correlation-Id", "c43f8e8c-8675-4ab9-970f-370672711819");

    expect(response.headers["x-request-id"]).toBe("63b7a54d-cabe-4b3f-a6b3-40a10291bb6f");
    expect(response.headers["x-correlation-id"]).toBe("c43f8e8c-8675-4ab9-970f-370672711819");
  });

  it.each(["not-a-uuid", "x".repeat(512), "../../secret\tvalue"])(
    "rejects untrusted request identifiers and generates a bounded UUID (%s)",
    async (untrusted) => {
      jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
      const response = await request(testApp()).get("/api/v1/health").set("X-Request-Id", untrusted);

      expect(response.headers["x-request-id"]).toMatch(UUID_PATTERN);
      expect(response.headers["x-request-id"]).not.toContain(untrusted);
      expect(response.headers["x-correlation-id"]).toBe(response.headers["x-request-id"]);
    },
  );

  it("sets no-store only on authentication and administration surfaces", async () => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const [auth, admin, health] = await Promise.all([
      request(testApp()).get("/api/v1/auth/probe"),
      request(testApp()).get("/api/v1/admin/probe"),
      request(testApp()).get("/api/v1/health"),
    ]);

    expect(auth.headers["cache-control"]).toBe("no-store");
    expect(admin.headers["cache-control"]).toBe("no-store");
    expect(auth.headers.pragma).toBe("no-cache");
    expect(health.headers["cache-control"]).toBeUndefined();
  });

  it("emits a structured completion event with route template and actor when available", async () => {
    const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    await request(testApp()).get("/api/v1/admin/probe").expect(200);

    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      event: "http_request_completed",
      method: "GET",
      endpoint: "/api/v1/admin/probe",
      statusCode: 200,
      actorId: "actor-1",
      requestId: expect.stringMatching(UUID_PATTERN),
      correlationId: expect.stringMatching(UUID_PATTERN),
      durationMs: expect.any(Number),
    }));
  });

  it("attaches both identifiers to the request context", async () => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const app = express();
    app.use(requestIdMiddleware);
    app.get("/context", (req, res) => {
      const context = req as RequestWithId;
      res.json({ requestId: context.requestId, correlationId: context.correlationId });
    });

    const response = await request(app).get("/context");
    expect(response.body.requestId).toMatch(UUID_PATTERN);
    expect(response.body.correlationId).toBe(response.body.requestId);
  });
});
