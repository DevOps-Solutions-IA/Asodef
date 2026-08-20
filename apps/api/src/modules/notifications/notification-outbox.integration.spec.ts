import { randomUUID } from "node:crypto";
import { ConfigModule } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type { MailSendResult, MailTransport, OutboundEmailMessage } from "./mail-transport.interface";
import { MAIL_TRANSPORT } from "./mail-transport.interface";
import { NotificationsModule } from "./notifications.module";
import { NotificationService } from "./notification.service";
import { PrismaModule } from "../../database/prisma.module";
import { PrismaService } from "../../database/prisma.service";
import { validateEnv } from "../../config/env.validation";

class ControllableMailTransport implements MailTransport {
  mode: "success" | "failure" | "unknown" | "throw" = "success";
  readonly messages: OutboundEmailMessage[] = [];

  async send(message: OutboundEmailMessage): Promise<MailSendResult> {
    this.messages.push(message);
    if (this.mode === "throw") throw new Error("sensitive transport detail must not persist");
    if (this.mode === "unknown") return { delivered: false, uncertain: true, failureReason: "SMTP_TIMEOUT" };
    if (this.mode === "failure") return { delivered: false, failureReason: "raw provider secret-like detail" };
    return { delivered: true, providerMessageId: `provider-${message.idempotencyKey}` };
  }

  reset(): void {
    this.mode = "success";
    this.messages.length = 0;
  }
}

describe("NotificationService durable outbox (integration, real Postgres)", () => {
  let moduleRef: TestingModule;
  let service: NotificationService;
  let prisma: PrismaService;
  let transport: ControllableMailTransport;
  let userId: string;

  beforeAll(async () => {
    transport = new ControllableMailTransport();
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
        PrismaModule,
        NotificationsModule,
      ],
    })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(transport)
      .compile();

    service = moduleRef.get(NotificationService);
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    transport.reset();
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        fullName: "Notification Outbox Test",
        passwordHash: "not-a-real-login-hash",
        status: "ACTIVE",
      },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.securityEvent.deleteMany({ where: { userId } });
    await prisma.notificationJob.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function queueReset(marker = randomUUID()): Promise<string> {
    return service.queuePasswordResetEmail({
      recipientEmail: `${marker}@example.com`,
      userId,
      resetUrl: `https://example.com/reset?token=${marker}`,
      correlationId: randomUUID(),
    });
  }

  it("persists only an encrypted payload before delivery", async () => {
    const marker = randomUUID();
    const id = await queueReset(marker);
    const job = await prisma.notificationJob.findUniqueOrThrow({ where: { id } });

    expect(job.status).toBe("QUEUED");
    expect(job.payloadEncrypted).toBeTruthy();
    expect(job.payloadEncrypted).not.toContain(marker);
    expect(transport.messages).toHaveLength(0);
  });

  it("does not start a background worker implicitly in NODE_ENV=test", async () => {
    const id = await queueReset();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect((await prisma.notificationJob.findUniqueOrThrow({ where: { id } })).status).toBe("QUEUED");
    expect(transport.messages.filter((message) => message.idempotencyKey === id)).toHaveLength(0);
  });

  it("allows only one concurrent claimant to deliver a job", async () => {
    const id = await queueReset();

    await Promise.all([service.processAvailableJobs(), service.processAvailableJobs()]);

    const job = await prisma.notificationJob.findUniqueOrThrow({ where: { id } });
    const deliveriesForJob = transport.messages.filter((message) => message.idempotencyKey === id);
    expect(deliveriesForJob).toHaveLength(1);
    expect(job.status).toBe("SENT");
    expect(job.retryCount).toBe(1);
    expect(job.providerMessageId).toBe(`provider-${id}`);
  });

  it("recovers an expired PROCESSING lease after a worker crash", async () => {
    const id = await queueReset();
    await prisma.notificationJob.update({
      where: { id },
      data: {
        status: "PROCESSING",
        lockedBy: "crashed-worker",
        lockedAt: new Date(Date.now() - 120_000),
        lockExpiresAt: new Date(Date.now() - 60_000),
      },
    });

    await expect(service.processAvailableJobs()).resolves.toBe(1);

    expect(transport.messages.filter((message) => message.idempotencyKey === id)).toHaveLength(1);
    expect((await prisma.notificationJob.findUniqueOrThrow({ where: { id } })).status).toBe("SENT");
  });

  it("schedules sanitized exponential retry metadata after transport failure", async () => {
    transport.mode = "failure";
    const id = await queueReset();
    const before = Date.now();

    await service.processAvailableJobs();
    await expect(service.processAvailableJobs()).resolves.toBe(0);

    const job = await prisma.notificationJob.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("RETRY_PENDING");
    expect(job.retryCount).toBe(1);
    expect(job.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 4_000);
    expect(job.failureReason).toBe("SMTP_DELIVERY_FAILED");
    expect(JSON.stringify(job)).not.toContain("secret-like detail");
    expect(transport.messages.filter((message) => message.idempotencyKey === id)).toHaveLength(1);
  });

  it("moves an exhausted job to DEAD_LETTER without another claimant owning it", async () => {
    transport.mode = "failure";
    const id = await queueReset();
    await prisma.notificationJob.update({ where: { id }, data: { maxAttempts: 1 } });

    await service.processAvailableJobs();

    const job = await prisma.notificationJob.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("DEAD_LETTER");
    expect(job.retryCount).toBe(1);
    expect(job.lockedBy).toBeNull();
  });

  it("does not blindly retry an unknown provider result", async () => {
    transport.mode = "unknown";
    const id = await queueReset();

    await service.processAvailableJobs();
    await service.processAvailableJobs();

    const job = await prisma.notificationJob.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("UNKNOWN_RESULT");
    expect(job.retryCount).toBe(1);
    expect(job.failureReason).toBe("SMTP_TIMEOUT");
    expect(transport.messages.filter((message) => message.idempotencyKey === id)).toHaveLength(1);
  });

  it("contains a throwing transport and leaves a retryable durable row", async () => {
    transport.mode = "throw";
    const id = await queueReset();

    await expect(service.processAvailableJobs()).resolves.toBe(1);

    const job = await prisma.notificationJob.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("RETRY_PENDING");
    expect(job.failureReason).toBe("UNEXPECTED_DISPATCH_ERROR");
    expect(JSON.stringify(job)).not.toContain("sensitive transport detail");
  });

  it("fails historical rows without recoverable payload closed into DEAD_LETTER", async () => {
    const id = await queueReset();
    await prisma.notificationJob.update({ where: { id }, data: { payloadEncrypted: null } });

    await service.processAvailableJobs();

    const job = await prisma.notificationJob.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("DEAD_LETTER");
    expect(job.failureReason).toBe("INVALID_OR_MISSING_PAYLOAD");
    expect(transport.messages.filter((message) => message.idempotencyKey === id)).toHaveLength(0);
  });
});
