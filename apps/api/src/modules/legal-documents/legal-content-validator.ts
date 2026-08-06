import { UnprocessableEntityException } from "@nestjs/common";
import { LEGAL_DOCUMENT_CATALOG } from "../../database/legal-document-catalog";

export interface LegalContentValidationIssue {
  path: string;
  code: "MALFORMED_CONTENT" | "MISSING_SECTIONS" | "EMPTY_HEADING" | "EMPTY_BODY" | "PLACEHOLDER" | "MISSING_REQUIRED_SECTION" | "NULL_APPROVED_CONTENT";
  message: string;
}

const PLACEHOLDER_PATTERNS = [
  /LEGAL_CONTENT_PLACEHOLDER/i,
  /Pendiente de confirmaci[oó]n legal/i,
  /\bpor definir\b/i,
  /\bTBD\b/,
  /\bTODO\b/,
  /lorem ipsum/i,
  /\[\s*(?:pendiente|placeholder|completar)\s*\]/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateLegalContent(content: unknown, documentType?: string, approved = false): LegalContentValidationIssue[] {
  const issues: LegalContentValidationIssue[] = [];
  if (approved && content == null) {
    return [{ path: "approvedContent", code: "NULL_APPROVED_CONTENT", message: "El contenido aprobado es obligatorio para publicar." }];
  }
  if (!isRecord(content)) {
    return [{ path: approved ? "approvedContent" : "draftContent", code: "MALFORMED_CONTENT", message: "El contenido legal debe ser un objeto JSON válido." }];
  }

  const sections = content.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    return [{ path: "sections", code: "MISSING_SECTIONS", message: "El documento debe contener al menos una sección." }];
  }

  const seenHeadings = new Set<string>();
  sections.forEach((rawSection, index) => {
    const path = `sections[${index}]`;
    if (!isRecord(rawSection)) {
      issues.push({ path, code: "MALFORMED_CONTENT", message: "La sección debe ser un objeto JSON válido." });
      return;
    }
    const heading = typeof rawSection.heading === "string" ? rawSection.heading.trim() : "";
    const body = typeof rawSection.body === "string" ? rawSection.body.trim() : "";
    if (!heading) issues.push({ path: `${path}.heading`, code: "EMPTY_HEADING", message: "El título de la sección es obligatorio." });
    else seenHeadings.add(heading);
    if (!body) issues.push({ path: `${path}.body`, code: "EMPTY_BODY", message: `La sección ${heading || index + 1} no tiene contenido.` });
    if (body && PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(body))) {
      issues.push({ path: `${path}.body`, code: "PLACEHOLDER", message: `La sección ${heading || index + 1} contiene un marcador no publicable.` });
    }
  });

  const expected = LEGAL_DOCUMENT_CATALOG.find((entry) => entry.type === documentType);
  for (const required of expected?.sections ?? []) {
    if (!seenHeadings.has(required.heading)) {
      issues.push({ path: "sections", code: "MISSING_REQUIRED_SECTION", message: `Falta la sección requerida: ${required.heading}.` });
    }
  }
  return issues;
}

export class LegalContentValidationException extends UnprocessableEntityException {
  constructor(issues: LegalContentValidationIssue[]) {
    super({
      statusCode: 422,
      code: "LEGAL_CONTENT_INCOMPLETE",
      message: "La versión contiene información incompleta y no puede avanzar en el flujo legal.",
      errors: issues,
    });
  }
}
