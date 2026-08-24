import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type ConnectAutomationExecutionStep } from "@prisma/client";
import type {
  AutomationAction,
  AutomationCondition,
  CommunicationsSendRequest,
  DomainEventEnvelope,
  ExecutionPolicy,
  GatewayRequestContext,
  JsonValue,
} from "@asodef/connect-contracts";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";
import { CommunicationsRuntimeError } from "../communications/communications-runtime.error";
import { CommunicationsService } from "../communications/communications.service";
import { AutomationRuntimeError } from "./automation-runtime.error";

interface FailureClassification {
  code: string;
  retryable: boolean;
}

@Injectable()
export class AutomationEngineService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AutomationEngineService.name);
  private readonly automaticWorkerEnabled: boolean;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryDrain: Promise<number> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly communications: CommunicationsService,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.automaticWorkerEnabled = config.get("NODE_ENV", { infer: true }) !== "test";
  }

  onApplicationBootstrap(): void {
    if (!this.automaticWorkerEnabled) return;
    this.retryTimer = setInterval(() => {
      if (this.retryDrain) return;
      const drain = this.processReadyRetries();
      this.retryDrain = drain;
      drain
        .catch(() => this.logger.error("Automation retry cycle failed"))
        .finally(() => {
          if (this.retryDrain === drain) this.retryDrain = null;
        });
    }, 2_000);
    this.retryTimer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
    await this.retryDrain?.catch(() => undefined);
  }

  async processExecution(executionId: string): Promise<void> {
    const claimed = await this.prisma.connectAutomationExecution.updateMany({
      where: { id: executionId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "RUNNING", startedAt: new Date(), finishedAt: null },
    });
    if (claimed.count !== 1) return;

    const execution = await this.prisma.connectAutomationExecution.findUnique({
      where: { id: executionId },
      include: {
        automationVersion: { include: { automation: true } },
        domainEvent: true,
        steps: { orderBy: { actionIndex: "asc" } },
      },
    });
    if (!execution || !execution.domainEvent) {
      await this.failDefinition(executionId, "AUTOMATION_DEFINITION_INVALID");
      return;
    }

    const actions = parseActions(execution.automationVersion.actions);
    const conditions = parseConditions(execution.automationVersion.conditions);
    const policy = parsePolicy(execution.automationVersion.executionPolicy);
    if (!actions || !conditions || !policy) {
      await this.failDefinition(executionId, "AUTOMATION_DEFINITION_INVALID");
      return;
    }
    const envelope = toEnvelope(execution.domainEvent);
    let conditionsSatisfied: boolean;
    try {
      conditionsSatisfied = conditions.every((condition) =>
        evaluateCondition(condition, envelope),
      );
    } catch {
      await this.failDefinition(executionId, "AUTOMATION_DEFINITION_INVALID");
      return;
    }
    if (!conditionsSatisfied) {
      await this.prisma.connectAutomationExecution.update({
        where: { id: executionId },
        data: { status: "SUCCEEDED", finishedAt: new Date() },
      });
      return;
    }

    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index]!;
      const previous = execution.steps.find((step) => step.actionIndex === index);
      if (previous?.status === "SUCCEEDED" || previous?.status === "SKIPPED") continue;
      if (previous?.nextAttemptAt && previous.nextAttemptAt.getTime() > Date.now()) {
        await this.prisma.connectAutomationExecution.update({
          where: { id: executionId },
          data: { status: "FAILED", failureCode: previous.failureCode },
        });
        return;
      }
      const step = await this.startStep(executionId, index, action, previous);
      const attempt = step.attemptCount;
      const retry = await this.prisma.connectAutomationRetry.upsert({
        where: { stepId_attempt: { stepId: step.id, attempt } },
        update: { startedAt: new Date(), finishedAt: null },
        create: {
          stepId: step.id,
          attempt,
          scheduledAt: previous?.nextAttemptAt ?? new Date(),
          startedAt: new Date(),
        },
      });
      try {
        const result = await withTimeout(
          this.executeAction(
            action,
            envelope,
            execution.id,
            index,
            execution.automationVersion.automation.key,
            policy.timeoutMs,
          ),
          policy.timeoutMs,
        );
        await this.prisma.$transaction([
          this.prisma.connectAutomationRetry.update({
            where: { id: retry.id },
            data: { finishedAt: new Date(), retryable: false },
          }),
          this.prisma.connectAutomationExecutionStep.update({
            where: { id: step.id },
            data: {
              status: "SUCCEEDED",
              finishedAt: new Date(),
              nextAttemptAt: null,
              failureCode: null,
              failureRetryable: null,
              output: result as Prisma.InputJsonValue,
            },
          }),
        ]);
      } catch (error) {
        const failure = classifyFailure(error);
        const shouldRetry = failure.retryable && attempt < policy.maxAttempts;
        const nextAttemptAt = shouldRetry
          ? new Date(Date.now() + backoffDelay(policy, attempt))
          : null;
        await this.prisma.$transaction(async (tx) => {
          await tx.connectAutomationRetry.update({
            where: { id: retry.id },
            data: {
              finishedAt: new Date(),
              failureCode: failure.code,
              retryable: failure.retryable,
            },
          });
          await tx.connectAutomationExecutionStep.update({
            where: { id: step.id },
            data: {
              status: shouldRetry ? "RETRY_PENDING" : "DEAD_LETTER",
              finishedAt: new Date(),
              nextAttemptAt,
              failureCode: failure.code,
              failureRetryable: failure.retryable,
            },
          });
          await tx.connectAutomationExecution.update({
            where: { id: executionId },
            data: {
              status: shouldRetry ? "FAILED" : "DEAD_LETTER",
              finishedAt: shouldRetry ? null : new Date(),
              failureCode: failure.code,
              failureRetryable: failure.retryable,
            },
          });
          if (!shouldRetry) {
            await tx.connectAutomationDeadLetter.upsert({
              where: { executionId },
              update: {
                stepId: step.id,
                reasonCode: failure.code,
                retryCount: attempt,
              },
              create: {
                executionId,
                stepId: step.id,
                reasonCode: failure.code,
                retryCount: attempt,
                correlationId: execution.correlationId,
              },
            });
          }
        });
        return;
      }
    }

    await this.prisma.connectAutomationExecution.update({
      where: { id: executionId },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        failureCode: null,
        failureRetryable: null,
      },
    });
  }

  async processReadyRetries(): Promise<number> {
    const ready = await this.prisma.connectAutomationExecution.findMany({
      where: {
        status: "FAILED",
        steps: { some: { status: "RETRY_PENDING", nextAttemptAt: { lte: new Date() } } },
      },
      select: { id: true },
      take: 25,
    });
    for (const execution of ready) await this.processExecution(execution.id);
    return ready.length;
  }

  private async startStep(
    executionId: string,
    actionIndex: number,
    action: AutomationAction,
    previous: ConnectAutomationExecutionStep | undefined,
  ): Promise<ConnectAutomationExecutionStep> {
    const attemptCount = (previous?.attemptCount ?? 0) + 1;
    return this.prisma.connectAutomationExecutionStep.upsert({
      where: { executionId_actionIndex: { executionId, actionIndex } },
      update: {
        actionType: action.type,
        status: "RUNNING",
        attemptCount,
        startedAt: new Date(),
        finishedAt: null,
        nextAttemptAt: null,
      },
      create: {
        executionId,
        actionIndex,
        actionType: action.type,
        status: "RUNNING",
        attemptCount,
        startedAt: new Date(),
      },
    });
  }

  private async executeAction(
    action: AutomationAction,
    event: DomainEventEnvelope,
    executionId: string,
    actionIndex: number,
    automationKey: string,
    timeoutMs: number,
  ): Promise<Record<string, JsonValue>> {
    if (action.type !== "COMMUNICATION_SEND") {
      throw new AutomationRuntimeError("ACTION_NOT_IMPLEMENTED", false);
    }
    const mapped: Record<string, unknown> = {};
    for (const [target, source] of Object.entries(action.inputMapping)) {
      setPath(mapped, target, readPath(event, source));
    }
    const request = {
      ...mapped,
      version: "v1",
      requestId: `automation:${executionId}:${actionIndex}`,
      idempotencyKey: `automation:${executionId}:${actionIndex}`,
      testMode: false,
    } as unknown as CommunicationsSendRequest;
    const purposeKey = request.consentRequirement?.purposeKey;
    const context: GatewayRequestContext = {
      version: "v1",
      identity: {
        principalType: "SYSTEM",
        principalId: `automation:${automationKey}`,
        effectiveActorId: `automation:${automationKey}`,
        identityLevel: "MFA_VERIFIED",
        permissions: ["communications.send"],
      },
      audit: {
        correlationId: event.correlationId,
        causationId: event.eventId,
        requestId: request.requestId,
      },
      policy: {
        purpose: `automation:${automationKey}`,
        consentPurposeKeys: purposeKey ? [purposeKey] : [],
        consentVerified: false,
        piiPolicy: "MINIMIZE",
        dataClassification: request.dataClassification,
      },
      deadlineAt: new Date(Date.now() + timeoutMs).toISOString(),
    };
    const output = await this.communications.send(request, context);
    return {
      communicationId: output.communicationId,
      disposition: output.disposition,
      replayed: output.replayed,
    };
  }

  private async failDefinition(executionId: string, code: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const execution = await tx.connectAutomationExecution.findUnique({
        where: { id: executionId },
        select: { correlationId: true, status: true },
      });
      if (!execution || execution.status !== "RUNNING") return;
      await tx.connectAutomationExecution.update({
        where: { id: executionId },
        data: {
          status: "DEAD_LETTER",
          failureCode: code,
          failureRetryable: false,
          finishedAt: new Date(),
        },
      });
      await tx.connectAutomationDeadLetter.upsert({
        where: { executionId },
        update: { reasonCode: code, retryCount: 0 },
        create: {
          executionId,
          reasonCode: code,
          retryCount: 0,
          correlationId: execution.correlationId,
        },
      });
    });
  }
}

function parseActions(value: Prisma.JsonValue): AutomationAction[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (item.type === "COMMUNICATION_SEND") {
      return item.contractVersion === "1.0.0" && isStringMapping(item.inputMapping);
    }
    if (item.type === "TOOL_CALL") {
      return (
        typeof item.toolName === "string" &&
        typeof item.toolVersion === "string" &&
        typeof item.permission === "string" &&
        isStringMapping(item.inputMapping)
      );
    }
    if (item.type === "EMIT_EVENT") {
      return (
        typeof item.eventType === "string" &&
        Number.isInteger(item.schemaVersion) &&
        isStringMapping(item.payloadMapping)
      );
    }
    return false;
  })
    ? (value as unknown as AutomationAction[])
    : null;
}

function parseConditions(value: Prisma.JsonValue): AutomationCondition[] | null {
  if (!Array.isArray(value)) return null;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof item.source === "string" &&
      typeof item.field === "string" &&
      ["EVENT", "CONTEXT"].includes(String(item.source)) &&
      typeof item.field === "string" &&
      ["EQ", "NEQ", "IN", "NOT_IN", "EXISTS", "GT", "GTE", "LT", "LTE"].includes(String(item.operator)),
  )
    ? (value as unknown as AutomationCondition[])
    : null;
}

function isStringMapping(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function parsePolicy(value: Prisma.JsonValue): ExecutionPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const backoff = candidate.backoff as Record<string, unknown> | undefined;
  if (
    !Number.isInteger(candidate.timeoutMs) ||
    Number(candidate.timeoutMs) < 1 ||
    !Number.isInteger(candidate.maxAttempts) ||
    Number(candidate.maxAttempts) < 1 ||
    !backoff ||
    backoff.strategy !== "EXPONENTIAL" ||
    !Number.isInteger(backoff.initialDelayMs) ||
    Number(backoff.initialDelayMs) < 0 ||
    !Number.isInteger(backoff.maximumDelayMs) ||
    Number(backoff.maximumDelayMs) < Number(backoff.initialDelayMs) ||
    typeof backoff.jitter !== "boolean"
  ) return null;
  return value as unknown as ExecutionPolicy;
}

function toEnvelope(event: {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  occurredAt: Date;
  producer: string;
  subjectType: string;
  subjectId: string;
  correlationId: string;
  causationId: string | null;
  idempotencyKey: string;
  payload: Prisma.JsonValue;
}): DomainEventEnvelope {
  return {
    eventId: event.eventId,
    eventType: event.eventType as DomainEventEnvelope["eventType"],
    schemaVersion: event.schemaVersion,
    occurredAt: event.occurredAt.toISOString(),
    producer: event.producer,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    correlationId: event.correlationId,
    causationId: event.causationId,
    idempotencyKey: event.idempotencyKey,
    payload: event.payload as DomainEventEnvelope["payload"],
  };
}

function evaluateCondition(
  condition: AutomationCondition,
  event: DomainEventEnvelope,
): boolean {
  if (condition.source !== "EVENT") return false;
  const actual = readPath(event, condition.field);
  const expected = condition.value;
  switch (condition.operator) {
    case "EXISTS": return actual !== undefined && actual !== null;
    case "EQ": return JSON.stringify(actual) === JSON.stringify(expected);
    case "NEQ": return JSON.stringify(actual) !== JSON.stringify(expected);
    case "IN": return Array.isArray(expected) && expected.some((value) => JSON.stringify(value) === JSON.stringify(actual));
    case "NOT_IN": return Array.isArray(expected) && !expected.some((value) => JSON.stringify(value) === JSON.stringify(actual));
    case "GT": return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "GTE": return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "LT": return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "LTE": return typeof actual === "number" && typeof expected === "number" && actual <= expected;
  }
}

function readPath(root: unknown, path: string): unknown {
  if (!path || path.split(".").some((part) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(part))) {
    throw new AutomationRuntimeError("ACTION_INPUT_INVALID", false);
  }
  return path.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[part];
  }, root);
}

function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  if (parts.some((part) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(part))) {
    throw new AutomationRuntimeError("ACTION_INPUT_INVALID", false);
  }
  let current = root;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (existing !== undefined && (!existing || typeof existing !== "object" || Array.isArray(existing))) {
      throw new AutomationRuntimeError("ACTION_INPUT_INVALID", false);
    }
    if (existing === undefined) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts.at(-1)!] = value;
}

function classifyFailure(error: unknown): FailureClassification {
  if (error instanceof CommunicationsRuntimeError || error instanceof AutomationRuntimeError) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: "EXECUTION_STORE_UNAVAILABLE", retryable: true };
}

function backoffDelay(policy: ExecutionPolicy, attempt: number): number {
  const base = Math.min(
    policy.backoff.initialDelayMs * 2 ** Math.max(attempt - 1, 0),
    policy.backoff.maximumDelayMs,
  );
  if (!policy.backoff.jitter || base === 0) return base;
  return Math.floor(base / 2 + Math.random() * (base / 2));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new AutomationRuntimeError("ACTION_TIMEOUT", true)),
      timeoutMs,
    );
    timeout.unref();
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout));
}
