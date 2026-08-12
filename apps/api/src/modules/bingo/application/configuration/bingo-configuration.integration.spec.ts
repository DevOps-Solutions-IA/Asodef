import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "../../../../database/test-db-client";
import { BingoTransactionKernel, type CommandContext } from "../kernel";
import { BingoConfigurationService } from "./bingo-configuration.service";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

describe("Bingo configuration commands (integration, real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let concurrentPrisma: PrismaClient;
  let userId: string;
  let service: BingoConfigurationService;
  let concurrentService: BingoConfigurationService;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    concurrentPrisma = createTestPrismaClient();
    await Promise.all([prisma.$connect(), concurrentPrisma.$connect()]);
    const user = await prisma.user.create({ data: { email: `bingo-config-${randomUUID()}@example.com`, passwordHash: "test", fullName: "Bingo Config" } });
    userId = user.id;
    service = new BingoConfigurationService(new BingoTransactionKernel({
      transaction: <T>(isolationLevel: Prisma.TransactionIsolationLevel, work: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(work, { isolationLevel }),
    }));
    concurrentService = new BingoConfigurationService(new BingoTransactionKernel({
      transaction: <T>(isolationLevel: Prisma.TransactionIsolationLevel, work: (tx: Prisma.TransactionClient) => Promise<T>) => concurrentPrisma.$transaction(work, { isolationLevel }),
    }, undefined, async () => undefined));
  });

  afterAll(async () => Promise.all([prisma.$disconnect(), concurrentPrisma.$disconnect()]));

  const context = (key: string, permission = "bingo.manage"): CommandContext => ({
    actor: { userId: "", permissions: new Set([permission]) },
    requestId: `request-${key}`,
    idempotencyKey: `configuration-${key}-1234567890`,
    idempotencyKeyHash: hash(`configuration-${key}-1234567890`),
    requestHash: hash(`request-${key}`),
    clock: { now: () => new Date("2026-08-11T20:00:00.000Z") },
  });

  function actorContext(key: string, permission = "bingo.manage") {
    const value = context(key, permission);
    return { ...value, actor: { ...value.actor, userId } };
  }

  it("creates and replays an event with state, audit and outbox in one commit", async () => {
    const slug = `config-${randomUUID()}`;
    const input = {
      slug,
      name: "Bingo empresarial",
      visibility: "AUTHORIZED_PARTICIPANTS" as const,
      eligibilityPolicy: "COMBINED" as const,
      maxCardsPerParticipant: 3,
      publicWinnerVisibility: "CARD_ONLY" as const,
      validationPolicy: "DUAL_CONTROL" as const,
      fairnessMode: "CRYPTO_RNG" as const,
      startsAt: "2026-09-01T20:00:00.000Z",
    };
    const first = await service.createEvent(input, actorContext("create-event", "bingo.create"));
    const replay = await service.createEvent(input, actorContext("create-event", "bingo.create"));

    expect(replay).toEqual({ ...first, replayed: true });
    expect(first).toMatchObject({ resourceType: "EVENT", status: "DRAFT", replayed: false });
    await expect(prisma.bingoEvent.count({ where: { slug } })).resolves.toBe(1);
    await expect(prisma.bingoAuditEvent.count({ where: { eventId: first.eventId, action: "bingo.event.created.v1" } })).resolves.toBe(1);
    await expect(prisma.bingoOutboxEvent.count({ where: { eventId: first.eventId, eventType: "bingo.event.created.v1" } })).resolves.toBe(1);
    await expect(prisma.bingoCommandIdempotency.count({ where: { eventId: first.eventId, operation: "CREATE_EVENT" } })).resolves.toBe(1);
  });

  it("serializes concurrent retries of the same event command", async () => {
    const slug = `config-concurrent-${randomUUID()}`;
    const input = {
      slug,
      name: "Evento concurrente",
      visibility: "PUBLIC" as const,
      eligibilityPolicy: "AFFILIATES" as const,
      maxCardsPerParticipant: 1,
      publicWinnerVisibility: "CARD_ONLY" as const,
      validationPolicy: "SIMPLE" as const,
      fairnessMode: "CRYPTO_RNG" as const,
      startsAt: "2026-09-01T21:00:00.000Z",
    };
    const results = await Promise.all([
      service.createEvent(input, actorContext("concurrent-event", "bingo.create")),
      concurrentService.createEvent(input, actorContext("concurrent-event", "bingo.create")),
    ]);
    expect(new Set(results.map((result) => result.resourceId)).size).toBe(1);
    expect(results.filter((result) => result.replayed).length).toBe(1);
    await expect(prisma.bingoEvent.count({ where: { slug } })).resolves.toBe(1);
    await expect(prisma.bingoAuditEvent.count({ where: { eventId: results[0]!.eventId, action: "bingo.event.created.v1" } })).resolves.toBe(1);
  });

  it("persists round, validated pattern and exact monetary prize with audit/outbox", async () => {
    const event = await service.createEvent({
      slug: `config-tree-${randomUUID()}`,
      name: "Árbol de configuración",
      visibility: "PUBLIC",
      eligibilityPolicy: "AFFILIATES",
      maxCardsPerParticipant: 1,
      publicWinnerVisibility: "CARD_ONLY",
      validationPolicy: "SIMPLE",
      fairnessMode: "CRYPTO_RNG",
      startsAt: "2026-09-02T20:00:00.000Z",
    }, actorContext("tree-event", "bingo.create"));
    const round = await service.createRound(event.eventId, { order: 1, name: "Línea", tiePolicy: "SPLIT_PRIZE", validationPolicy: "SIMPLE" }, actorContext("tree-round"));
    const pattern = await service.createPattern(event.eventId, round.resourceId, { name: "Línea horizontal", kind: "LINE", masks: [{ positions: [0, 1, 2, 3, 4] }], includeFreeCenter: true }, actorContext("tree-pattern"));
    const prize = await service.createPrize(event.eventId, round.resourceId, { kind: "MONETARY", name: "Premio", monetaryAmount: "100.25", currency: "COP" }, actorContext("tree-prize"));

    await service.updateEvent(event.eventId, { name: "Árbol actualizado" }, actorContext("tree-event-update"));
    await service.updateRound(event.eventId, round.resourceId, { name: "Línea actualizada" }, actorContext("tree-round-update"));
    await service.updatePattern(event.eventId, round.resourceId, pattern.resourceId, { name: "Línea horizontal actualizada" }, actorContext("tree-pattern-update"));
    await service.updatePrize(event.eventId, round.resourceId, prize.resourceId, { monetaryAmount: "200.50" }, actorContext("tree-prize-update"));

    const storedPrize = await prisma.bingoPrize.findUniqueOrThrow({ where: { id: prize.resourceId } });
    expect(storedPrize.amountMinor).toBe(20_050);
    expect(storedPrize.currency).toBe("COP");
    await expect(prisma.bingoPatternMask.count({ where: { patternId: pattern.resourceId } })).resolves.toBe(1);
    await expect(prisma.bingoRoundPattern.count({ where: { roundId: round.resourceId, patternId: pattern.resourceId } })).resolves.toBe(1);
    await expect(prisma.bingoAuditEvent.count({ where: { eventId: event.eventId } })).resolves.toBe(8);
    await expect(prisma.bingoOutboxEvent.count({ where: { eventId: event.eventId } })).resolves.toBe(8);
  });

  it("rejects configuration mutation after publication without partial evidence", async () => {
    const event = await service.createEvent({
      slug: `config-frozen-${randomUUID()}`,
      name: "Congelado",
      visibility: "PUBLIC",
      eligibilityPolicy: "AFFILIATES",
      maxCardsPerParticipant: 1,
      publicWinnerVisibility: "CARD_ONLY",
      validationPolicy: "SIMPLE",
      fairnessMode: "CRYPTO_RNG",
      startsAt: "2026-09-03T20:00:00.000Z",
    }, actorContext("frozen-event", "bingo.create"));
    await prisma.bingoEvent.update({ where: { id: event.eventId }, data: { status: "PUBLISHED", publishedAt: new Date(), configurationLockedAt: new Date() } });
    const before = await prisma.bingoAuditEvent.count({ where: { eventId: event.eventId } });

    await expect(service.updateEvent(event.eventId, { maxCardsPerParticipant: 2 }, actorContext("frozen-update"))).rejects.toMatchObject({ code: "BINGO_INVALID_STATE_TRANSITION" });
    await expect(prisma.bingoEvent.findUniqueOrThrow({ where: { id: event.eventId }, select: { maxCardsPerParticipant: true } })).resolves.toEqual({ maxCardsPerParticipant: 1 });
    await expect(prisma.bingoAuditEvent.count({ where: { eventId: event.eventId } })).resolves.toBe(before);
    await expect(prisma.bingoOutboxEvent.count({ where: { eventId: event.eventId, eventType: "bingo.event.updated.v1" } })).resolves.toBe(0);
  });
});
