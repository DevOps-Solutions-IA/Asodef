import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  assertSafeText,
  decodeUtf8,
  type KnowledgeFileFormat,
  type ValidatedKnowledgeFile,
} from "./knowledge-ingestion-policy";

const MAX_CHUNK_CHARACTERS = 1_200;
const CHUNK_OVERLAP_CHARACTERS = 120;

export interface ParsedKnowledgeChunk {
  ordinal: number;
  content: string;
  tokenEstimate: number;
  metadata: Record<string, string>;
}

export interface BinaryKnowledgeParser {
  readonly format: "PDF" | "DOCX";
  readonly name: string;
  readonly version: string;
  parseText(bytes: Buffer): Promise<string>;
}

export interface ParsedKnowledgeDocument {
  content: string;
  parser: string;
  parserVersion: string;
  chunks: ParsedKnowledgeChunk[];
}

export function parseKnowledgeContent(
  content: string,
  contentType: "TEXT" | "MARKDOWN" | "JSON",
): string {
  const normalized = contentType === "JSON" ? parseJson(content) : content;
  const plain =
    contentType === "MARKDOWN" ? markdownToText(normalized) : normalized;
  return normalizeParsedText(plain);
}

export async function parseValidatedKnowledgeFile(
  file: ValidatedKnowledgeFile,
  binaryParsers: readonly BinaryKnowledgeParser[] = [],
): Promise<ParsedKnowledgeDocument> {
  if (file.format === "TEXT" || file.format === "MARKDOWN") {
    const content = parseKnowledgeContent(decodeUtf8(file.bytes), file.format);
    return {
      content,
      parser: file.format === "MARKDOWN" ? "asodef-markdown" : "asodef-text",
      parserVersion: "v1",
      chunks: chunkKnowledgeContent(content),
    };
  }

  const parser = binaryParsers.find(
    (candidate) => candidate.format === file.format,
  );
  if (!parser) {
    throw new ServiceUnavailableException(
      `El parser ${file.format} no está configurado; la ingestión permanece deshabilitada.`,
    );
  }
  const content = normalizeParsedText(
    await parser.parseText(Buffer.from(file.bytes)),
  );
  return {
    content,
    parser: parser.name,
    parserVersion: parser.version,
    chunks: chunkKnowledgeContent(content),
  };
}

export function chunkKnowledgeContent(content: string): ParsedKnowledgeChunk[] {
  const chunks: ParsedKnowledgeChunk[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + MAX_CHUNK_CHARACTERS, content.length);
    if (end < content.length) {
      const paragraph = content.lastIndexOf("\n\n", end);
      const sentence = content.lastIndexOf(". ", end);
      const boundary = Math.max(paragraph, sentence);
      if (boundary > start + Math.floor(MAX_CHUNK_CHARACTERS / 2)) {
        end = boundary + 1;
      }
    }
    const text = content.slice(start, end).trim();
    if (text) {
      chunks.push({
        ordinal: chunks.length,
        content: text,
        tokenEstimate: Math.ceil(text.length / 4),
        metadata: {
          startCharacter: String(start),
          endCharacter: String(end),
        },
      });
    }
    if (end >= content.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARACTERS, start + 1);
  }
  return chunks;
}

function markdownToText(content: string): string {
  return content
    .replace(/^---\n[\s\S]*?\n---(?:\n|$)/u, "")
    .replace(/```[^\n]*\n([\s\S]*?)```/gu, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/^#{1,6}[ \t]+/gmu, "")
    .replace(/^>[ \t]?/gmu, "")
    .replace(/<[^>\n]+>/gu, "")
    .replace(/[*_~`]+/gu, "");
}

function parseJson(content: string): string {
  try {
    return flattenJson(JSON.parse(content) as unknown).join("\n");
  } catch {
    throw new BadRequestException("El contenido JSON no es válido.");
  }
}

function flattenJson(value: unknown, path = "root"): string[] {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [`${path}: ${String(value)}`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      flattenJson(item, `${path}[${index}]`),
    );
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, item]) => flattenJson(item, `${path}.${key}`),
    );
  }
  return [];
}

function normalizeParsedText(content: string): string {
  const result = content
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  assertSafeText(result);
  if (!result) {
    throw new BadRequestException("El contenido no produce texto indexable.");
  }
  return result;
}

export function isBinaryKnowledgeFormat(
  format: KnowledgeFileFormat,
): format is "PDF" | "DOCX" {
  return format === "PDF" || format === "DOCX";
}
