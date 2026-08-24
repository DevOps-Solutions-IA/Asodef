import type { ContractSchema, JsonObject, PublicContract } from "./shared";
import { MINIMIZED_AUDIT } from "./shared";

/** Legacy v1 vocabulary. It remains readable for compatibility and replay,
 * but new business producers must not emit these names. */
export const INITIAL_DOMAIN_EVENT_TYPES = [
  "LeadCreated",
  "OpportunityWon",
  "CompanyCreated",
  "PlanPublished",
  "ContractCreated",
  "ContractApproved",
  "ContractExpiring",
  "PaymentReceived",
  "PaymentFailed",
  "PqrCreated",
  "PqrResolved",
  "ConsentGranted",
  "ConversationEscalated",
  "CommunicationRequested",
  "CommunicationDelivered",
  "CommunicationFailed",
] as const;

export type LegacyDomainEventTypeV1 =
  (typeof INITIAL_DOMAIN_EVENT_TYPES)[number];

/** Canonical v2 vocabulary. Only events backed by an unambiguous business
 * mutation are registered. Deferred names are deliberately absent. */
export const CANONICAL_DOMAIN_EVENT_TYPES = [
  "lead.created",
  "company.created",
  "contract.created",
  "contract.version.created",
  "contract.cancelled",
  "payment.created",
  "payment.received",
  "payment.failed",
  "pqr.created",
  "pqr.assigned",
  "pqr.resolved",
  "consent.granted",
  "consent.revoked",
  "plan.version.published",
  "plan.retired",
] as const;

export type CanonicalDomainEventTypeV2 =
  (typeof CANONICAL_DOMAIN_EVENT_TYPES)[number];

/** Shared trigger vocabulary. An envelope still chooses exactly one version. */
export type DomainEventType =
  LegacyDomainEventTypeV1 | CanonicalDomainEventTypeV2;

export interface CanonicalDomainEventDefinition {
  eventType: CanonicalDomainEventTypeV2;
  schemaVersion: 1;
  aggregateType:
    "lead" | "company" | "contract" | "payment" | "pqr" | "consent" | "plan";
}

export const CANONICAL_DOMAIN_EVENT_REGISTRY = Object.freeze({
  "lead.created": definition("lead.created", "lead"),
  "company.created": definition("company.created", "company"),
  "contract.created": definition("contract.created", "contract"),
  "contract.version.created": definition(
    "contract.version.created",
    "contract",
  ),
  "contract.cancelled": definition("contract.cancelled", "contract"),
  "payment.created": definition("payment.created", "payment"),
  "payment.received": definition("payment.received", "payment"),
  "payment.failed": definition("payment.failed", "payment"),
  "pqr.created": definition("pqr.created", "pqr"),
  "pqr.assigned": definition("pqr.assigned", "pqr"),
  "pqr.resolved": definition("pqr.resolved", "pqr"),
  "consent.granted": definition("consent.granted", "consent"),
  "consent.revoked": definition("consent.revoked", "consent"),
  "plan.version.published": definition("plan.version.published", "plan"),
  "plan.retired": definition("plan.retired", "plan"),
} satisfies Record<CanonicalDomainEventTypeV2, CanonicalDomainEventDefinition>);

export const DEFERRED_DOMAIN_EVENT_TYPES = [
  "lead.updated",
  "lead.qualified",
  "lead.assigned",
  "company.approved",
  "company.updated",
  "contract.signed",
  "pqr.updated",
  "payment.overdue",
] as const;

export const DOMAIN_EVENT_ENVELOPE_EVOLUTION = Object.freeze({
  legacyV1: {
    contractVersion: "1.0.0",
    producerPolicy: "LEGACY_REPLAY_ONLY",
  },
  canonicalV2: {
    contractVersion: "2.0.0",
    producerPolicy: "EMIT_V2_ONLY",
  },
  persistenceMapping: {
    aggregateType: "subject_type",
    aggregateId: "subject_id",
    sanitizedPayload: "payload",
  },
});

export interface DomainEventEnvelopeV1<
  TPayload extends JsonObject = JsonObject,
> {
  eventId: string;
  eventType: LegacyDomainEventTypeV1;
  schemaVersion: number;
  occurredAt: string;
  producer: string;
  subjectType: string;
  subjectId: string;
  correlationId: string;
  causationId: string | null;
  idempotencyKey: string;
  payload: TPayload;
}

/** Backward-compatible name consumed by the already-integrated v1 runtime. */
export type DomainEventEnvelope<TPayload extends JsonObject = JsonObject> =
  DomainEventEnvelopeV1<TPayload>;

export interface DomainEventEnvelopeV2<
  TSanitizedPayload extends JsonObject = JsonObject,
> {
  eventId: string;
  eventType: CanonicalDomainEventTypeV2;
  schemaVersion: number;
  occurredAt: string;
  producer: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId: string | null;
  idempotencyKey: string;
  sanitizedPayload: TSanitizedPayload;
}

export const DOMAIN_EVENT_ENVELOPE_V1_SCHEMA: ContractSchema = {
  $id: "asodef.connect.domain-event-envelope.v1",
  type: "object",
  required: [
    "eventId",
    "eventType",
    "schemaVersion",
    "occurredAt",
    "producer",
    "subjectType",
    "subjectId",
    "correlationId",
    "causationId",
    "idempotencyKey",
    "payload",
  ],
  properties: {
    eventId: { type: "string", format: "uuid" },
    eventType: { type: "string", enum: [...INITIAL_DOMAIN_EVENT_TYPES] },
    schemaVersion: { type: "integer", minimum: 1 },
    occurredAt: { type: "string", format: "date-time" },
    producer: { type: "string", minLength: 1, maxLength: 100 },
    subjectType: { type: "string", minLength: 1, maxLength: 100 },
    subjectId: { type: "string", minLength: 1, maxLength: 200 },
    correlationId: { type: "string", minLength: 1, maxLength: 200 },
    causationId: { type: ["string", "null"], maxLength: 200 },
    idempotencyKey: { type: "string", minLength: 1, maxLength: 200 },
    payload: { type: "object" },
  },
  additionalProperties: false,
};

/** Original public name retained byte-for-byte in meaning for v1 consumers. */
export const DOMAIN_EVENT_ENVELOPE_SCHEMA = DOMAIN_EVENT_ENVELOPE_V1_SCHEMA;

export const DOMAIN_EVENT_ENVELOPE_V2_SCHEMA: ContractSchema = {
  $id: "asodef.connect.domain-event-envelope.v2",
  type: "object",
  required: [
    "eventId",
    "eventType",
    "schemaVersion",
    "occurredAt",
    "producer",
    "aggregateType",
    "aggregateId",
    "correlationId",
    "causationId",
    "idempotencyKey",
    "sanitizedPayload",
  ],
  properties: {
    eventId: { type: "string", format: "uuid" },
    eventType: { type: "string", enum: [...CANONICAL_DOMAIN_EVENT_TYPES] },
    schemaVersion: { type: "integer", minimum: 1 },
    occurredAt: { type: "string", format: "date-time" },
    producer: { type: "string", minLength: 1, maxLength: 100 },
    aggregateType: { type: "string", minLength: 1, maxLength: 100 },
    aggregateId: { type: "string", minLength: 1, maxLength: 200 },
    correlationId: { type: "string", minLength: 1, maxLength: 200 },
    causationId: { type: ["string", "null"], maxLength: 200 },
    idempotencyKey: { type: "string", minLength: 1, maxLength: 200 },
    sanitizedPayload: { type: "object" },
  },
  additionalProperties: false,
};

export interface PublishEventOutput {
  eventId: string;
  disposition: "ACCEPTED" | "DUPLICATE";
}

const PUBLISH_EVENT_OUTPUT_SCHEMA: ContractSchema = {
  $id: "asodef.connect.events.publish.output.v1",
  type: "object",
  required: ["eventId", "disposition"],
  properties: {
    eventId: { type: "string", format: "uuid" },
    disposition: { type: "string", enum: ["ACCEPTED", "DUPLICATE"] },
  },
  additionalProperties: false,
};

const PUBLISH_EVENT_ERRORS = [
  {
    code: "EVENT_SCHEMA_INVALID",
    retryable: false,
    description: "Envelope or registered payload schema is invalid.",
  },
  {
    code: "EVENT_TYPE_UNREGISTERED",
    retryable: false,
    description: "Event type/version is not registered.",
  },
  {
    code: "EVENT_STORE_UNAVAILABLE",
    retryable: true,
    description: "Durable event storage is unavailable.",
  },
  {
    code: "PERMISSION_DENIED",
    retryable: false,
    description: "Producer cannot publish this event type.",
  },
] as const;

const PUBLISH_EVENT_IDEMPOTENCY = {
  required: true,
  scope: "producer + idempotencyKey; eventId is globally unique",
  duplicateBehavior:
    "Return the first eventId with DUPLICATE; never append or dispatch twice.",
  retention: "At least the maximum event replay and audit retention period.",
} as const;

export const DOMAIN_EVENT_PUBLISH_CONTRACT: PublicContract<
  DomainEventEnvelope,
  PublishEventOutput
> = {
  name: "events.publish",
  version: "1.0.0",
  inputSchema: DOMAIN_EVENT_ENVELOPE_V1_SCHEMA,
  outputSchema: PUBLISH_EVENT_OUTPUT_SCHEMA,
  errors: PUBLISH_EVENT_ERRORS,
  permissions: ["events.publish:<eventType>"],
  audit: MINIMIZED_AUDIT,
  idempotency: PUBLISH_EVENT_IDEMPOTENCY,
};

export const DOMAIN_EVENT_PUBLISH_V2_CONTRACT: PublicContract<
  DomainEventEnvelopeV2,
  PublishEventOutput
> = {
  name: "events.publish",
  version: "2.0.0",
  inputSchema: DOMAIN_EVENT_ENVELOPE_V2_SCHEMA,
  outputSchema: {
    ...PUBLISH_EVENT_OUTPUT_SCHEMA,
    $id: "asodef.connect.events.publish.output.v2",
  },
  errors: PUBLISH_EVENT_ERRORS,
  permissions: ["events.publish:<eventType>"],
  audit: MINIMIZED_AUDIT,
  idempotency: PUBLISH_EVENT_IDEMPOTENCY,
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const V1_ENVELOPE_KEYS = new Set(DOMAIN_EVENT_ENVELOPE_V1_SCHEMA.required);
const V2_ENVELOPE_KEYS = new Set(DOMAIN_EVENT_ENVELOPE_V2_SCHEMA.required);

export function isDomainEventEnvelope(
  value: unknown,
): value is DomainEventEnvelope {
  if (!isEnvelopeObject(value, V1_ENVELOPE_KEYS)) return false;
  const event = value as Partial<DomainEventEnvelope>;
  return (
    INITIAL_DOMAIN_EVENT_TYPES.includes(
      event.eventType as LegacyDomainEventTypeV1,
    ) &&
    hasCommonEnvelopeFields(event) &&
    bounded(event.subjectType, 100) &&
    bounded(event.subjectId, 200) &&
    isJsonObject(event.payload)
  );
}

export const isDomainEventEnvelopeV1 = isDomainEventEnvelope;

export function isDomainEventEnvelopeV2(
  value: unknown,
): value is DomainEventEnvelopeV2 {
  if (!isEnvelopeObject(value, V2_ENVELOPE_KEYS)) return false;
  const event = value as Partial<DomainEventEnvelopeV2>;
  return (
    CANONICAL_DOMAIN_EVENT_TYPES.includes(
      event.eventType as CanonicalDomainEventTypeV2,
    ) &&
    hasCommonEnvelopeFields(event) &&
    bounded(event.aggregateType, 100) &&
    bounded(event.aggregateId, 200) &&
    isJsonObject(event.sanitizedPayload)
  );
}

function definition<TEventType extends CanonicalDomainEventTypeV2>(
  eventType: TEventType,
  aggregateType: CanonicalDomainEventDefinition["aggregateType"],
): CanonicalDomainEventDefinition & { eventType: TEventType } {
  return { eventType, schemaVersion: 1, aggregateType };
}

function isEnvelopeObject(
  value: unknown,
  keys: ReadonlySet<string>,
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.size &&
    Object.keys(value).every((key) => keys.has(key))
  );
}

function hasCommonEnvelopeFields(event: {
  eventId?: unknown;
  schemaVersion?: unknown;
  occurredAt?: unknown;
  producer?: unknown;
  correlationId?: unknown;
  causationId?: unknown;
  idempotencyKey?: unknown;
}): boolean {
  return (
    typeof event.eventId === "string" &&
    UUID.test(event.eventId) &&
    Number.isInteger(event.schemaVersion) &&
    Number(event.schemaVersion) > 0 &&
    typeof event.occurredAt === "string" &&
    !Number.isNaN(Date.parse(event.occurredAt)) &&
    bounded(event.producer, 100) &&
    bounded(event.correlationId, 200) &&
    (event.causationId === null || bounded(event.causationId, 200)) &&
    bounded(event.idempotencyKey, 200)
  );
}

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function bounded(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}
