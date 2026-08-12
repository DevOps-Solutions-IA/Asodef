import { randomUUID } from "node:crypto";
import { BingoOutboxStatus, PrismaClient } from "@prisma/client";
import { createBingoFixture } from "../../../database/bingo-test-fixture";
import { PrismaService } from "../../../database/prisma.service";
import { BingoOutboxPublisherService } from "./bingo-outbox-publisher.service";

describe("Bingo outbox publisher (integration, real PostgreSQL locks)", () => {
  const prisma = new PrismaClient();
  const publisherDb1 = new PrismaService();
  const publisherDb2 = new PrismaService();
  let eventId: string;
  let userId: string;
  let affiliateId: string;
  let customerId: string;

  beforeAll(async () => {
    await Promise.all([publisherDb1.$connect(), publisherDb2.$connect()]);
    const fixture = await createBingoFixture(prisma, "realtime-publisher");
    const event = await fixture.createEvent("realtime-publisher");
    eventId = event.id;
    userId = fixture.user.id;
    affiliateId = fixture.affiliate.id;
    customerId = fixture.customer.id;
  });

  afterAll(async () => {
    if (eventId) {
      await prisma.bingoOutboxEvent.deleteMany({ where: { eventId } });
      await prisma.bingoEvent.delete({ where: { id: eventId } });
      await prisma.affiliate.delete({ where: { id: affiliateId } });
      await prisma.customer.delete({ where: { id: customerId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
    await Promise.all([publisherDb1.$disconnect(), publisherDb2.$disconnect()]);
  });

  it("allows two publishers to contend while publishing each row exactly once", async () => {
    const row = await prisma.bingoOutboxEvent.create({
      data: {
        eventId,
        sequence: 1n,
        eventType: "bingo.execution.started.v1",
        aggregateType: "EXECUTION",
        aggregateId: randomUUID(),
        aggregateVersion: 1n,
        publicPayload: {
          schemaVersion: 1,
          executionId: randomUUID(),
          roundId: randomUUID(),
          revision: 1,
          status: "RUNNING",
          occurredAt: "2026-08-11T12:00:00.000Z",
        },
      },
    });
    const publish = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const first = new BingoOutboxPublisherService(publisherDb1, { publish } as never);
    const second = new BingoOutboxPublisherService(publisherDb2, { publish } as never);
    await Promise.all([
      first.publishReadyBatch(1, new Date(), eventId),
      second.publishReadyBatch(1, new Date(), eventId),
    ]);
    const persisted = await prisma.bingoOutboxEvent.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(persisted).toMatchObject({
      status: BingoOutboxStatus.PUBLISHED,
      attemptCount: 1,
      lastError: null,
    });
    expect(persisted.publishedAt).toBeInstanceOf(Date);
  });

  it("retains the authoritative outbox row and schedules retry on Redis failure", async () => {
    const row = await prisma.bingoOutboxEvent.create({
      data: {
        eventId,
        sequence: 2n,
        eventType: "bingo.execution.paused.v1",
        aggregateType: "EXECUTION",
        aggregateId: randomUUID(),
        aggregateVersion: 2n,
        publicPayload: {
          schemaVersion: 1,
          executionId: randomUUID(),
          roundId: randomUUID(),
          revision: 1,
          status: "PAUSED",
          occurredAt: "2026-08-11T12:01:00.000Z",
        },
      },
    });
    const service = new BingoOutboxPublisherService(
      publisherDb1,
      { publish: jest.fn().mockRejectedValue(new Error("secret transport detail")) } as never,
    );
    await expect(service.publishReadyBatch(1, new Date(), eventId)).resolves.toBe(0);
    await expect(
      prisma.bingoOutboxEvent.findUniqueOrThrow({ where: { id: row.id } }),
    ).resolves.toMatchObject({
      status: BingoOutboxStatus.FAILED,
      attemptCount: 1,
      lastError: "REDIS_PUBLISH_FAILED",
      publishedAt: null,
    });
  });
});
