import { randomUUID } from "node:crypto";
import {
  BingoTiePolicy,
  BingoValidationPolicy,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  BIT_75,
  createBingoFixture,
  sha256,
} from "../../../../database/bingo-test-fixture";
import { createTestPrismaClient } from "../../../../database/test-db-client";
import type {
  OutcomeCommandContext,
  OutcomeLockManager,
} from "./outcome-contracts";
import {
  BingoOutcomeApplicationErrorCode,
  PrismaBingoOutcomeService,
  PrismaOutcomeOutboxSequenceAllocator,
} from ".";

class TestCanonicalLockManager implements OutcomeLockManager {
  async acquire(
    tx: Prisma.TransactionClient,
    scope: Parameters<OutcomeLockManager["acquire"]>[1],
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM bingo_events WHERE id = ${scope.eventId}::uuid FOR UPDATE`;
    if (scope.roundId !== undefined) {
      await tx.$queryRaw`SELECT id FROM bingo_rounds WHERE id = ${scope.roundId}::uuid AND event_id = ${scope.eventId}::uuid FOR UPDATE`;
    }
    if (scope.executionId !== undefined) {
      await tx.$queryRaw`SELECT id FROM bingo_round_executions WHERE id = ${scope.executionId}::uuid AND event_id = ${scope.eventId}::uuid FOR UPDATE`;
    }
    for (const id of [...(scope.candidateIds ?? [])].sort()) {
      await tx.$queryRaw`SELECT id FROM bingo_winner_candidates WHERE id = ${id}::uuid FOR UPDATE`;
    }
    for (const id of [...(scope.winnerIds ?? [])].sort()) {
      await tx.$queryRaw`SELECT id FROM bingo_winners WHERE id = ${id}::uuid FOR UPDATE`;
    }
  }
}

describe("Bingo outcomes application (integration, real PostgreSQL)", () => {
  let prisma: PrismaClient;
  const service = new PrismaBingoOutcomeService(
    new TestCanonicalLockManager(),
    new PrismaOutcomeOutboxSequenceAllocator(),
  );

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => prisma.$disconnect());

  function context(
    userId: string,
    suffix: string,
    now = new Date("2026-08-11T18:00:00.000Z"),
  ): OutcomeCommandContext {
    return {
      actor: { userId, permissions: new Set(["bingo.validate"]) },
      requestId: `outcome-request-${suffix}-${randomUUID()}`,
      idempotencyKey: `outcome-key-${suffix}-${randomUUID()}`,
      now,
    };
  }

  async function graph(
    label: string,
    options: {
      validationPolicy?: BingoValidationPolicy;
      tiePolicy?: BingoTiePolicy;
      candidates?: number;
    } = {},
  ) {
    const validationPolicy =
      options.validationPolicy ?? BingoValidationPolicy.SIMPLE;
    const tiePolicy = options.tiePolicy ?? BingoTiePolicy.SPLIT_PRIZE;
    const fixture = await createBingoFixture(prisma, label);
    const event = await fixture.createEvent(label, {
      validationPolicy,
      maxCards: 1,
    });
    const configured = await fixture.createConfiguredRound(event.id, {
      validationPolicy,
      tiePolicy,
    });
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
      { validationPolicy, tiePolicy },
    );
    const idempotency = await prisma.bingoCommandIdempotency.create({
      data: {
        eventId: event.id,
        executionId: execution.id,
        actorUserId: fixture.user.id,
        scope: `execution:${execution.id}`,
        operation: "DRAW_NEXT_BALL",
        keyHash: sha256(randomUUID()),
        requestHash: sha256(randomUUID()),
      },
    });
    const draw = await prisma.bingoDraw.create({
      data: {
        eventId: event.id,
        roundId: configured.round.id,
        executionId: execution.id,
        sequence: 1,
        ballNumber: 1,
        drawnByUserId: fixture.user.id,
        drawnAt: new Date("2026-08-11T17:00:00.000Z"),
        requestId: randomUUID(),
        idempotencyRecordId: idempotency.id,
        evidenceHash: sha256(randomUUID()),
        rngEvidence: { schemaVersion: 1, algorithm: "test" },
        stateVersion: 1,
      },
    });
    const winGroup = await prisma.bingoWinGroup.create({
      data: {
        eventId: event.id,
        roundId: configured.round.id,
        executionId: execution.id,
        prizeId: configured.prize.id,
        patternId: configured.pattern.id,
        roundPatternId: configured.roundPattern.id,
        decisiveDrawId: draw.id,
        tiePolicySnapshot: tiePolicy,
        candidateCount: options.candidates ?? 2,
        detectedAt: new Date("2026-08-11T17:00:01.000Z"),
        evidenceHash: sha256(randomUUID()),
      },
    });
    const candidates = [];
    for (let index = 0; index < (options.candidates ?? 2); index += 1) {
      const participant =
        index === 0
          ? await fixture.createAffiliateParticipant(event.id)
          : (await fixture.createGuestParticipant(event.id)).participant;
      const card = await fixture.createCard(event.id, `OUTCOME-${index + 1}`);
      const assignment = await fixture.assignCard(
        event.id,
        card.id,
        participant.id,
      );
      const candidate = await prisma.bingoWinnerCandidate.create({
        data: {
          eventId: event.id,
          executionId: execution.id,
          winGroupId: winGroup.id,
          cardId: card.id,
          participantId: participant.id,
          assignmentId: assignment.id,
          matchedNumbers: BIT_75,
          decisiveBall: draw.ballNumber,
          detectedAt: new Date("2026-08-11T17:00:01.000Z"),
          evidenceHash: sha256(`${label}:${index}:${randomUUID()}`),
        },
      });
      candidates.push(candidate);
    }
    return { fixture, event, configured, execution, winGroup, candidates };
  }

  it("validates every simultaneous candidate and confirms all exact split winners atomically", async () => {
    const data = await graph("outcome-split");
    for (const [index, candidate] of data.candidates.entries()) {
      const result = await prisma.$transaction((tx) =>
        service.validateCandidate(
          tx,
          context(data.fixture.user.id, `validate-${index}`),
          { eventId: data.event.id, candidateId: candidate.id },
        ),
      );
      expect(result.status).toBe("VALIDATED");
    }
    const commandContext = context(data.fixture.user.id, "confirm");
    const result = await prisma.$transaction((tx) =>
      service.confirmWinners(tx, commandContext, {
        eventId: data.event.id,
        winGroupId: data.winGroup.id,
      }),
    );
    expect(result.winnerIds).toHaveLength(2);
    expect(result.policy).toBe("SPLIT_PRIZE");
    const winners = await prisma.bingoWinner.findMany({
      where: { winGroupId: data.winGroup.id },
      orderBy: { candidateId: "asc" },
    });
    expect(winners).toHaveLength(2);
    expect(winners.every(({ status }) => status === "CONFIRMED")).toBe(true);
    expect(winners.map(({ tieResolution }) => tieResolution)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          policy: "SPLIT_PRIZE",
          simultaneousCandidateCount: 2,
          allocation: expect.objectContaining({
            numerator: "1",
            denominator: "2",
          }),
        }),
      ]),
    );
    await expect(
      prisma.bingoAuditEvent.count({
        where: {
          eventId: data.event.id,
          action: "bingo.winner.confirmed.v1",
        },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.bingoOutboxEvent.count({
        where: {
          eventId: data.event.id,
          eventType: "bingo.winner.confirmed.v1",
        },
      }),
    ).resolves.toBe(2);

    const replayed = await prisma.$transaction((tx) =>
      service.confirmWinners(tx, commandContext, {
        eventId: data.event.id,
        winGroupId: data.winGroup.id,
      }),
    );
    expect(replayed).toMatchObject({ replayed: true });
    expect(replayed.winnerIds).toHaveLength(2);
  });

  it("rejects candidates with a mandatory reason and never creates a winner", async () => {
    const data = await graph("outcome-reject", { candidates: 1 });
    await expect(
      prisma.$transaction((tx) =>
        service.rejectCandidate(
          tx,
          context(data.fixture.user.id, "blank-reject"),
          {
            eventId: data.event.id,
            candidateId: data.candidates[0]!.id,
            reason: "   ",
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: BingoOutcomeApplicationErrorCode.REJECTION_REASON_REQUIRED,
    });
    await prisma.$transaction((tx) =>
      service.rejectCandidate(
        tx,
        context(data.fixture.user.id, "valid-reject"),
        {
          eventId: data.event.id,
          candidateId: data.candidates[0]!.id,
          reason: "La evidencia del patrón no es válida",
        },
      ),
    );
    await expect(
      prisma.bingoWinnerCandidate.findUnique({
        where: { id: data.candidates[0]!.id },
        select: { status: true, rejectionReason: true },
      }),
    ).resolves.toEqual({
      status: "REJECTED",
      rejectionReason: "La evidencia del patrón no es válida",
    });
    await expect(
      prisma.bingoWinner.count({ where: { winGroupId: data.winGroup.id } }),
    ).resolves.toBe(0);
  });

  it("enforces distinct configured supervision across every execution actor", async () => {
    const data = await graph("outcome-dual", {
      validationPolicy: BingoValidationPolicy.DUAL_CONTROL,
      candidates: 1,
    });
    const supervisor = await prisma.user.create({
      data: {
        email: `outcome-supervisor-${randomUUID()}@example.com`,
        passwordHash: "test",
        fullName: "Outcome Supervisor",
      },
    });
    await prisma.bingoRoundExecution.update({
      where: { id: data.execution.id },
      data: {
        operatorUserId: data.fixture.user.id,
        supervisorUserId: supervisor.id,
      },
    });
    await prisma.bingoExecutionActor.create({
      data: {
        executionId: data.execution.id,
        userId: data.fixture.user.id,
        firstActionAt: new Date(),
        lastActionAt: new Date(),
      },
    });
    await expect(
      prisma.$transaction((tx) =>
        service.validateCandidate(
          tx,
          context(data.fixture.user.id, "dual-operator"),
          { eventId: data.event.id, candidateId: data.candidates[0]!.id },
        ),
      ),
    ).rejects.toMatchObject({
      code: BingoOutcomeApplicationErrorCode.DUAL_CONTROL_ACTOR_CONFLICT,
    });
    await expect(
      prisma.$transaction((tx) =>
        service.validateCandidate(
          tx,
          context(supervisor.id, "dual-supervisor"),
          { eventId: data.event.id, candidateId: data.candidates[0]!.id },
        ),
      ),
    ).resolves.toMatchObject({ status: "VALIDATED" });
  });

  it("returns structured tie-break/special decisions without creating arbitrary winners", async () => {
    for (const tiePolicy of [
      BingoTiePolicy.TIE_BREAK,
      BingoTiePolicy.PRECONFIGURED_SPECIAL_RULE,
    ]) {
      const data = await graph(`outcome-${tiePolicy}`, {
        tiePolicy,
        candidates: 1,
      });
      await prisma.bingoWinnerCandidate.update({
        where: { id: data.candidates[0]!.id },
        data: { status: "VALIDATED" },
      });
      await expect(
        prisma.$transaction((tx) =>
          service.confirmWinners(tx, context(data.fixture.user.id, tiePolicy), {
            eventId: data.event.id,
            winGroupId: data.winGroup.id,
          }),
        ),
      ).rejects.toMatchObject({
        code:
          tiePolicy === BingoTiePolicy.TIE_BREAK
            ? BingoOutcomeApplicationErrorCode.TIE_BREAK_REQUIRED
            : BingoOutcomeApplicationErrorCode.INVALID_STATE,
      });
      await expect(
        prisma.bingoWinner.count({ where: { winGroupId: data.winGroup.id } }),
      ).resolves.toBe(0);
    }
  });

  it("rolls candidate, audit, outbox and idempotency back together and rejects cross-event IDs", async () => {
    const first = await graph("outcome-rollback", { candidates: 1 });
    const second = await graph("outcome-cross", { candidates: 1 });
    const requestId = `outcome-rollback-${randomUUID()}`;
    const rollbackContext = {
      ...context(first.fixture.user.id, "rollback"),
      requestId,
    };
    await expect(
      prisma.$transaction(async (tx) => {
        await service.validateCandidate(tx, rollbackContext, {
          eventId: first.event.id,
          candidateId: first.candidates[0]!.id,
        });
        throw new Error("forced-outcome-rollback");
      }),
    ).rejects.toThrow("forced-outcome-rollback");
    await expect(
      prisma.bingoWinnerCandidate.findUnique({
        where: { id: first.candidates[0]!.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "PENDING" });
    await expect(
      prisma.bingoAuditEvent.count({ where: { requestId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.bingoCommandIdempotency.count({
        where: {
          actorUserId: first.fixture.user.id,
          operation: "VALIDATE_CANDIDATE",
        },
      }),
    ).resolves.toBe(0);

    await expect(
      prisma.$transaction((tx) =>
        service.validateCandidate(
          tx,
          context(first.fixture.user.id, "cross-event"),
          {
            eventId: second.event.id,
            candidateId: first.candidates[0]!.id,
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: BingoOutcomeApplicationErrorCode.NOT_FOUND,
    });
  });
});
