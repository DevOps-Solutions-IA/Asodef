import type { PublicContract } from "./contract";
import { MINIMIZED_AUDIT } from "./contract";
import type {
  CommunicationPurpose,
  CommunicationTransport,
} from "./communications";

export const MANAGED_CONFIGURATION_LIFECYCLE = [
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "RETIRED",
  "ROLLED_BACK",
] as const;
export type ManagedConfigurationLifecycle =
  (typeof MANAGED_CONFIGURATION_LIFECYCLE)[number];

export interface CommunicationTemplate {
  id: string;
  key: string;
  name: string;
  transport: CommunicationTransport;
  purpose: CommunicationPurpose;
  currentVersionId: string | null;
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  version: number;
  status: ManagedConfigurationLifecycle;
  declaredVariables: readonly string[];
  subject: string | null;
  body: string;
  contentHash: string;
  createdBy: string;
  reviewedBy: string | null;
  publishedAt: string | null;
  retiredAt: string | null;
  rollbackOfVersionId: string | null;
}

export const TEMPLATE_TRANSITIONS: Readonly<
  Record<
    ManagedConfigurationLifecycle,
    readonly ManagedConfigurationLifecycle[]
  >
> = {
  DRAFT: ["REVIEW"],
  REVIEW: ["DRAFT", "PUBLISHED"],
  PUBLISHED: ["RETIRED", "ROLLED_BACK"],
  RETIRED: [],
  ROLLED_BACK: ["RETIRED"],
};

export function canTransitionTemplate(
  from: ManagedConfigurationLifecycle,
  to: ManagedConfigurationLifecycle,
): boolean {
  return TEMPLATE_TRANSITIONS[from].includes(to);
}

const VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const PLACEHOLDER = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;
const EXECUTABLE_SYNTAX = /{{{|}}}|{{\s*[#/>!]|<%|%>|\$\{|javascript:/i;
const FORBIDDEN_NAMES = new Set(["__proto__", "prototype", "constructor"]);

export type TemplateValidationResult =
  { valid: true } | { valid: false; errors: readonly string[] };

/** Validates a deliberately small interpolation language. Templates contain
 * text and declared scalar placeholders only—never helpers, expressions,
 * control flow, property traversal or executable code. */
export function validateTemplateDefinition(
  declaredVariables: readonly string[],
  subject: string | null,
  body: string,
): TemplateValidationResult {
  const errors: string[] = [];
  const unique = new Set(declaredVariables);
  if (unique.size !== declaredVariables.length)
    errors.push("TEMPLATE_VARIABLE_DUPLICATE");
  if (
    declaredVariables.some(
      (name) => !VARIABLE_NAME.test(name) || FORBIDDEN_NAMES.has(name),
    )
  ) {
    errors.push("TEMPLATE_VARIABLE_NAME_INVALID");
  }
  const content = `${subject ?? ""}\n${body}`;
  if (EXECUTABLE_SYNTAX.test(content))
    errors.push("TEMPLATE_EXECUTABLE_SYNTAX_FORBIDDEN");

  const referenced = new Set<string>();
  for (const match of content.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (name) referenced.add(name);
  }
  if ([...referenced].some((name) => !unique.has(name)))
    errors.push("TEMPLATE_VARIABLE_UNDECLARED");
  if ([...unique].some((name) => !referenced.has(name)))
    errors.push("TEMPLATE_VARIABLE_UNUSED");
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export interface TemplatePreviewInput {
  templateVersionId: string;
  variables: Readonly<Record<string, string>>;
}

export interface TemplatePreviewOutput {
  templateVersionId: string;
  subject: string | null;
  body: string;
  contentHash: string;
}

export const TEMPLATE_PREVIEW_CONTRACT: PublicContract<
  TemplatePreviewInput,
  TemplatePreviewOutput
> = {
  name: "communications.templates.preview",
  version: "1.0.0",
  inputSchema: {
    $id: "asodef.connect.communications.templates.preview.input.v1",
    type: "object",
    required: ["templateVersionId", "variables"],
    properties: {
      templateVersionId: { type: "string", format: "uuid" },
      variables: { type: "object" },
    },
    additionalProperties: false,
  },
  outputSchema: {
    $id: "asodef.connect.communications.templates.preview.output.v1",
    type: "object",
    required: ["templateVersionId", "subject", "body", "contentHash"],
    properties: {
      templateVersionId: { type: "string", format: "uuid" },
      subject: { type: ["string", "null"] },
      body: { type: "string" },
      contentHash: { type: "string", pattern: "^sha256:" },
    },
    additionalProperties: false,
  },
  errors: [
    {
      code: "TEMPLATE_NOT_FOUND",
      retryable: false,
      description: "Template version does not exist or is not visible.",
    },
    {
      code: "TEMPLATE_VARIABLES_INVALID",
      retryable: false,
      description: "Variables do not exactly match declarations.",
    },
    {
      code: "TEMPLATE_UNSAFE",
      retryable: false,
      description: "Template violates the non-executable grammar.",
    },
  ],
  permissions: ["communications.templates.preview"],
  audit: MINIMIZED_AUDIT,
  idempotency: {
    required: false,
    scope: "read-only preview",
    duplicateBehavior: "No state change.",
    retention:
      "Not applicable; audit metadata follows administrative audit retention.",
  },
};
