import { createHash } from "node:crypto";
import {
  KNOWLEDGE_INGESTION_LIMITS,
  validateKnowledgeFile,
  validateManualKnowledge,
} from "./knowledge-ingestion-policy";

describe("knowledge ingestion policy", () => {
  it("normaliza contenido manual español y calcula el checksum server-side", () => {
    const result = validateManualKnowledge({
      kind: "MANUAL",
      language: "es-CO",
      content: "  # Guía\r\n\r\nContenido institucional.  ",
    });

    expect(result).toMatchObject({
      kind: "MANUAL",
      language: "es",
      format: "MARKDOWN",
      content: "# Guía\n\nContenido institucional.",
    });
    expect(result.checksumSha256).toBe(
      createHash("sha256").update(result.content).digest("hex"),
    );
  });

  it.each(["en", "pt-BR", "", "spanish"])(
    "rechaza el idioma no español %j",
    (language) => {
      expect(() =>
        validateManualKnowledge({
          kind: "MANUAL",
          language,
          content: "Contenido",
        }),
      ).toThrow("solo admite contenido en español");
    },
  );

  it("rechaza contenido manual vacío, excesivo y con controles", () => {
    expect(() =>
      validateManualKnowledge({
        kind: "MANUAL",
        language: "es",
        content: "  ",
      }),
    ).toThrow();
    expect(() =>
      validateManualKnowledge({
        kind: "MANUAL",
        language: "es",
        content: "a".repeat(KNOWLEDGE_INGESTION_LIMITS.manualBytes + 1),
      }),
    ).toThrow("límite");
    expect(() =>
      validateManualKnowledge({
        kind: "MANUAL",
        language: "es",
        content: "texto\u0000oculto",
      }),
    ).toThrow("control");
  });

  it.each([
    ["guia.md", "text/markdown", Buffer.from("# Guía"), "MARKDOWN", true],
    ["guia.txt", "text/plain", Buffer.from("Guía"), "TEXT", false],
    ["guia.pdf", "application/pdf", Buffer.from("%PDF-1.7\n"), "PDF", false],
    [
      "guia.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      Buffer.from("504b0304", "hex"),
      "DOCX",
      false,
    ],
  ] as const)(
    "acepta %s con extensión, MIME y firma coherentes",
    (originalName, mimeType, bytes, format, preferredFormat) => {
      expect(
        validateKnowledgeFile({
          kind: "FILE",
          language: "es",
          originalName,
          mimeType,
          bytes,
        }),
      ).toMatchObject({ format, preferredFormat, byteSize: bytes.length });
    },
  );

  it("rechaza spoofing de extensión, MIME y firma", () => {
    expect(() =>
      validateKnowledgeFile({
        kind: "FILE",
        language: "es",
        originalName: "guia.pdf",
        mimeType: "text/plain",
        bytes: Buffer.from("%PDF-1.7"),
      }),
    ).toThrow("MIME");
    expect(() =>
      validateKnowledgeFile({
        kind: "FILE",
        language: "es",
        originalName: "guia.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("contenido plano"),
      }),
    ).toThrow("firma");
    expect(() =>
      validateKnowledgeFile({
        kind: "FILE",
        language: "es",
        originalName: "guia.exe",
        mimeType: "application/octet-stream",
        bytes: Buffer.from("MZ"),
      }),
    ).toThrow("formato");
  });

  it("rechaza traversal, UTF-8 inválido y archivos fuera del límite", () => {
    expect(() =>
      validateKnowledgeFile({
        kind: "FILE",
        language: "es",
        originalName: "../guia.md",
        mimeType: "text/markdown",
        bytes: Buffer.from("# Guía"),
      }),
    ).toThrow("nombre");
    expect(() =>
      validateKnowledgeFile({
        kind: "FILE",
        language: "es",
        originalName: "guia.txt",
        mimeType: "text/plain",
        bytes: Buffer.from([0xc3, 0x28]),
      }),
    ).toThrow("UTF-8");
    expect(() =>
      validateKnowledgeFile({
        kind: "FILE",
        language: "es",
        originalName: "guia.md",
        mimeType: "text/markdown",
        bytes: Buffer.alloc(KNOWLEDGE_INGESTION_LIMITS.fileBytes + 1, 65),
      }),
    ).toThrow("límite");
  });
});
