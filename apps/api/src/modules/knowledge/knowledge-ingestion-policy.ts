import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";

export const KNOWLEDGE_INGESTION_LIMITS = Object.freeze({
  manualBytes: 256 * 1024,
  fileBytes: 10 * 1024 * 1024,
  fileNameCharacters: 180,
});

export const KNOWLEDGE_FILE_FORMATS = [
  "MARKDOWN",
  "TEXT",
  "PDF",
  "DOCX",
] as const;
export type KnowledgeFileFormat = (typeof KNOWLEDGE_FILE_FORMATS)[number];

export interface ManualKnowledgeInput {
  kind: "MANUAL";
  language: string;
  content: string;
}

export interface KnowledgeFileInput {
  kind: "FILE";
  language: string;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
}

export interface ValidatedManualKnowledge {
  kind: "MANUAL";
  language: "es";
  format: "MARKDOWN";
  content: string;
  checksumSha256: string;
  byteSize: number;
}

export interface ValidatedKnowledgeFile {
  kind: "FILE";
  language: "es";
  format: KnowledgeFileFormat;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  checksumSha256: string;
  byteSize: number;
  preferredFormat: boolean;
}

const FILE_TYPES: Readonly<
  Record<string, { format: KnowledgeFileFormat; mimeTypes: readonly string[] }>
> = Object.freeze({
  ".md": { format: "MARKDOWN", mimeTypes: ["text/markdown", "text/plain"] },
  ".txt": { format: "TEXT", mimeTypes: ["text/plain"] },
  ".pdf": { format: "PDF", mimeTypes: ["application/pdf"] },
  ".docx": {
    format: "DOCX",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
});

export function validateManualKnowledge(
  input: ManualKnowledgeInput,
): ValidatedManualKnowledge {
  assertSpanish(input.language);
  const content = normalizeText(input.content);
  const byteSize = Buffer.byteLength(content, "utf8");
  if (byteSize === 0 || byteSize > KNOWLEDGE_INGESTION_LIMITS.manualBytes) {
    throw invalid("El contenido manual excede el límite permitido.");
  }
  assertSafeText(content);
  return {
    kind: "MANUAL",
    language: "es",
    format: "MARKDOWN",
    content,
    checksumSha256: sha256(Buffer.from(content, "utf8")),
    byteSize,
  };
}

export function validateKnowledgeFile(
  input: KnowledgeFileInput,
): ValidatedKnowledgeFile {
  assertSpanish(input.language);
  const originalName = input.originalName.normalize("NFC").trim();
  assertSafeFileName(originalName);
  if (
    input.bytes.length === 0 ||
    input.bytes.length > KNOWLEDGE_INGESTION_LIMITS.fileBytes
  ) {
    throw invalid("El archivo excede el límite permitido.");
  }

  const extension = extensionOf(originalName);
  const type = FILE_TYPES[extension];
  if (!type) {
    throw invalid("El formato del archivo no está permitido.");
  }
  const mimeType = input.mimeType.trim().toLowerCase().split(";", 1)[0] ?? "";
  if (!type.mimeTypes.includes(mimeType)) {
    throw invalid("El tipo MIME no coincide con el formato permitido.");
  }
  assertMagic(type.format, input.bytes);
  if (type.format === "TEXT" || type.format === "MARKDOWN") {
    assertSafeText(decodeUtf8(input.bytes));
  }

  return {
    kind: "FILE",
    language: "es",
    format: type.format,
    originalName,
    mimeType,
    bytes: Buffer.from(input.bytes),
    checksumSha256: sha256(input.bytes),
    byteSize: input.bytes.length,
    preferredFormat: type.format === "MARKDOWN",
  };
}

export function decodeUtf8(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .normalize("NFC");
  } catch {
    throw invalid("El archivo de texto no contiene UTF-8 válido.");
  }
}

export function assertSafeText(content: string): void {
  for (const character of content) {
    const point = character.codePointAt(0) ?? 0;
    if (
      (point < 32 && point !== 9 && point !== 10 && point !== 13) ||
      point === 127
    ) {
      throw invalid(
        "El contenido contiene caracteres de control no permitidos.",
      );
    }
  }
}

function assertSpanish(language: string): void {
  const normalized = language.trim().toLowerCase();
  if (normalized !== "es" && !/^es-[a-z]{2}$/u.test(normalized)) {
    throw invalid(
      "La ingestión de conocimiento solo admite contenido en español.",
    );
  }
}

function assertSafeFileName(name: string): void {
  if (
    !name ||
    name.length > KNOWLEDGE_INGESTION_LIMITS.fileNameCharacters ||
    /[/\\\0]/u.test(name)
  ) {
    throw invalid("El nombre del archivo no es válido.");
  }
  assertSafeText(name);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 1 ? "" : name.slice(dot).toLowerCase();
}

function assertMagic(format: KnowledgeFileFormat, bytes: Buffer): void {
  if (format === "PDF" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw invalid("La firma del archivo PDF no es válida.");
  }
  if (
    format === "DOCX" &&
    !["504b0304", "504b0506", "504b0708"].includes(
      bytes.subarray(0, 4).toString("hex"),
    )
  ) {
    throw invalid("La firma del archivo DOCX no es válida.");
  }
}

function normalizeText(content: string): string {
  return content.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function invalid(message: string): BadRequestException {
  return new BadRequestException(message);
}
