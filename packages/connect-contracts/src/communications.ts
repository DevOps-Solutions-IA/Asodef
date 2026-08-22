import type { JsonValue, PublicContract } from "./contract";
import { MINIMIZED_AUDIT } from "./contract";

export const COMMUNICATION_CHANNELS = [
  "EMAIL",
  "WHATSAPP",
  "WEB_NOTIFICATION",
  "FUTURE",
] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];
/** Transport remains an internal delivery term; public requests use channel. */
export type CommunicationTransport = CommunicationChannel;
export const COMMUNICATION_TRANSPORTS = COMMUNICATION_CHANNELS;

/** Reconciled with PR #20's governed AI gateway vocabulary. */
export const CONNECT_DATA_CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "PERSONAL",
  "SENSITIVE",
  "HIGHLY_SENSITIVE",
] as const;
export type ConnectDataClassification =
  (typeof CONNECT_DATA_CLASSIFICATIONS)[number];
export type CommunicationPurpose = "TRANSACTIONAL" | "MARKETING";
export type CommunicationStatus =
  | "REQUESTED"
  | "SUPPRESSED"
  | "QUEUED"
  | "DELIVERED"
  | "FAILED"
  | "UNKNOWN_RESULT"
  | "DEAD_LETTER";

export const TRANSPORT_AVAILABILITY: Readonly<
  Record<CommunicationTransport, "REAL_EXISTING_ADAPTER" | "CONTRACT_ONLY">
> = {
  EMAIL: "REAL_EXISTING_ADAPTER",
  WHATSAPP: "CONTRACT_ONLY",
  WEB_NOTIFICATION: "CONTRACT_ONLY",
  FUTURE: "CONTRACT_ONLY",
};

export interface Communication {
  id: string;
  requestId: string;
  status: CommunicationStatus;
  purpose: CommunicationPurpose;
  transport: CommunicationTransport;
  templateKey: string;
  templateVersion: number;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  requestedBy: string;
  requestedAt: string;
  completedAt: string | null;
  failureReason: string | null;
}

export interface CommunicationRecipient {
  id: string;
  communicationId: string;
  recipientType: "TO" | "CC" | "BCC";
  address: string;
  subjectType: string | null;
  subjectId: string | null;
  preferenceDecision: "ALLOWED" | "SUPPRESSED";
  decisionReason: string;
}

export interface DeliveryAttempt {
  id: string;
  communicationRecipientId: string;
  attempt: number;
  status:
    | "PROCESSING"
    | "DELIVERED"
    | "RETRY_PENDING"
    | "FAILED"
    | "UNKNOWN_RESULT"
    | "DEAD_LETTER";
  providerMessageId: string | null;
  failureReason: string | null;
  nextAttemptAt: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface CommunicationPreference {
  id: string;
  subjectType: string;
  subjectId: string;
  transport: CommunicationTransport;
  purpose: CommunicationPurpose;
  status: "GRANTED" | "DENIED" | "SUPPRESSED";
  consentRecordId: string | null;
  effectiveAt: string;
}

export interface CommunicationAddress {
  type: "TO" | "CC" | "BCC";
  address: string;
  subjectType?: string;
  subjectId?: string;
}

export interface CommunicationConsentRequirement {
  basis:
    | "TRANSACTIONAL_NECESSITY"
    | "LEGAL_OBLIGATION"
    | "CONTRACT"
    | "EXPLICIT_CONSENT";
  purposeKey: string | null;
  consentRecordId: string | null;
}

/** Business payload accepted from Tool Gateway. Actor, authorization and trace
 * identity are deliberately absent: Koral cannot assert trusted context. */
export interface CommunicationsSendRequest {
  version: "v1";
  requestId: string;
  idempotencyKey: string;
  channel: CommunicationChannel;
  purpose: CommunicationPurpose;
  dataClassification: ConnectDataClassification;
  consentRequirement: CommunicationConsentRequirement;
  template: { key: string; version: number };
  recipients: readonly CommunicationAddress[];
  variables: Readonly<Record<string, JsonValue>>;
  testMode: boolean;
}

/** Server-authenticated context supplied independently by Tool Gateway or the
 * automation runner. Implementations must never deserialize this from LLM
 * arguments or copy it from CommunicationsSendRequest. */
export interface CommunicationsInvocationContext {
  actorId: string;
  actorType: "KORAL" | "HUMAN_AGENT" | "AUTOMATION" | "SYSTEM";
  permissions: readonly string[];
  identityLevel: "AUTHENTICATED" | "MFA_VERIFIED" | "STEP_UP_VERIFIED";
  correlationId: string;
  causationId: string | null;
  consentVerified: boolean;
  confirmationGranted: boolean;
  rateLimitAllowed: boolean;
}

export type CommunicationsSendInput = CommunicationsSendRequest;

export interface CommunicationsSendOutput {
  version: "v1";
  communicationId: string;
  disposition: "QUEUED" | "SUPPRESSED" | "DUPLICATE";
  recipientResults: readonly {
    recipientIndex: number;
    disposition: "QUEUED" | "SUPPRESSED";
    reasonCode: string;
  }[];
  deliveryResult:
    | { status: "QUEUED"; terminal: false }
    | { status: "SUPPRESSED"; terminal: true };
  auditResult: { recorded: true; auditReference: string };
  replayed: boolean;
}

export const COMMUNICATIONS_SEND_CONTRACT: PublicContract<
  CommunicationsSendInput,
  CommunicationsSendOutput
> = {
  name: "communications.send",
  version: "1.0.0",
  inputSchema: {
    $id: "asodef.connect.communications.send.input.v1",
    type: "object",
    required: [
      "version",
      "requestId",
      "idempotencyKey",
      "channel",
      "purpose",
      "dataClassification",
      "consentRequirement",
      "template",
      "recipients",
      "variables",
      "testMode",
    ],
    properties: {
      version: { type: "string", const: "v1" },
      requestId: { type: "string", minLength: 1, maxLength: 200 },
      idempotencyKey: { type: "string", minLength: 1, maxLength: 200 },
      channel: { type: "string", enum: [...COMMUNICATION_CHANNELS] },
      purpose: { type: "string", enum: ["TRANSACTIONAL", "MARKETING"] },
      dataClassification: {
        type: "string",
        enum: [...CONNECT_DATA_CLASSIFICATIONS],
      },
      consentRequirement: {
        type: "object",
        required: ["basis", "purposeKey", "consentRecordId"],
        properties: {
          basis: {
            type: "string",
            enum: [
              "TRANSACTIONAL_NECESSITY",
              "LEGAL_OBLIGATION",
              "CONTRACT",
              "EXPLICIT_CONSENT",
            ],
          },
          purposeKey: { type: ["string", "null"], maxLength: 120 },
          consentRecordId: { type: ["string", "null"], format: "uuid" },
        },
        additionalProperties: false,
      },
      template: {
        type: "object",
        required: ["key", "version"],
        properties: {
          key: { type: "string", minLength: 1 },
          version: { type: "integer", minimum: 1 },
        },
        additionalProperties: false,
      },
      recipients: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: {
          type: "object",
          required: ["type", "address"],
          properties: {
            type: { type: "string", enum: ["TO", "CC", "BCC"] },
            address: { type: "string", minLength: 1, maxLength: 320 },
            subjectType: { type: "string", minLength: 1, maxLength: 100 },
            subjectId: { type: "string", minLength: 1, maxLength: 200 },
          },
          additionalProperties: false,
        },
      },
      variables: { type: "object" },
      testMode: { type: "boolean" },
    },
    additionalProperties: false,
  },
  outputSchema: {
    $id: "asodef.connect.communications.send.output.v1",
    type: "object",
    required: [
      "version",
      "communicationId",
      "disposition",
      "recipientResults",
      "deliveryResult",
      "auditResult",
      "replayed",
    ],
    properties: {
      version: { type: "string", const: "v1" },
      communicationId: { type: "string", format: "uuid" },
      disposition: {
        type: "string",
        enum: ["QUEUED", "SUPPRESSED", "DUPLICATE"],
      },
      recipientResults: { type: "array" },
      deliveryResult: {
        oneOf: [
          {
            type: "object",
            required: ["status", "terminal"],
            properties: {
              status: { type: "string", const: "QUEUED" },
              terminal: { type: "boolean", const: false },
            },
            additionalProperties: false,
          },
          {
            type: "object",
            required: ["status", "terminal"],
            properties: {
              status: { type: "string", const: "SUPPRESSED" },
              terminal: { type: "boolean", const: true },
            },
            additionalProperties: false,
          },
        ],
      },
      auditResult: {
        type: "object",
        required: ["recorded", "auditReference"],
        properties: {
          recorded: { type: "boolean", const: true },
          auditReference: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
      replayed: { type: "boolean" },
    },
    additionalProperties: false,
  },
  errors: [
    {
      code: "COMMUNICATION_INPUT_INVALID",
      retryable: false,
      description: "Request does not match the versioned contract.",
    },
    {
      code: "TEMPLATE_NOT_PUBLISHED",
      retryable: false,
      description: "Template version is not PUBLISHED.",
    },
    {
      code: "TEMPLATE_VARIABLES_INVALID",
      retryable: false,
      description: "Variables do not exactly match declarations.",
    },
    {
      code: "TRANSPORT_NOT_AVAILABLE",
      retryable: false,
      description: "Transport has a contract but no active adapter.",
    },
    {
      code: "CONSENT_REQUIRED",
      retryable: false,
      description: "Required communication consent is not currently granted.",
    },
    {
      code: "STEP_UP_REQUIRED",
      retryable: false,
      description: "Authorized test send requires fresh step-up.",
    },
    {
      code: "RATE_LIMITED",
      retryable: true,
      description: "Caller or recipient rate limit was exceeded.",
    },
    {
      code: "DELIVERY_STORE_UNAVAILABLE",
      retryable: true,
      description: "Durable outbox persistence is unavailable.",
    },
  ],
  permissions: [
    "communications.send",
    "communications.test-send when testMode=true",
  ],
  audit: {
    ...MINIMIZED_AUDIT,
    records: [
      ...MINIMIZED_AUDIT.records,
      "template/version",
      "channel",
      "purpose",
      "preference/consent decision",
      "delivery outcome",
    ],
  },
  idempotency: {
    required: true,
    scope: "trusted actorId + idempotencyKey",
    duplicateBehavior:
      "Return the original communicationId and recipient decisions; do not enqueue again.",
    retention:
      "At least the delivery, consent-evidence and audit retention period.",
  },
};

export interface CommunicationsServiceContract {
  send(
    request: CommunicationsSendRequest,
    context: CommunicationsInvocationContext,
  ): Promise<CommunicationsSendOutput>;
}

export function isConsentRequirementCompatible(
  purpose: CommunicationPurpose,
  requirement: CommunicationConsentRequirement,
): boolean {
  if (purpose === "MARKETING") {
    return (
      requirement.basis === "EXPLICIT_CONSENT" &&
      !!requirement.purposeKey?.trim() &&
      !!requirement.consentRecordId
    );
  }
  if (requirement.basis === "EXPLICIT_CONSENT") {
    return !!requirement.purposeKey?.trim() && !!requirement.consentRecordId;
  }
  return true;
}

/** PR #20 Tool Gateway integration descriptor. It remains REVIEW because the
 * canonical operation exists as a contract but no CommunicationsService
 * adapter over the existing notification outbox exists on main yet. */
export const COMMUNICATIONS_SEND_TOOL_BINDING = Object.freeze({
  name: "send_communication",
  operation: "communications.send",
  version: "v1",
  contractVersion: COMMUNICATIONS_SEND_CONTRACT.version,
  inputSchema: COMMUNICATIONS_SEND_CONTRACT.inputSchema,
  outputSchema: COMMUNICATIONS_SEND_CONTRACT.outputSchema,
  errors: COMMUNICATIONS_SEND_CONTRACT.errors,
  permission: "communications.send",
  minimumIdentityLevel: "MFA_VERIFIED",
  confirmationRequired: true,
  rateLimit: {
    policyKey: "ai:tool:send_communication",
    scope: "ACTOR_TOOL",
    failClosed: true,
  },
  idempotency: {
    required: true,
    keyField: "idempotencyKey",
    scope: "ACTOR_OPERATION",
    replay: "RETURN_ORIGINAL_RESPONSE",
  },
  timeout: { milliseconds: 10_000, maxAttempts: 1 },
  audit: {
    event: "ai.tool.send_communication",
    recordActor: true,
    recordTarget: true,
    recordResult: true,
    redactFields: ["recipients", "variables"],
  },
  dataClassification: "HIGHLY_SENSITIVE",
  status: "REVIEW",
  execution: {
    applicationServiceMethod: "CommunicationsService.send",
    directDataAccess: false,
    directTransportAccess: false,
    ownershipAndTenantScope: "APPLICATION_SERVICE_ENFORCED",
  },
  runtimeAvailability: "CONTRACT_ONLY",
} as const);

/** Guards the contract-only channels before any persistence or provider call. */
export function isTransportImplemented(
  transport: CommunicationTransport,
): boolean {
  return TRANSPORT_AVAILABILITY[transport] === "REAL_EXISTING_ADAPTER";
}
