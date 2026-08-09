import { randomUUID } from "node:crypto";
import {
  BingoParticipantKind,
  BingoParticipantStatus,
  PrismaClient,
} from "@prisma/client";
import { createBingoFixture, sha256 } from "./bingo-test-fixture";
import { createTestPrismaClient } from "./test-db-client";

describe("Bingo persistence concurrency (integration, real PostgreSQL)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => prisma.$disconnect());

  it("allows only one concurrent participant for the same affiliate and event", async () => {
    const fixture = await createBingoFixture(prisma, "participant-race");
    const event = await fixture.createEvent("participant-race");
    const create = () =>
      prisma.bingoParticipant.create({
        data: {
          eventId: event.id,
          kind: BingoParticipantKind.AFFILIATE,
          status: BingoParticipantStatus.APPROVED,
          affiliateId: fixture.affiliate.id,
          approvedAt: new Date(),
        },
      });

    const results = await Promise.allSettled(Array.from({ length: 8 }, create));
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    await expect(
      prisma.bingoParticipant.count({
        where: { eventId: event.id, affiliateId: fixture.affiliate.id },
      }),
    ).resolves.toBe(1);
  });

  it("serializes the participant card limit and leaves one active assignment", async () => {
    const fixture = await createBingoFixture(prisma, "assignment-limit");
    const event = await fixture.createEvent("assignment-limit", {
      maxCards: 1,
    });
    const participant = await fixture.createAffiliateParticipant(event.id);
    const cards = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        fixture.createCard(event.id, `LIMIT-${index}`),
      ),
    );

    const results = await Promise.allSettled(
      cards.map((card) =>
        fixture.assignCard(event.id, card.id, participant.id),
      ),
    );
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    await expect(
      prisma.bingoCardAssignment.count({
        where: {
          eventId: event.id,
          participantId: participant.id,
          status: "ACTIVE",
        },
      }),
    ).resolves.toBe(1);
  });

  it("allows only one concurrent active assignment for the same card", async () => {
    const fixture = await createBingoFixture(prisma, "assignment-card");
    const event = await fixture.createEvent("assignment-card", { maxCards: 5 });
    const affiliateParticipant = await fixture.createAffiliateParticipant(
      event.id,
    );
    const guest = await fixture.createGuestParticipant(event.id);
    const card = await fixture.createCard(event.id);

    const results = await Promise.allSettled([
      fixture.assignCard(event.id, card.id, affiliateParticipant.id),
      fixture.assignCard(event.id, card.id, guest.participant.id),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    await expect(
      prisma.bingoCardAssignment.count({
        where: { eventId: event.id, cardId: card.id, status: "ACTIVE" },
      }),
    ).resolves.toBe(1);
  });

  it("deduplicates concurrent idempotency keys at the database boundary", async () => {
    const fixture = await createBingoFixture(prisma, "idempotency-race");
    const event = await fixture.createEvent("idempotency-race");
    const keyHash = sha256("same-logical-command");
    const create = () =>
      prisma.bingoCommandIdempotency.create({
        data: {
          eventId: event.id,
          actorUserId: fixture.user.id,
          scope: `event:${event.id}`,
          operation: "PUBLISH_EVENT",
          keyHash,
          requestHash: sha256("same-request"),
        },
      });

    const results = await Promise.allSettled(Array.from({ length: 8 }, create));
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    await expect(
      prisma.bingoCommandIdempotency.count({
        where: {
          actorUserId: fixture.user.id,
          scope: `event:${event.id}`,
          operation: "PUBLISH_EVENT",
          keyHash,
        },
      }),
    ).resolves.toBe(1);
  });

  it("never leaves two concurrent active executions for one round", async () => {
    const fixture = await createBingoFixture(prisma, "execution-race");
    const event = await fixture.createEvent("execution-race");
    const configured = await fixture.createConfiguredRound(event.id);
    const first = await fixture.createExecution(event.id, configured.round.id, {
      revision: 1,
    });
    const second = await fixture.createExecution(
      event.id,
      configured.round.id,
      { revision: 2 },
    );
    const start = (id: string) =>
      prisma.bingoRoundExecution.update({
        where: { id },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          operatorUserId: fixture.user.id,
        },
      });

    const results = await Promise.allSettled([
      start(first.id),
      start(second.id),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    await expect(
      prisma.bingoRoundExecution.count({
        where: {
          roundId: configured.round.id,
          status: { in: ["RUNNING", "PAUSED"] },
        },
      }),
    ).resolves.toBe(1);
  });

  it("prevents concurrent duplicate draw sequence and duplicate ball persistence", async () => {
    const fixture = await createBingoFixture(prisma, "draw-race");
    const event = await fixture.createEvent("draw-race");
    const configured = await fixture.createConfiguredRound(event.id);
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
    );
    const createIdempotency = (label: string) =>
      prisma.bingoCommandIdempotency.create({
        data: {
          eventId: event.id,
          executionId: execution.id,
          actorUserId: fixture.user.id,
          scope: `draw:${execution.id}`,
          operation: "DRAW_BALL",
          keyHash: sha256(label),
          requestHash: sha256(`request:${label}`),
        },
      });
    const keys = await Promise.all([
      createIdempotency("a"),
      createIdempotency("b"),
    ]);
    const createDraw = (
      sequence: number,
      ballNumber: number,
      idempotencyRecordId: string,
    ) =>
      prisma.bingoDraw.create({
        data: {
          eventId: event.id,
          roundId: configured.round.id,
          executionId: execution.id,
          sequence,
          ballNumber,
          drawnByUserId: fixture.user.id,
          drawnAt: new Date(),
          requestId: randomUUID(),
          idempotencyRecordId,
          evidenceHash: sha256(randomUUID()),
          rngEvidence: { source: "test" },
          stateVersion: sequence,
        },
      });

    const sequenceRace = await Promise.allSettled([
      createDraw(1, 10, keys[0]!.id),
      createDraw(1, 11, keys[1]!.id),
    ]);
    expect(
      sequenceRace.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);

    const winningBall = (
      sequenceRace.find(
        (result) => result.status === "fulfilled",
      ) as PromiseFulfilledResult<{ ballNumber: number }>
    ).value.ballNumber;
    const nextKey = await createIdempotency("c");
    await expect(createDraw(2, winningBall, nextKey.id)).rejects.toBeDefined();
    await expect(
      prisma.bingoDraw.count({ where: { executionId: execution.id } }),
    ).resolves.toBe(1);
  });

  it("freezes all assignment changes once an execution starts", async () => {
    const fixture = await createBingoFixture(prisma, "assignment-freeze");
    const event = await fixture.createEvent("assignment-freeze", {
      maxCards: 5,
    });
    const participant = await fixture.createAffiliateParticipant(event.id);
    const firstCard = await fixture.createCard(event.id, "FREEZE-1");
    const secondCard = await fixture.createCard(event.id, "FREEZE-2");
    const assignment = await fixture.assignCard(
      event.id,
      firstCard.id,
      participant.id,
    );
    const configured = await fixture.createConfiguredRound(event.id);
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
    );
    await prisma.bingoRoundExecution.update({
      where: { id: execution.id },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        operatorUserId: fixture.user.id,
      },
    });

    await expect(
      fixture.assignCard(event.id, secondCard.id, participant.id),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoCardAssignment.update({
        where: { id: assignment.id },
        data: { status: "REVOKED", deactivatedAt: new Date() },
      }),
    ).rejects.toBeDefined();
  });
});
