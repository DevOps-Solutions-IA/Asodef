import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  isConsentRequirementCompatible,
  type CommunicationAddress,
  type CommunicationsSendOutput,
  type CommunicationsSendRequest,
  type CommunicationsServiceContract,
  type GatewayRequestContext,
} from "@asodef/connect-contracts";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { CommunicationsRuntimeError } from "./communications-runtime.error";
import { EmailOutboxAdapter } from "./email-outbox.adapter";
import { PublishedTemplateRenderer } from "./published-template.renderer";
import {
  RateLimitDependencyUnavailableError,
  RateLimiterService,
} from "../auth/rate-limiter.service";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDEMPOTENCY = /^.{16,128}$/;

@Injectable()
export class CommunicationsService implements CommunicationsServiceContract {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: PublishedTemplateRenderer,
    private readonly emailOutbox: EmailOutboxAdapter,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async send(
    request: CommunicationsSendRequest,
    context: GatewayRequestContext,
  ): Promise<CommunicationsSendOutput> {
    this.validateRequest(request, context);
    if (request.channel !== "EMAIL") {
      throw new CommunicationsRuntimeError("TRANSPORT_NOT_AVAILABLE", false);
    }
    if (!isConsentRequirementCompatible(request.purpose, request.consentRequirement)) {
      throw new CommunicationsRuntimeError("CONSENT_REQUIRED", false);
    }

    const rendered = this.templates.render({
      key: request.template.key,
      version: request.template.version,
      channel: request.channel,
      purpose: request.purpose,
      variables: request.variables,
    });
    const requestedBy = context.identity.effectiveActorId;
    const requestHash = hashCanonical({ request, audit: context.audit });
    const existing = await this.prisma.connectCommunication.findFirst({
      where: {
        requestedBy,
        OR: [
          { idempotencyKey: request.idempotencyKey },
          { requestId: request.requestId },
        ],
      },
      include: { recipients: { orderBy: { recipientIndex: "asc" } } },
    });
    if (existing) return this.replay(existing, requestHash);

    await this.enforceRateLimits(request, requestedBy);

    const decisions = await this.resolveRecipientDecisions(request, context);
    try {
      const communication = await this.prisma.$transaction(async (tx) => {
        const created = await tx.connectCommunication.create({
          data: {
            id: randomUUID(),
            requestId: request.requestId,
            requestedBy,
            idempotencyKey: request.idempotencyKey,
            requestHash,
            channel: request.channel,
            purpose: request.purpose,
            dataClassification: request.dataClassification,
            templateKey: request.template.key,
            templateVersion: request.template.version,
            correlationId: context.audit.correlationId,
            causationId: context.audit.causationId ?? null,
            recipients: {
              create: decisions.map((decision, recipientIndex) => {
                const recipient = request.recipients[recipientIndex]!;
                return {
                recipientIndex,
                recipientType: recipient.type,
                address: recipient.address,
                subjectType: recipient.subjectType,
                subjectId: recipient.subjectId,
                decision: decision.allowed ? "ALLOWED" : "SUPPRESSED",
                decisionReason: decision.reasonCode,
                };
              }),
            },
          },
          include: { recipients: { orderBy: { recipientIndex: "asc" } } },
        });
        const deliverable = decisions
          .map((decision, index) => ({ decision, index }))
          .filter(({ decision }) => decision.allowed)
          .map(({ index }) => request.recipients[index]!.address);
        if (deliverable.length === 0) {
          return tx.connectCommunication.update({
            where: { id: created.id },
            data: { status: "SUPPRESSED", completedAt: new Date() },
            include: { recipients: { orderBy: { recipientIndex: "asc" } } },
          });
        }
        await this.emailOutbox.enqueue(tx, {
          communicationId: created.id,
          recipients: deliverable,
          subject: rendered.subject ?? "ASODEF",
          textBody: rendered.textBody,
          templateReference: rendered.templateReference,
          correlationId: context.audit.correlationId,
        });
        return tx.connectCommunication.update({
          where: { id: created.id },
          data: { status: "QUEUED" },
          include: { recipients: { orderBy: { recipientIndex: "asc" } } },
        });
      });
      return this.toOutput(communication, false);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.connectCommunication.findFirst({
          where: {
            requestedBy,
            OR: [
              { idempotencyKey: request.idempotencyKey },
              { requestId: request.requestId },
            ],
          },
          include: { recipients: { orderBy: { recipientIndex: "asc" } } },
        });
        if (raced) return this.replay(raced, requestHash);
      }
      if (error instanceof CommunicationsRuntimeError) throw error;
      throw new CommunicationsRuntimeError("DELIVERY_STORE_UNAVAILABLE", true);
    }
  }

  private validateRequest(
    request: CommunicationsSendRequest,
    context: GatewayRequestContext,
  ): void {
    if (
      request.version !== "v1" ||
      context.version !== "v1" ||
      !request.requestId?.trim() ||
      request.requestId.length > 200 ||
      !IDEMPOTENCY.test(request.idempotencyKey) ||
      request.recipients.length < 1 ||
      request.recipients.length > 100 ||
      !isJsonObject(request.variables) ||
      !Number.isInteger(request.template.version) ||
      request.template.version < 1 ||
      request.recipients.some((recipient) => !this.validRecipient(recipient))
    ) {
      throw new CommunicationsRuntimeError("COMMUNICATION_INPUT_INVALID", false);
    }
    if (!context.identity.permissions.includes("communications.send")) {
      throw new CommunicationsRuntimeError("COMMUNICATION_PERMISSION_DENIED", false);
    }
    if (context.policy.dataClassification !== request.dataClassification) {
      throw new CommunicationsRuntimeError("COMMUNICATION_INPUT_INVALID", false);
    }
    if (Number.isNaN(Date.parse(context.deadlineAt)) || Date.parse(context.deadlineAt) <= Date.now()) {
      throw new CommunicationsRuntimeError("COMMUNICATION_DEADLINE_EXCEEDED", false);
    }
    if (
      request.testMode &&
      (!context.identity.permissions.includes("communications.test-send") ||
        context.identity.identityLevel !== "STEP_UP_VERIFIED")
    ) {
      throw new CommunicationsRuntimeError("STEP_UP_REQUIRED", false);
    }
  }

  private validRecipient(recipient: CommunicationAddress): boolean {
    return (
      ["TO", "CC", "BCC"].includes(recipient.type) &&
      recipient.address.length <= 320 &&
      EMAIL.test(recipient.address) &&
      (!recipient.subjectType || recipient.subjectType.length <= 100) &&
      (!recipient.subjectId || recipient.subjectId.length <= 200)
    );
  }

  private async enforceRateLimits(
    request: CommunicationsSendRequest,
    requestedBy: string,
  ): Promise<void> {
    try {
      const actor = await this.rateLimiter.checkAndIncrementStrict(
        `communications:actor:${hashValue(requestedBy)}`,
        100,
        60,
      );
      if (actor.limited) {
        throw new CommunicationsRuntimeError("RATE_LIMITED", true);
      }
      const recipients = await Promise.all(
        request.recipients.map((recipient) =>
          this.rateLimiter.checkAndIncrementStrict(
            `communications:recipient:${hashValue(recipient.address.toLowerCase())}`,
            20,
            60 * 60,
          ),
        ),
      );
      if (recipients.some((recipient) => recipient.limited)) {
        throw new CommunicationsRuntimeError("RATE_LIMITED", true);
      }
    } catch (error) {
      if (error instanceof CommunicationsRuntimeError) throw error;
      if (error instanceof RateLimitDependencyUnavailableError) {
        throw new CommunicationsRuntimeError(
          "RATE_LIMIT_DEPENDENCY_UNAVAILABLE",
          true,
        );
      }
      throw error;
    }
  }

  private async resolveRecipientDecisions(
    request: CommunicationsSendRequest,
    context: GatewayRequestContext,
  ): Promise<Array<{ allowed: boolean; reasonCode: string }>> {
    try {
    if (request.purpose === "MARKETING") {
      const requirement = request.consentRequirement;
      if (
        !context.policy.consentVerified ||
        !requirement.consentRecordId ||
        !requirement.purposeKey ||
        !context.policy.consentPurposeKeys.includes(requirement.purposeKey)
      ) {
        throw new CommunicationsRuntimeError("CONSENT_REQUIRED", false);
      }
      const consent = await this.prisma.consentRecord.findFirst({
        where: {
          id: requirement.consentRecordId,
          status: "GRANTED",
          revokedAt: null,
          consentPurpose: { key: requirement.purposeKey },
        },
      });
      if (!consent) throw new CommunicationsRuntimeError("CONSENT_REQUIRED", false);
      for (const recipient of request.recipients) {
        if (!matchesConsentSubject(recipient, consent)) {
          throw new CommunicationsRuntimeError("CONSENT_REQUIRED", false);
        }
      }
    }

    return await Promise.all(
      request.recipients.map(async (recipient) => {
        const suppressed = await this.prisma.suppressionListEntry.findUnique({
          where: {
            channel_recipient: {
              channel: request.channel.toLowerCase(),
              recipient: recipient.address,
            },
          },
        });
        return suppressed
          ? { allowed: false, reasonCode: "SUPPRESSION_LIST" }
          : { allowed: true, reasonCode: "POLICY_ALLOWED" };
      }),
    );
    } catch (error) {
      if (error instanceof CommunicationsRuntimeError) throw error;
      throw new CommunicationsRuntimeError("DELIVERY_STORE_UNAVAILABLE", true);
    }
  }

  private replay(
    communication: CommunicationRecord,
    requestHash: string,
  ): CommunicationsSendOutput {
    if (communication.requestHash !== requestHash) {
      throw new CommunicationsRuntimeError("IDEMPOTENCY_CONFLICT", false);
    }
    const output = this.toOutput(communication, true);
    return { ...output, disposition: "DUPLICATE", replayed: true };
  }

  private toOutput(
    communication: CommunicationRecord,
    replayed: boolean,
  ): CommunicationsSendOutput {
    const suppressed = communication.status === "SUPPRESSED";
    return {
      version: "v1",
      communicationId: communication.id,
      disposition: suppressed ? "SUPPRESSED" : "QUEUED",
      recipientResults: communication.recipients.map((recipient) => ({
        recipientIndex: recipient.recipientIndex,
        disposition: recipient.decision === "SUPPRESSED" ? "SUPPRESSED" : "QUEUED",
        reasonCode: recipient.decisionReason,
      })),
      deliveryResult: suppressed
        ? { status: "SUPPRESSED", terminal: true }
        : { status: "QUEUED", terminal: false },
      auditResult: {
        recorded: true,
        auditReference: `communication:${communication.id}`,
      },
      replayed,
    };
  }
}

type CommunicationRecord = Prisma.ConnectCommunicationGetPayload<{
  include: { recipients: true };
}>;

type ConsentRecord = {
  userId: string | null;
  leadSubmissionId: string | null;
  customerId: string | null;
};

function matchesConsentSubject(
  recipient: CommunicationAddress,
  consent: ConsentRecord,
): boolean {
  if (!recipient.subjectType || !recipient.subjectId) return false;
  const normalized = recipient.subjectType.toUpperCase();
  if (normalized === "USER") return consent.userId === recipient.subjectId;
  if (normalized === "LEAD" || normalized === "LEADSUBMISSION") {
    return consent.leadSubmissionId === recipient.subjectId;
  }
  if (normalized === "CUSTOMER") return consent.customerId === recipient.subjectId;
  return false;
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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

function isJsonObject(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || ["string", "boolean"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}
