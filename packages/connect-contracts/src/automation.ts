import type { JsonValue, PublicContract } from "./shared";
import { MINIMIZED_AUDIT } from "./shared";
import type { DomainEventType } from "./domain-events";

export const AUTOMATION_LIFECYCLE = [
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "ACTIVE",
  "DISABLED",
  "RETIRED",
] as const;
export type AutomationLifecycle = (typeof AUTOMATION_LIFECYCLE)[number];

export const AUTOMATION_EXECUTION_MODES = [
  "EVENT",
  "SCHEDULE",
  "MANUAL_AUTHORIZED",
] as const;
export type AutomationExecutionMode =
  (typeof AUTOMATION_EXECUTION_MODES)[number];

export interface Automation {
  id: string;
  key: string;
  name: string;
  status: AutomationLifecycle;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationVersion {
  id: string;
  automationId: string;
  version: number;
  status: AutomationLifecycle;
  trigger: AutomationTrigger;
  conditions: readonly AutomationCondition[];
  actions: readonly AutomationAction[];
  executionPolicy: ExecutionPolicy;
  createdBy: string;
  reviewedBy: string | null;
  publishedAt: string | null;
}

export type AutomationTrigger =
  | { type: "EVENT"; eventType: DomainEventType; schemaVersion: number }
  | { type: "SCHEDULE"; scheduleId: string; timezone: string }
  | { type: "MANUAL_AUTHORIZED"; permission: string; stepUpRequired: boolean };

/** Conditions are declarative data. No script, SQL, Prisma expression, template
 * expression or arbitrary executable code is accepted by this contract. */
export interface AutomationCondition {
  source: "EVENT" | "CONTEXT";
  field: string;
  operator:
    "EQ" | "NEQ" | "IN" | "NOT_IN" | "EXISTS" | "GT" | "GTE" | "LT" | "LTE";
  value?: JsonValue;
}

export type AutomationAction =
  | {
      type: "TOOL_CALL";
      toolName: string;
      toolVersion: string;
      permission: string;
      inputMapping: Readonly<Record<string, string>>;
    }
  | {
      type: "COMMUNICATION_SEND";
      contractVersion: "1.0.0";
      inputMapping: Readonly<Record<string, string>>;
    }
  | {
      type: "EMIT_EVENT";
      eventType: DomainEventType;
      schemaVersion: number;
      payloadMapping: Readonly<Record<string, string>>;
    };

export interface ExecutionPolicy {
  timeoutMs: number;
  maxAttempts: number;
  backoff: {
    strategy: "EXPONENTIAL";
    initialDelayMs: number;
    maximumDelayMs: number;
    jitter: boolean;
  };
}

export type ExecutionStatus =
  "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "DEAD_LETTER" | "CANCELLED";
export type ExecutionStepStatus =
  "PENDING" | "RUNNING" | "SUCCEEDED" | "RETRY_PENDING" | "FAILED" | "SKIPPED";

export interface Execution {
  id: string;
  automationVersionId: string;
  mode: AutomationExecutionMode;
  status: ExecutionStatus;
  triggerReference: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  requestedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  failureReason: string | null;
}

export interface ExecutionStep {
  id: string;
  executionId: string;
  actionIndex: number;
  status: ExecutionStepStatus;
  attemptCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  failureReason: string | null;
}

export interface Retry {
  id: string;
  executionStepId: string;
  attempt: number;
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failureReason: string | null;
}

export interface DeadLetter {
  id: string;
  executionId: string;
  executionStepId: string | null;
  reasonCode: string;
  retryCount: number;
  correlationId: string;
  createdAt: string;
  resolution: "UNRESOLVED" | "REQUEUED_AUTHORIZED" | "RESOLVED_NO_RETRY";
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export const AUTOMATION_TRANSITIONS: Readonly<
  Record<AutomationLifecycle, readonly AutomationLifecycle[]>
> = {
  DRAFT: ["REVIEW"],
  REVIEW: ["DRAFT", "PUBLISHED"],
  PUBLISHED: ["ACTIVE", "RETIRED"],
  ACTIVE: ["DISABLED", "RETIRED"],
  DISABLED: ["ACTIVE", "RETIRED"],
  RETIRED: [],
};

export function canTransitionAutomation(
  from: AutomationLifecycle,
  to: AutomationLifecycle,
): boolean {
  return AUTOMATION_TRANSITIONS[from].includes(to);
}

export interface ExecuteAutomationInput {
  automationVersionId: string;
  mode: AutomationExecutionMode;
  triggerReference: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
}

export interface ExecuteAutomationOutput {
  executionId: string;
  disposition: "ACCEPTED" | "DUPLICATE";
  status: "PENDING";
}

export const AUTOMATION_EXECUTE_CONTRACT: PublicContract<
  ExecuteAutomationInput,
  ExecuteAutomationOutput
> = {
  name: "automations.execute",
  version: "1.0.0",
  inputSchema: {
    $id: "asodef.connect.automations.execute.input.v1",
    type: "object",
    required: [
      "automationVersionId",
      "mode",
      "triggerReference",
      "idempotencyKey",
      "correlationId",
      "causationId",
    ],
    properties: {
      automationVersionId: { type: "string", format: "uuid" },
      mode: { type: "string", enum: [...AUTOMATION_EXECUTION_MODES] },
      triggerReference: { type: "string", minLength: 1 },
      idempotencyKey: { type: "string", minLength: 1, maxLength: 200 },
      correlationId: { type: "string", minLength: 1, maxLength: 200 },
      causationId: { type: ["string", "null"] },
    },
    additionalProperties: false,
  },
  outputSchema: {
    $id: "asodef.connect.automations.execute.output.v1",
    type: "object",
    required: ["executionId", "disposition", "status"],
    properties: {
      executionId: { type: "string", format: "uuid" },
      disposition: { type: "string", enum: ["ACCEPTED", "DUPLICATE"] },
      status: { type: "string", const: "PENDING" },
    },
    additionalProperties: false,
  },
  errors: [
    {
      code: "AUTOMATION_NOT_ACTIVE",
      retryable: false,
      description: "Only ACTIVE published versions execute.",
    },
    {
      code: "TRIGGER_NOT_AUTHORIZED",
      retryable: false,
      description: "Mode, RBAC, consent or step-up check failed.",
    },
    {
      code: "AUTOMATION_INPUT_INVALID",
      retryable: false,
      description: "Trigger or context does not satisfy the contract.",
    },
    {
      code: "EXECUTION_STORE_UNAVAILABLE",
      retryable: true,
      description: "Execution could not be persisted durably.",
    },
  ],
  permissions: ["automations.execute", "automation:<key>:execute"],
  audit: {
    ...MINIMIZED_AUDIT,
    records: [
      ...MINIMIZED_AUDIT.records,
      "automation/version",
      "mode",
      "step outcomes",
      "retry/dead-letter decision",
    ],
  },
  idempotency: {
    required: true,
    scope: "automationVersionId + mode + idempotencyKey",
    duplicateBehavior:
      "Return the original executionId; never repeat successful steps.",
    retention: "At least the execution-history and audit retention period.",
  },
};
