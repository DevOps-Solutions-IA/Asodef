import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";

export const KNOWLEDGE_WEB_IMPORT_STATUS =
  "DEFERRED_DNS_PINNING_REQUIRED" as const;
export const KNOWLEDGE_WEB_IMPORT_LIMITS = Object.freeze({
  timeoutMs: 10_000,
  maximumTimeoutMs: 15_000,
  maximumRedirects: 3,
  maximumBytes: 10 * 1024 * 1024,
});

export const KNOWLEDGE_WEB_IMPORT_ALLOWED_HOSTS = Object.freeze([
  "asodef.com.co",
  "www.asodef.com.co",
] as const);

export const KNOWLEDGE_WEB_IMPORT_CONTENT_TYPES = Object.freeze([
  "text/html",
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const);

export interface KnowledgeWebImportRequest {
  url: string;
  language: string;
  timeoutMs?: number;
  maximumBytes?: number;
  maximumRedirects?: number;
}

export interface ValidatedKnowledgeWebImportRequest {
  url: URL;
  language: "es";
  timeoutMs: number;
  maximumBytes: number;
  maximumRedirects: number;
}

export interface KnowledgeWebImportTransport {
  readonly status: typeof KNOWLEDGE_WEB_IMPORT_STATUS;
  fetch(): Promise<never>;
}

export class DeferredKnowledgeWebImportTransport implements KnowledgeWebImportTransport {
  readonly status = KNOWLEDGE_WEB_IMPORT_STATUS;

  fetch(): Promise<never> {
    return Promise.reject(
      new ServiceUnavailableException(
        "La importación web está deshabilitada hasta disponer de resolución DNS con pinning verificable.",
      ),
    );
  }
}

export function validateKnowledgeWebImportRequest(
  input: KnowledgeWebImportRequest,
): ValidatedKnowledgeWebImportRequest {
  const language = input.language.trim().toLowerCase();
  if (language !== "es" && !/^es-[a-z]{2}$/u.test(language)) {
    throw invalid("La importación web solo admite contenido en español.");
  }
  const url = validateOfficialUrl(input.url);
  return {
    url,
    language: "es",
    timeoutMs: boundedInteger(
      input.timeoutMs ?? KNOWLEDGE_WEB_IMPORT_LIMITS.timeoutMs,
      1,
      KNOWLEDGE_WEB_IMPORT_LIMITS.maximumTimeoutMs,
      "timeout",
    ),
    maximumBytes: boundedInteger(
      input.maximumBytes ?? KNOWLEDGE_WEB_IMPORT_LIMITS.maximumBytes,
      1,
      KNOWLEDGE_WEB_IMPORT_LIMITS.maximumBytes,
      "tamaño",
    ),
    maximumRedirects: boundedInteger(
      input.maximumRedirects ?? KNOWLEDGE_WEB_IMPORT_LIMITS.maximumRedirects,
      0,
      KNOWLEDGE_WEB_IMPORT_LIMITS.maximumRedirects,
      "redirects",
    ),
  };
}

export function validateKnowledgeWebRedirect(
  currentUrl: URL,
  location: string,
  redirectCount: number,
  maximumRedirects = KNOWLEDGE_WEB_IMPORT_LIMITS.maximumRedirects,
): URL {
  if (!Number.isSafeInteger(redirectCount) || redirectCount < 0) {
    throw invalid("El contador de redirects no es válido.");
  }
  if (redirectCount >= maximumRedirects) {
    throw invalid("La importación excedió el límite de redirects.");
  }
  let resolved: URL;
  try {
    resolved = new URL(location, currentUrl);
  } catch {
    throw invalid("El redirect recibido no contiene una URL válida.");
  }
  return validateOfficialUrl(resolved.toString());
}

export function validateKnowledgeWebResponse(
  contentTypeHeader: string | null,
  contentLengthHeader: string | null,
  maximumBytes = KNOWLEDGE_WEB_IMPORT_LIMITS.maximumBytes,
): string {
  const contentType = (contentTypeHeader ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (
    !contentType ||
    !(KNOWLEDGE_WEB_IMPORT_CONTENT_TYPES as readonly string[]).includes(
      contentType,
    )
  ) {
    throw invalid("El tipo de contenido remoto no está permitido.");
  }
  if (contentLengthHeader !== null) {
    const length = Number(contentLengthHeader);
    if (!Number.isSafeInteger(length) || length < 0 || length > maximumBytes) {
      throw invalid("El tamaño declarado por el sitio remoto no es válido.");
    }
  }
  return contentType;
}

export function assertKnowledgeWebChunkWithinLimit(
  bytesRead: number,
  nextChunkBytes: number,
  maximumBytes = KNOWLEDGE_WEB_IMPORT_LIMITS.maximumBytes,
): void {
  if (
    !Number.isSafeInteger(bytesRead) ||
    !Number.isSafeInteger(nextChunkBytes) ||
    bytesRead < 0 ||
    nextChunkBytes < 0 ||
    bytesRead + nextChunkBytes > maximumBytes
  ) {
    throw invalid("La respuesta remota excede el límite permitido.");
  }
}

function validateOfficialUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid("La URL oficial no es válida.");
  }
  if (url.protocol !== "https:") {
    throw invalid("La importación oficial requiere HTTPS.");
  }
  if (url.username || url.password) {
    throw invalid("La URL oficial no puede contener credenciales.");
  }
  if (url.port && url.port !== "443") {
    throw invalid("La URL oficial no puede usar un puerto no autorizado.");
  }
  if (url.hash) {
    throw invalid("La URL oficial no puede contener fragmentos.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    !(KNOWLEDGE_WEB_IMPORT_ALLOWED_HOSTS as readonly string[]).includes(
      hostname,
    )
  ) {
    throw invalid("El host no pertenece a la allowlist oficial.");
  }
  url.hostname = hostname;
  return url;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw invalid(`El límite de ${field} no es válido.`);
  }
  return value;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException(message);
}
