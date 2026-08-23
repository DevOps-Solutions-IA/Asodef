import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  isDomainEventEnvelope,
  type AutomationTrigger,
  type DomainEventEnvelope,
} from "@asodef/connect-contracts";
import { createHash } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { AutomationEngineService } from "../automation/automation-engine.service";
import { DomainEventRuntimeError } from "./domain-event-runtime.error";

export interface DomainEventDispatchOutput {
  eventId: string;
  disposition: "ACCEPTED" | "DUPLICATE";
  executionIds: readonly string[];
}

@Injectable()
export class DomainEventDispatcherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationEngineService,
  ) {}

  async dispatch(event: DomainEventEnvelope): Promise<DomainEventDispatchOutput> {
    if (!isDomainEventEnvelope(event)) {
      throw new DomainEventRuntimeError("EVENT_SCHEMA_INVALID", false);
    }
    const envelopeHash = hashCanonical(event);
    const existing = await this.findExisting(event);
    if (existing) {
      const replay = this.replay(existing, envelopeHash);
      for (const executionId of replay.executionIds) {
        await this.automation.processExecution(executionId);
      }
      return replay;
    }

    let result: DomainEventDispatchOutput;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await tx.connectDomainEvent.create({
          data: {
            eventId: event.eventId,
            eventType: event.eventType,
            schemaVersion: event.schemaVersion,
            occurredAt: new Date(event.occurredAt),
            producer: event.producer,
            subjectType: event.subjectType,
            subjectId: event.subjectId,
            correlationId: event.correlationId,
            causationId: event.causationId,
            idempotencyKey: event.idempotencyKey,
            envelopeHash,
            payload: event.payload as Prisma.InputJsonValue,
          },
        });
        const candidates = await tx.connectAutomationVersion.findMany({
          where: {
            status: "ACTIVE",
            triggerType: "EVENT",
            automation: { status: "ACTIVE" },
          },
          select: { id: true, trigger: true },
        });
        const matching = candidates.filter(({ trigger }) =>
          triggerMatches(trigger, event),
        );
        const executionIds: string[] = [];
        for (const version of matching) {
          const execution = await tx.connectAutomationExecution.create({
            data: {
              automationVersionId: version.id,
              domainEventId: event.eventId,
              mode: "EVENT",
              triggerReference: event.eventId,
              idempotencyKey: `domain-event:${event.eventId}`,
              correlationId: event.correlationId,
              causationId: event.causationId,
              requestedBy: event.producer,
            },
          });
          executionIds.push(execution.id);
        }
        await tx.connectDomainEvent.update({
          where: { eventId: event.eventId },
          data: { status: "DISPATCHED", dispatchedAt: new Date() },
        });
        return { eventId: event.eventId, disposition: "ACCEPTED", executionIds };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.findExisting(event);
        if (raced) {
          const replay = this.replay(raced, envelopeHash);
          for (const executionId of replay.executionIds) {
            await this.automation.processExecution(executionId);
          }
          return replay;
        }
      }
      if (error instanceof DomainEventRuntimeError) throw error;
      throw new DomainEventRuntimeError("EVENT_STORE_UNAVAILABLE", true);
    }

    for (const executionId of result.executionIds) {
      await this.automation.processExecution(executionId);
    }
    return result;
  }

  private findExisting(event: DomainEventEnvelope) {
    return this.prisma.connectDomainEvent.findFirst({
      where: {
        OR: [
          { eventId: event.eventId },
          { producer: event.producer, idempotencyKey: event.idempotencyKey },
        ],
      },
      include: { executions: { select: { id: true } } },
    });
  }

  private replay(
    existing: Awaited<ReturnType<DomainEventDispatcherService["findExisting"]>> & {},
    envelopeHash: string,
  ): DomainEventDispatchOutput {
    if (existing.envelopeHash !== envelopeHash) {
      throw new DomainEventRuntimeError("EVENT_IDEMPOTENCY_CONFLICT", false);
    }
    return {
      eventId: existing.eventId,
      disposition: "DUPLICATE",
      executionIds: existing.executions.map((execution) => execution.id),
    };
  }
}

function triggerMatches(value: Prisma.JsonValue, event: DomainEventEnvelope): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const trigger = value as unknown as Partial<AutomationTrigger>;
  return (
    trigger.type === "EVENT" &&
    trigger.eventType === event.eventType &&
    trigger.schemaVersion === event.schemaVersion
  );
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}
