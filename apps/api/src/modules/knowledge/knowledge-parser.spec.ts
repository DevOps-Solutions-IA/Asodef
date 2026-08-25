import { ServiceUnavailableException } from "@nestjs/common";
import { validateKnowledgeFile } from "./knowledge-ingestion-policy";
import {
  chunkKnowledgeContent,
  parseKnowledgeContent,
  parseValidatedKnowledgeFile,
  type BinaryKnowledgeParser,
} from "./knowledge-parser";

describe("knowledge parser", () => {
  it("convierte Markdown español en texto determinista", () => {
    expect(
      parseKnowledgeContent(
        "---\ntitle: guía\n---\n# Cobertura\n\n[Consulta](https://asodef.com.co) **vigente**.",
        "MARKDOWN",
      ),
    ).toBe("Cobertura\n\nConsulta vigente.");
  });

  it("crea chunks ordenados, acotados y con overlap determinista", () => {
    const chunks = chunkKnowledgeContent("A".repeat(2_800));
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.map(({ ordinal }) => ordinal)).toEqual(
      chunks.map((_, index) => index),
    );
    expect(
      chunks.every(
        ({ content, tokenEstimate }) =>
          content.length <= 1_200 &&
          tokenEstimate === Math.ceil(content.length / 4),
      ),
    ).toBe(true);
    expect(chunks[1]?.metadata.startCharacter).toBe("1080");
  });

  it("falla cerrado para PDF y DOCX cuando no hay parser runtime", async () => {
    const pdf = validateKnowledgeFile({
      kind: "FILE",
      language: "es",
      originalName: "guia.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.7"),
    });
    await expect(parseValidatedKnowledgeFile(pdf)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("usa únicamente un adapter binario explícito y conserva su provenance", async () => {
    const pdf = validateKnowledgeFile({
      kind: "FILE",
      language: "es",
      originalName: "guia.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.7"),
    });
    const parser: BinaryKnowledgeParser = {
      format: "PDF",
      name: "parser-prueba",
      version: "1.0.0",
      parseText: jest.fn().mockResolvedValue("Contenido extraído en español."),
    };

    await expect(
      parseValidatedKnowledgeFile(pdf, [parser]),
    ).resolves.toMatchObject({
      content: "Contenido extraído en español.",
      parser: "parser-prueba",
      parserVersion: "1.0.0",
      chunks: [{ ordinal: 0 }],
    });
    expect(parser.parseText).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it("rechaza salida vacía o con controles aun si proviene de un adapter", async () => {
    const docx = validateKnowledgeFile({
      kind: "FILE",
      language: "es",
      originalName: "guia.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: Buffer.from("504b0304", "hex"),
    });
    const parser: BinaryKnowledgeParser = {
      format: "DOCX",
      name: "parser-prueba",
      version: "1",
      parseText: async () => "\u0000",
    };
    await expect(parseValidatedKnowledgeFile(docx, [parser])).rejects.toThrow(
      "control",
    );
  });
});
