import type { ContractSchema, JsonObject, PublicContract } from "./shared";
import { MINIMIZED_AUDIT } from "./shared";

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

export type DomainEventType = (typeof INITIAL_DOMAIN_EVENT_TYPES)[number];

export interface DomainEventEnvelope<TPayload extends JsonObject = JsonObject> {
  eventId: string;
  eventType: DomainEventType;
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

export const DOMAIN_EVENT_ENVELOPE_SCHEMA: ContractSchema = {
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

export interface PublishEventOutput {
  eventId: string;
  disposition: "ACCEPTED" | "DUPLICATE";
}

export const DOMAIN_EVENT_PUBLISH_CONTRACT: PublicContract<
  DomainEventEnvelope,
  PublishEventOutput
> = {
  name: "events.publish",
  version: "1.0.0",
  inputSchema: DOMAIN_EVENT_ENVELOPE_SCHEMA,
  outputSchema: {
    $id: "asodef.connect.events.publish.output.v1",
    type: "object",
    required: ["eventId", "disposition"],
    properties: {
      eventId: { type: "string", format: "uuid" },
      disposition: { type: "string", enum: ["ACCEPTED", "DUPLICATE"] },
    },
    additionalProperties: false,
  },
  errors: [
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
  ],
  permissions: ["events.publish:<eventType>"],
  audit: MINIMIZED_AUDIT,
  idempotency: {
    required: true,
    scope: "producer + idempotencyKey; eventId is globally unique",
    duplicateBehavior:
      "Return the first eventId with DUPLICATE; never append or dispatch twice.",
    retention: "At least the maximum event replay and audit retention period.",
  },
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENVELOPE_KEYS = new Set(DOMAIN_EVENT_ENVELOPE_SCHEMA.required);

export function isDomainEventEnvelope(
  value: unknown,
): value is DomainEventEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<DomainEventEnvelope>;
  return (
    Object.keys(event).length === ENVELOPE_KEYS.size &&
    Object.keys(event).every((key) => ENVELOPE_KEYS.has(key)) &&
    typeof event.eventId === "string" &&
    UUID.test(event.eventId) &&
    INITIAL_DOMAIN_EVENT_TYPES.includes(event.eventType as DomainEventType) &&
    Number.isInteger(event.schemaVersion) &&
    Number(event.schemaVersion) > 0 &&
    typeof event.occurredAt === "string" &&
    !Number.isNaN(Date.parse(event.occurredAt)) &&
    bounded(event.producer, 100) &&
    bounded(event.subjectType, 100) &&
    bounded(event.subjectId, 200) &&
    bounded(event.correlationId, 200) &&
    (event.causationId === null || bounded(event.causationId, 200)) &&
    bounded(event.idempotencyKey, 200) &&
    !!event.payload &&
    typeof event.payload === "object" &&
    !Array.isArray(event.payload)
  );
}

function bounded(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}
