import { ServiceUnavailableException } from "@nestjs/common";
import {
  DeferredKnowledgeWebImportTransport,
  KNOWLEDGE_WEB_IMPORT_LIMITS,
  KNOWLEDGE_WEB_IMPORT_STATUS,
  assertKnowledgeWebChunkWithinLimit,
  validateKnowledgeWebImportRequest,
  validateKnowledgeWebRedirect,
  validateKnowledgeWebResponse,
} from "./knowledge-web-import-policy";

describe("knowledge official web import policy", () => {
  it("acepta únicamente HTTPS oficial y aplica límites acotados", () => {
    expect(
      validateKnowledgeWebImportRequest({
        url: "https://www.asodef.com.co/guias/servicio",
        language: "es-CO",
      }),
    ).toMatchObject({
      language: "es",
      timeoutMs: 10_000,
      maximumRedirects: 3,
      maximumBytes: 10 * 1024 * 1024,
    });
  });

  it.each([
    "http://asodef.com.co/guia",
    "https://usuario:clave@asodef.com.co/guia",
    "https://asodef.com.co:8443/guia",
    "https://asodef.com.co/guia#secreto",
    "https://evil.example/guia",
    "https://asodef.com.co.evil.example/guia",
    "https://127.0.0.1/guia",
  ])("rechaza la URL fuera del contrato oficial: %s", (url) => {
    expect(() =>
      validateKnowledgeWebImportRequest({ url, language: "es" }),
    ).toThrow();
  });

  it("revalida cada redirect y bloquea escape de allowlist y exceso de hops", () => {
    const current = new URL("https://asodef.com.co/inicio");
    expect(validateKnowledgeWebRedirect(current, "/guia", 0).hostname).toBe(
      "asodef.com.co",
    );
    expect(() =>
      validateKnowledgeWebRedirect(current, "https://127.0.0.1/admin", 0),
    ).toThrow("allowlist");
    expect(() => validateKnowledgeWebRedirect(current, "/otra", 3)).toThrow(
      "redirects",
    );
  });

  it("valida tipo y tamaño declarado y mantiene un límite streaming", () => {
    expect(
      validateKnowledgeWebResponse("text/html; charset=utf-8", "100"),
    ).toBe("text/html");
    expect(() =>
      validateKnowledgeWebResponse("application/zip", "100"),
    ).toThrow("contenido");
    expect(() =>
      validateKnowledgeWebResponse(
        "text/html",
        String(KNOWLEDGE_WEB_IMPORT_LIMITS.maximumBytes + 1),
      ),
    ).toThrow("tamaño");
    expect(() =>
      assertKnowledgeWebChunkWithinLimit(
        KNOWLEDGE_WEB_IMPORT_LIMITS.maximumBytes - 2,
        3,
      ),
    ).toThrow("excede");
  });

  it("rechaza límites solicitados fuera de la política", () => {
    expect(() =>
      validateKnowledgeWebImportRequest({
        url: "https://asodef.com.co/guia",
        language: "es",
        timeoutMs: KNOWLEDGE_WEB_IMPORT_LIMITS.maximumTimeoutMs + 1,
      }),
    ).toThrow("timeout");
  });

  it("no realiza red y permanece DEFERRED hasta disponer de DNS pinning", async () => {
    const transport = new DeferredKnowledgeWebImportTransport();
    expect(transport.status).toBe(KNOWLEDGE_WEB_IMPORT_STATUS);
    await expect(transport.fetch()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
