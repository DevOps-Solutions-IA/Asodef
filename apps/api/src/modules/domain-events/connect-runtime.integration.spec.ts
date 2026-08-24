import { ConfigModule } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type {
  CommunicationsSendRequest,
  DomainEventEnvelope,
  GatewayRequestContext,
} from "@asodef/connect-contracts";
import { randomUUID } from "node:crypto";
import { validateEnv } from "../../config/env.validation";
import { PrismaModule } from "../../database/prisma.module";
import { PrismaService } from "../../database/prisma.service";
import { AutomationEngineService } from "../automation/automation-engine.service";
import {
  RateLimitDependencyUnavailableError,
  RateLimiterService,
} from "../auth/rate-limiter.service";
import { CommunicationsRuntimeError } from "../communications/communications-runtime.error";
import { CommunicationsService } from "../communications/communications.service";
import { InMemoryMailTransport } from "../notifications/in-memory-mail.transport";
import { NotificationService } from "../notifications/notification.service";
import { DomainEventDispatcherService } from "./domain-event-dispatcher.service";
import { DomainEventsModule } from "./domain-events.module";

const TEST_PREFIX = "runtime-test-";

describe("DomainEvent -> Automation -> Communications runtime (integration)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let dispatcher: DomainEventDispatcherService;
  let engine: AutomationEngineService;
  let communications: CommunicationsService;
  let rateLimiter: RateLimiterService;
  let notifications: NotificationService;
  let mail: InMemoryMailTransport;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: validateEnv,
        }),
        PrismaModule,
        DomainEventsModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    dispatcher = moduleRef.get(DomainEventDispatcherService);
    engine = moduleRef.get(AutomationEngineService);
    communications = moduleRef.get(CommunicationsService);
    rateLimiter = moduleRef.get(RateLimiterService);
    notifications = moduleRef.get(NotificationService);
    mail = moduleRef.get(InMemoryMailTransport);
  });

  beforeEach(() => mail.clear());

  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.suppressionListEntry.deleteMany({
      where: { recipient: { startsWith: TEST_PREFIX } },
    });
    const communicationsForTest = await prisma.connectCommunication.findMany({
      where: { requestedBy: { startsWith: TEST_PREFIX } },
      select: { id: true },
    });
    const communicationIds = communicationsForTest.map(({ id }) => id);
    await prisma.notificationJob.deleteMany({
      where: { communicationId: { in: communicationIds } },
    });
    await prisma.connectCommunicationRecipient.deleteMany({
      where: { communicationId: { in: communicationIds } },
    });
    await prisma.connectCommunication.deleteMany({
      where: { id: { in: communicationIds } },
    });
    const automations = await prisma.connectAutomation.findMany({
      where: { key: { startsWith: TEST_PREFIX } },
      select: { id: true },
    });
    const automationIds = automations.map(({ id }) => id);
    const versions = await prisma.connectAutomationVersion.findMany({
      where: { automationId: { in: automationIds } },
      select: { id: true },
    });
    const versionIds = versions.map(({ id }) => id);
    const executions = await prisma.connectAutomationExecution.findMany({
      where: { automationVersionId: { in: versionIds } },
      select: { id: true },
    });
    const executionIds = executions.map(({ id }) => id);
    const steps = await prisma.connectAutomationExecutionStep.findMany({
      where: { executionId: { in: executionIds } },
      select: { id: true },
    });
    const stepIds = steps.map(({ id }) => id);
    await prisma.connectAutomationDeadLetter.deleteMany({
      where: { executionId: { in: executionIds } },
    });
    await prisma.connectAutomationRetry.deleteMany({ where: { stepId: { in: stepIds } } });
    await prisma.connectAutomationExecutionStep.deleteMany({ where: { id: { in: stepIds } } });
    await prisma.connectAutomationExecution.deleteMany({ where: { id: { in: executionIds } } });
    await prisma.connectAutomationVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.connectAutomation.deleteMany({ where: { id: { in: automationIds } } });
    await prisma.connectDomainEvent.deleteMany({
      where: { producer: { startsWith: TEST_PREFIX } },
    });
  });

  afterAll(async () => moduleRef.close());

  it("preserves the canonical event and delivers through the local outbox adapter", async () => {
    await createAutomation();
    const event = domainEvent();

    const dispatched = await dispatcher.dispatch(event);

    expect(dispatched.disposition).toBe("ACCEPTED");
    expect(dispatched.executionIds).toHaveLength(1);
    const stored = await prisma.connectDomainEvent.findUniqueOrThrow({
      where: { eventId: event.eventId },
    });
    expect(stored).toMatchObject({
      correlationId: event.correlationId,
      causationId: event.causationId,
      idempotencyKey: event.idempotencyKey,
      status: "DISPATCHED",
    });
    expect(stored.occurredAt.toISOString()).toBe(event.occurredAt);
    const execution = await prisma.connectAutomationExecution.findUniqueOrThrow({
      where: { id: dispatched.executionIds[0] },
      include: { steps: true },
    });
    expect(execution.status).toBe("SUCCEEDED");
    expect(execution.steps).toEqual([
      expect.objectContaining({ status: "SUCCEEDED", attemptCount: 1 }),
    ]);
    const communication = await prisma.connectCommunication.findFirstOrThrow({
      where: { causationId: event.eventId },
    });
    expect(communication.status).toBe("QUEUED");
    expect(mail.sentMessages).toHaveLength(0);

    await expect(notifications.processAvailableJobs()).resolves.toBeGreaterThanOrEqual(1);
    expect(mail.findLastMessageTo("runtime@example.com")).toEqual(
      expect.objectContaining({ correlationId: event.correlationId }),
    );
    expect(
      (await prisma.connectCommunication.findUniqueOrThrow({ where: { id: communication.id } })).status,
    ).toBe("DELIVERED");
  });

  it("does not append or execute a duplicate DomainEvent", async () => {
    await createAutomation();
    const event = domainEvent();
    const first = await dispatcher.dispatch(event);
    const duplicate = await dispatcher.dispatch(event);

    expect(duplicate).toEqual({ ...first, disposition: "DUPLICATE" });
    expect(await prisma.connectDomainEvent.count({ where: { eventId: event.eventId } })).toBe(1);
    expect(await prisma.connectAutomationExecution.count({
      where: { domainEventId: event.eventId },
    })).toBe(1);
    expect(await prisma.connectCommunication.count({
      where: { causationId: event.eventId },
    })).toBe(1);
  });

  it("returns the original communication for an idempotent send", async () => {
    const request = communicationRequest();
    const context = gatewayContext();
    const first = await communications.send(request, context);
    const duplicate = await communications.send(request, context);

    expect(duplicate.communicationId).toBe(first.communicationId);
    expect(duplicate.disposition).toBe("DUPLICATE");
    expect(duplicate.replayed).toBe(true);
    expect(await prisma.notificationJob.count({
      where: { communicationId: first.communicationId },
    })).toBe(1);

    await expect(
      communications.send({ ...request, variables: { fullName: "Changed", corporateEmail: "info@example.com" } }, context),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it.each([
    ["template not published", { template: { key: "crm_lead_welcome", version: 2 } }, "TEMPLATE_NOT_PUBLISHED"],
    ["invalid variables", { variables: { fullName: "Ada" } }, "TEMPLATE_VARIABLES_INVALID"],
    ["template injection input", { variables: { fullName: "{{constructor}}", corporateEmail: "info@example.com\nBcc:x" } }, "TEMPLATE_VARIABLES_INVALID"],
    ["transport unavailable", { channel: "WHATSAPP" }, "TRANSPORT_NOT_AVAILABLE"],
  ])("fails closed for %s", async (_label, override, code) => {
    const request = { ...communicationRequest(), ...override } as CommunicationsSendRequest;
    await expect(communications.send(request, gatewayContext())).rejects.toMatchObject({ code });
    expect(mail.sentMessages).toHaveLength(0);
  });

  it("fails closed when explicit marketing consent is not verified", async () => {
    const request: CommunicationsSendRequest = {
      ...communicationRequest(),
      purpose: "MARKETING",
      template: { key: "general_marketing", version: 1 },
      variables: {},
      consentRequirement: {
        basis: "EXPLICIT_CONSENT",
        purposeKey: "optional_marketing",
        consentRecordId: randomUUID(),
      },
    };
    await expect(communications.send(request, gatewayContext())).rejects.toMatchObject({
      code: "CONSENT_REQUIRED",
    });
    expect(mail.sentMessages).toHaveLength(0);
  });

  it("records a terminal suppression without creating an outbox job", async () => {
    const recipient = `${TEST_PREFIX}${randomUUID()}@example.com`;
    await prisma.suppressionListEntry.create({
      data: { channel: "email", recipient, reason: "runtime integration" },
    });
    const request: CommunicationsSendRequest = {
      ...communicationRequest(),
      recipients: [{ type: "TO", address: recipient }],
    };
    const result = await communications.send(request, gatewayContext());

    expect(result).toMatchObject({
      disposition: "SUPPRESSED",
      deliveryResult: { status: "SUPPRESSED", terminal: true },
      recipientResults: [expect.objectContaining({ reasonCode: "SUPPRESSION_LIST" })],
    });
    expect(await prisma.notificationJob.count({
      where: { communicationId: result.communicationId },
    })).toBe(0);
  });

  it.each([
    ["limit exceeded", { limited: true, remaining: 0, retryAfterSeconds: 60 }, "RATE_LIMITED"],
    ["dependency unavailable", new RateLimitDependencyUnavailableError(), "RATE_LIMIT_DEPENDENCY_UNAVAILABLE"],
  ])("fails closed when rate limiting reports %s", async (_label, result, code) => {
    const check = jest.spyOn(rateLimiter, "checkAndIncrementStrict");
    if (result instanceof Error) check.mockRejectedValue(result);
    else check.mockResolvedValue(result);

    await expect(
      communications.send(communicationRequest(), gatewayContext()),
    ).rejects.toMatchObject({ code });
    expect(await prisma.connectCommunication.count({
      where: { requestedBy: `${TEST_PREFIX}direct-actor` },
    })).toBe(0);
    expect(mail.sentMessages).toHaveLength(0);
  });

  it("retries a classified retryable failure without repeating successful work", async () => {
    await createAutomation({ maxAttempts: 2 });
    const realSend = communications.send.bind(communications);
    const send = jest
      .spyOn(communications, "send")
      .mockRejectedValueOnce(new CommunicationsRuntimeError("DELIVERY_STORE_UNAVAILABLE", true))
      .mockImplementation(realSend);
    const event = domainEvent();

    const result = await dispatcher.dispatch(event);
    let execution = await prisma.connectAutomationExecution.findUniqueOrThrow({
      where: { id: result.executionIds[0] },
      include: { steps: { include: { retries: true } } },
    });
    expect(execution.status).toBe("FAILED");
    expect(execution.steps[0]).toMatchObject({ status: "RETRY_PENDING", attemptCount: 1 });

    await expect(engine.processReadyRetries()).resolves.toBe(1);
    execution = await prisma.connectAutomationExecution.findUniqueOrThrow({
      where: { id: result.executionIds[0] },
      include: { steps: { include: { retries: true } } },
    });
    expect(execution.status).toBe("SUCCEEDED");
    expect(execution.steps[0]).toMatchObject({ status: "SUCCEEDED", attemptCount: 2 });
    expect(execution.steps[0]!.retries).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("dead-letters a non-retryable failure immediately", async () => {
    await createAutomation();
    const event = domainEvent({ channel: "WHATSAPP" });
    const result = await dispatcher.dispatch(event);
    const execution = await prisma.connectAutomationExecution.findUniqueOrThrow({
      where: { id: result.executionIds[0] },
      include: { deadLetter: true, steps: true },
    });

    expect(execution).toMatchObject({
      status: "DEAD_LETTER",
      failureCode: "TRANSPORT_NOT_AVAILABLE",
      failureRetryable: false,
      deadLetter: expect.objectContaining({
        reasonCode: "TRANSPORT_NOT_AVAILABLE",
        retryCount: 1,
        resolution: "UNRESOLVED",
      }),
    });
    expect(execution.steps[0]?.status).toBe("DEAD_LETTER");
    expect(mail.sentMessages).toHaveLength(0);
  });

  it("dead-letters a retryable failure after the bounded attempt limit", async () => {
    await createAutomation({ maxAttempts: 2 });
    jest.spyOn(communications, "send").mockRejectedValue(
      new CommunicationsRuntimeError("DELIVERY_STORE_UNAVAILABLE", true),
    );
    const result = await dispatcher.dispatch(domainEvent());
    await expect(engine.processReadyRetries()).resolves.toBe(1);
    const execution = await prisma.connectAutomationExecution.findUniqueOrThrow({
      where: { id: result.executionIds[0] },
      include: { deadLetter: true, steps: { include: { retries: true } } },
    });

    expect(execution).toMatchObject({
      status: "DEAD_LETTER",
      failureCode: "DELIVERY_STORE_UNAVAILABLE",
      failureRetryable: true,
      deadLetter: expect.objectContaining({ retryCount: 2 }),
    });
    expect(execution.steps[0]!.retries).toHaveLength(2);
  });

  async function createAutomation(options: { maxAttempts?: number } = {}): Promise<void> {
    const automation = await prisma.connectAutomation.create({
      data: {
        key: `${TEST_PREFIX}${randomUUID()}`,
        name: "Runtime integration automation",
        status: "ACTIVE",
      },
    });
    await prisma.connectAutomationVersion.create({
      data: {
        automationId: automation.id,
        version: 1,
        status: "ACTIVE",
        triggerType: "EVENT",
        trigger: { type: "EVENT", eventType: "LeadCreated", schemaVersion: 1 },
        conditions: [{ source: "EVENT", field: "payload.enabled", operator: "EQ", value: true }],
        actions: [{
          type: "COMMUNICATION_SEND",
          contractVersion: "1.0.0",
          inputMapping: {
            channel: "payload.communication.channel",
            purpose: "payload.communication.purpose",
            dataClassification: "payload.communication.dataClassification",
            consentRequirement: "payload.communication.consentRequirement",
            template: "payload.communication.template",
            recipients: "payload.communication.recipients",
            variables: "payload.communication.variables",
          },
        }],
        executionPolicy: {
          timeoutMs: 5_000,
          maxAttempts: options.maxAttempts ?? 3,
          backoff: {
            strategy: "EXPONENTIAL",
            initialDelayMs: 0,
            maximumDelayMs: 0,
            jitter: false,
          },
        },
        createdBy: `${TEST_PREFIX}author`,
        reviewedBy: `${TEST_PREFIX}reviewer`,
        publishedAt: new Date(),
      },
    });
  }
});

function domainEvent(override: { channel?: "EMAIL" | "WHATSAPP" } = {}): DomainEventEnvelope {
  const eventId = randomUUID();
  return {
    eventId,
    eventType: "LeadCreated",
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    producer: `${TEST_PREFIX}crm`,
    subjectType: "LeadSubmission",
    subjectId: randomUUID(),
    correlationId: `correlation-${randomUUID()}`,
    causationId: `causation-${randomUUID()}`,
    idempotencyKey: `event-${randomUUID()}`,
    payload: {
      enabled: true,
      communication: {
        channel: override.channel ?? "EMAIL",
        purpose: "TRANSACTIONAL",
        dataClassification: "PERSONAL",
        consentRequirement: {
          basis: "TRANSACTIONAL_NECESSITY",
          purposeKey: null,
          consentRecordId: null,
        },
        template: { key: "crm_lead_welcome", version: 1 },
        recipients: [{ type: "TO", address: "runtime@example.com" }],
        variables: { fullName: "Runtime Test", corporateEmail: "info@example.com" },
      },
    },
  };
}

function communicationRequest(): CommunicationsSendRequest {
  return {
    version: "v1",
    requestId: `request-${randomUUID()}`,
    idempotencyKey: `idempotency-${randomUUID()}`,
    channel: "EMAIL",
    purpose: "TRANSACTIONAL",
    dataClassification: "PERSONAL",
    consentRequirement: {
      basis: "TRANSACTIONAL_NECESSITY",
      purposeKey: null,
      consentRecordId: null,
    },
    template: { key: "crm_lead_welcome", version: 1 },
    recipients: [{ type: "TO", address: "runtime-direct@example.com" }],
    variables: { fullName: "Direct Runtime", corporateEmail: "info@example.com" },
    testMode: false,
  };
}

function gatewayContext(): GatewayRequestContext {
  return {
    version: "v1",
    identity: {
      principalType: "SYSTEM",
      principalId: `${TEST_PREFIX}system`,
      effectiveActorId: `${TEST_PREFIX}direct-actor`,
      identityLevel: "MFA_VERIFIED",
      permissions: ["communications.send"],
    },
    audit: { correlationId: `correlation-${randomUUID()}` },
    policy: {
      purpose: "runtime-test",
      consentPurposeKeys: [],
      consentVerified: false,
      piiPolicy: "MINIMIZE",
      dataClassification: "PERSONAL",
    },
    deadlineAt: new Date(Date.now() + 10_000).toISOString(),
  };
}
