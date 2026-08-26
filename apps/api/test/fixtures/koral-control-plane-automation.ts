import { randomUUID } from "node:crypto";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { DomainEventEnvelope } from "@asodef/connect-contracts";
import { validateEnv } from "../../src/config/env.validation";
import { PrismaModule } from "../../src/database/prisma.module";
import { PrismaService } from "../../src/database/prisma.service";
import { DomainEventDispatcherService } from "../../src/modules/domain-events/domain-event-dispatcher.service";
import { DomainEventsModule } from "../../src/modules/domain-events/domain-events.module";

const action = process.argv[2];
const marker = process.argv[3]?.trim();

if (process.env.NODE_ENV !== "test" || !/^asodef-ci-[a-z0-9_-]+$/u.test(process.env.COMPOSE_PROJECT_NAME ?? "")) {
  throw new Error("KORAL_CONTROL_PLANE_FIXTURE_REQUIRES_ISOLATED_E2E");
}
if (!marker || !/^koral-control-plane-e2e-[a-z0-9-]{8,80}$/u.test(marker)) {
  throw new Error("KORAL_CONTROL_PLANE_FIXTURE_MARKER_INVALID");
}
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!databaseUrl.pathname.slice(1).startsWith("asodef_ci_")) {
  throw new Error("KORAL_CONTROL_PLANE_FIXTURE_DATABASE_NOT_ISOLATED");
}

void run();

async function run(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
      PrismaModule,
      DomainEventsModule,
    ],
  }).compile();
  const prisma = moduleRef.get(PrismaService);
  try {
    if (action === "create") await create(prisma, moduleRef.get(DomainEventDispatcherService));
    else if (action === "cleanup") await cleanup(prisma);
    else throw new Error("KORAL_CONTROL_PLANE_FIXTURE_ACTION_INVALID");
  } finally {
    await moduleRef.close();
  }
}

async function create(prisma: PrismaService, dispatcher: DomainEventDispatcherService): Promise<void> {
  const automation = await prisma.connectAutomation.create({
    data: { key: marker!, name: `Automation ${marker}`, status: "ACTIVE" },
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
        maxAttempts: 1,
        backoff: { strategy: "EXPONENTIAL", initialDelayMs: 0, maximumDelayMs: 0, jitter: false },
      },
      createdBy: marker!,
      reviewedBy: marker!,
      publishedAt: new Date(),
    },
  });
  const eventId = randomUUID();
  const event: DomainEventEnvelope = {
    eventId,
    eventType: "LeadCreated",
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    producer: marker!,
    subjectType: "ControlPlaneFixture",
    subjectId: randomUUID(),
    correlationId: `correlation-${randomUUID()}`,
    causationId: `causation-${randomUUID()}`,
    idempotencyKey: `event-${randomUUID()}`,
    payload: {
      enabled: true,
      communication: {
        channel: "EMAIL",
        purpose: "TRANSACTIONAL",
        dataClassification: "PERSONAL",
        consentRequirement: { basis: "TRANSACTIONAL_NECESSITY", purposeKey: null, consentRecordId: null },
        template: { key: "crm_lead_welcome", version: 1 },
        recipients: [{ type: "TO", address: "control-plane-e2e@example.com" }],
        variables: { fullName: "Control Plane E2E", corporateEmail: "info@example.com" },
      },
    },
  };
  const dispatched = await dispatcher.dispatch(event);
  if (dispatched.executionIds.length !== 1) throw new Error("KORAL_CONTROL_PLANE_FIXTURE_DISPATCH_FAILED");
  const execution = await prisma.connectAutomationExecution.findUniqueOrThrow({
    where: { id: dispatched.executionIds[0] },
    include: { steps: true },
  });
  if (execution.status !== "SUCCEEDED" || execution.steps.length !== 1 || execution.steps[0]?.status !== "SUCCEEDED") {
    throw new Error("KORAL_CONTROL_PLANE_FIXTURE_EXECUTION_FAILED");
  }
}

async function cleanup(prisma: PrismaService): Promise<void> {
  const automations = await prisma.connectAutomation.findMany({ where: { key: marker! }, select: { id: true } });
  const automationIds = automations.map(({ id }) => id);
  const versions = await prisma.connectAutomationVersion.findMany({ where: { automationId: { in: automationIds } }, select: { id: true } });
  const versionIds = versions.map(({ id }) => id);
  const executions = await prisma.connectAutomationExecution.findMany({ where: { automationVersionId: { in: versionIds } }, select: { id: true, domainEventId: true } });
  const executionIds = executions.map(({ id }) => id);
  const eventIds = executions.flatMap(({ domainEventId }) => domainEventId ? [domainEventId] : []);
  const steps = await prisma.connectAutomationExecutionStep.findMany({ where: { executionId: { in: executionIds } }, select: { id: true } });
  const stepIds = steps.map(({ id }) => id);
  const communications = await prisma.connectCommunication.findMany({ where: { causationId: { in: eventIds } }, select: { id: true } });
  const communicationIds = communications.map(({ id }) => id);
  await prisma.notificationJob.deleteMany({ where: { communicationId: { in: communicationIds } } });
  await prisma.connectCommunicationRecipient.deleteMany({ where: { communicationId: { in: communicationIds } } });
  await prisma.connectCommunication.deleteMany({ where: { id: { in: communicationIds } } });
  await prisma.connectAutomationDeadLetter.deleteMany({ where: { executionId: { in: executionIds } } });
  await prisma.connectAutomationRetry.deleteMany({ where: { stepId: { in: stepIds } } });
  await prisma.connectAutomationExecutionStep.deleteMany({ where: { id: { in: stepIds } } });
  await prisma.connectAutomationExecution.deleteMany({ where: { id: { in: executionIds } } });
  await prisma.connectDomainEvent.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.connectAutomationVersion.deleteMany({ where: { id: { in: versionIds } } });
  await prisma.connectAutomation.deleteMany({ where: { id: { in: automationIds } } });
}
