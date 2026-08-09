import { randomUUID } from "node:crypto";
import {
  BingoFairnessMode,
  BingoParticipantKind,
  BingoParticipantStatus,
  BingoValidationPolicy,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import {
  BIT_75,
  createBingoFixture,
  sha256,
  VALID_CARD,
} from "./bingo-test-fixture";
import { createTestPrismaClient } from "./test-db-client";

describe("Bingo schema integrity (integration, real PostgreSQL)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => prisma.$disconnect());

  async function createEvidenceGraph(
    label: string,
    validationPolicy: BingoValidationPolicy = BingoValidationPolicy.SIMPLE,
  ) {
    const fixture = await createBingoFixture(prisma, label);
    const event = await fixture.createEvent(label, { validationPolicy });
    const participant = await fixture.createAffiliateParticipant(event.id);
    const configured = await fixture.createConfiguredRound(event.id, {
      validationPolicy,
    });
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
      { validationPolicy },
    );
    const card = await fixture.createCard(event.id);
    const assignment = await fixture.assignCard(
      event.id,
      card.id,
      participant.id,
    );
    const idempotency = await prisma.bingoCommandIdempotency.create({
      data: {
        eventId: event.id,
        executionId: execution.id,
        actorUserId: fixture.user.id,
        scope: `draw:${execution.id}`,
        operation: "DRAW_BALL",
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
        drawnAt: new Date(),
        requestId: randomUUID(),
        idempotencyRecordId: idempotency.id,
        evidenceHash: sha256(randomUUID()),
        rngEvidence: { algorithm: "test-fixture" },
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
        tiePolicySnapshot: configured.round.tiePolicy,
        candidateCount: 1,
        detectedAt: new Date(),
        evidenceHash: sha256(randomUUID()),
      },
    });
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
        detectedAt: new Date(),
        evidenceHash: sha256(randomUUID()),
      },
    });
    return {
      fixture,
      event,
      participant,
      configured,
      execution,
      card,
      assignment,
      idempotency,
      draw,
      winGroup,
      candidate,
    };
  }

  it("rejects cross-event round, execution, card, participant, prize, candidate and winner references", async () => {
    const first = await createEvidenceGraph("cross-a");
    const second = await createEvidenceGraph("cross-b");

    await expect(
      prisma.bingoRoundExecution.create({
        data: {
          eventId: second.event.id,
          roundId: first.configured.round.id,
          revision: 20,
          validationPolicySnapshot: first.configured.round.validationPolicy,
          tiePolicySnapshot: first.configured.round.tiePolicy,
          fairnessModeSnapshot: first.event.fairnessMode,
          configurationVersion: 1,
          createdByUserId: first.fixture.user.id,
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.bingoCardAssignment.create({
        data: {
          eventId: first.event.id,
          cardId: first.card.id,
          participantId: second.participant.id,
          actorUserId: first.fixture.user.id,
          reason: "cross-event attempt",
          requestId: randomUUID(),
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.bingoWinnerCandidate.create({
        data: {
          eventId: first.event.id,
          executionId: first.execution.id,
          winGroupId: first.winGroup.id,
          cardId: second.card.id,
          participantId: second.participant.id,
          assignmentId: second.assignment.id,
          matchedNumbers: BIT_75,
          decisiveBall: first.draw.ballNumber,
          detectedAt: new Date(),
          evidenceHash: sha256(randomUUID()),
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.bingoWinner.create({
        data: {
          eventId: first.event.id,
          roundId: first.configured.round.id,
          executionId: first.execution.id,
          winGroupId: first.winGroup.id,
          candidateId: first.candidate.id,
          prizeId: second.configured.prize.id,
          validationPolicySnapshot: BingoValidationPolicy.SIMPLE,
          evidenceHash: sha256(randomUUID()),
          publicDisplaySnapshot: { card: first.card.displayNumber },
        },
      }),
    ).rejects.toBeDefined();
  });

  it("enforces canonical 75-ball cards, free center, event-local number and layout uniqueness", async () => {
    const fixture = await createBingoFixture(prisma, "cards");
    const event = await fixture.createEvent("cards");
    await fixture.createCard(event.id, "CARD-1");

    await expect(
      prisma.bingoCard.create({
        data: {
          eventId: event.id,
          displayNumber: "BAD-CENTER",
          numbers: VALID_CARD.map((n, i) => (i === 12 ? 33 : n)),
          layoutHash: sha256("bad-center"),
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoCard.create({
        data: {
          eventId: event.id,
          displayNumber: "CARD-1",
          numbers: VALID_CARD,
          layoutHash: sha256("other-layout"),
        },
      }),
    ).rejects.toMatchObject({
      code: "P2002",
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
    await expect(
      prisma.bingoCard.create({
        data: {
          eventId: event.id,
          displayNumber: "CARD-2",
          numbers: VALID_CARD,
          layoutHash: sha256(`${event.id}:CARD-1`),
        },
      }),
    ).rejects.toMatchObject({
      code: "P2002",
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it("keeps affiliate identity and authorized external identity mutually exclusive and event-scoped", async () => {
    const fixture = await createBingoFixture(prisma, "subjects");
    const event = await fixture.createEvent("subjects");
    const guest = await fixture.createGuestParticipant(event.id);

    expect(guest.participant.affiliateId).toBeNull();
    await expect(
      prisma.bingoParticipant.create({
        data: {
          eventId: event.id,
          kind: BingoParticipantKind.AFFILIATE,
          status: BingoParticipantStatus.PENDING,
          affiliateId: fixture.affiliate.id,
          externalSubjectId: guest.externalSubject.id,
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoParticipant.create({
        data: {
          eventId: event.id,
          kind: BingoParticipantKind.AUTHORIZED_GUEST,
          status: BingoParticipantStatus.PENDING,
          affiliateId: fixture.affiliate.id,
        },
      }),
    ).rejects.toBeDefined();
  });

  it("separates identity, eligibility evidence and approved participation", async () => {
    const fixture = await createBingoFixture(prisma, "eligibility");
    const event = await fixture.createEvent("eligibility");
    const participant = await prisma.bingoParticipant.create({
      data: {
        eventId: event.id,
        kind: BingoParticipantKind.AFFILIATE,
        affiliateId: fixture.affiliate.id,
      },
    });
    const card = await fixture.createCard(event.id);
    await expect(
      fixture.assignCard(event.id, card.id, participant.id),
    ).rejects.toBeDefined();

    const rule = await prisma.bingoEligibilityRule.create({
      data: {
        eventId: event.id,
        kind: "CUSTOM_APPROVED",
        createdByUserId: fixture.user.id,
      },
    });
    await prisma.bingoEligibilityApproval.create({
      data: {
        eventId: event.id,
        participantId: participant.id,
        eligibilityRuleId: rule.id,
        status: "APPROVED",
        source: "stage3-test-authority",
        sourceReferenceHash: sha256(randomUUID()),
        actorUserId: fixture.user.id,
        reason: "Approved before operation",
      },
    });
    expect(
      (
        await prisma.bingoParticipant.findUniqueOrThrow({
          where: { id: participant.id },
        })
      ).status,
    ).toBe("PENDING");
    await prisma.bingoParticipant.update({
      where: { id: participant.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
    await expect(
      fixture.assignCard(event.id, card.id, participant.id),
    ).resolves.toBeDefined();
  });

  it("enforces event, participant, execution, draw and winner lifecycle checks", async () => {
    const graph = await createEvidenceGraph("lifecycle");
    await expect(
      prisma.bingoEvent.update({
        where: { id: graph.event.id },
        data: { status: "COMPLETED" },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoParticipant.update({
        where: { id: graph.participant.id },
        data: { status: "REJECTED" },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoRoundExecution.update({
        where: { id: graph.execution.id },
        data: { status: "PAUSED", pausedAt: new Date() },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoWinner.create({
        data: {
          eventId: graph.event.id,
          roundId: graph.configured.round.id,
          executionId: graph.execution.id,
          winGroupId: graph.winGroup.id,
          candidateId: graph.candidate.id,
          prizeId: graph.configured.prize.id,
          status: "CONFIRMED",
          validationPolicySnapshot: BingoValidationPolicy.SIMPLE,
          evidenceHash: sha256(randomUUID()),
          publicDisplaySnapshot: { card: graph.card.displayNumber },
        },
      }),
    ).rejects.toBeDefined();
  });

  it("enforces draw sequence, ball range, ball uniqueness and idempotency scope", async () => {
    const graph = await createEvidenceGraph("draws");
    const nextIdempotency = await prisma.bingoCommandIdempotency.create({
      data: {
        eventId: graph.event.id,
        executionId: graph.execution.id,
        actorUserId: graph.fixture.user.id,
        scope: `draw:${graph.execution.id}`,
        operation: "DRAW_BALL",
        keyHash: sha256(randomUUID()),
        requestHash: sha256(randomUUID()),
      },
    });
    const drawData = {
      eventId: graph.event.id,
      roundId: graph.configured.round.id,
      executionId: graph.execution.id,
      sequence: 2,
      ballNumber: 2,
      drawnByUserId: graph.fixture.user.id,
      drawnAt: new Date(),
      requestId: randomUUID(),
      idempotencyRecordId: nextIdempotency.id,
      evidenceHash: sha256(randomUUID()),
      rngEvidence: { algorithm: "test-fixture" },
      stateVersion: 2,
    };
    await prisma.bingoDraw.create({ data: drawData });
    const duplicateKey = await prisma.bingoCommandIdempotency.create({
      data: {
        eventId: graph.event.id,
        executionId: graph.execution.id,
        actorUserId: graph.fixture.user.id,
        scope: `draw:${graph.execution.id}`,
        operation: "DRAW_BALL",
        keyHash: sha256(randomUUID()),
        requestHash: sha256(randomUUID()),
      },
    });
    await expect(
      prisma.bingoDraw.create({
        data: {
          ...drawData,
          idempotencyRecordId: duplicateKey.id,
          evidenceHash: sha256(randomUUID()),
        },
      }),
    ).rejects.toBeDefined();
    const outOfRangeKey = await prisma.bingoCommandIdempotency.create({
      data: {
        eventId: graph.event.id,
        executionId: graph.execution.id,
        actorUserId: graph.fixture.user.id,
        scope: "draw-range",
        operation: "DRAW_BALL",
        keyHash: sha256(randomUUID()),
        requestHash: sha256(randomUUID()),
      },
    });
    await expect(
      prisma.bingoDraw.create({
        data: {
          ...drawData,
          sequence: 3,
          ballNumber: 76,
          idempotencyRecordId: outOfRangeKey.id,
          evidenceHash: sha256(randomUUID()),
        },
      }),
    ).rejects.toBeDefined();
  });

  it("preserves execution, assignment, draw, candidate, winner and audit evidence", async () => {
    const graph = await createEvidenceGraph("evidence");
    const winner = await prisma.bingoWinner.create({
      data: {
        eventId: graph.event.id,
        roundId: graph.configured.round.id,
        executionId: graph.execution.id,
        winGroupId: graph.winGroup.id,
        candidateId: graph.candidate.id,
        prizeId: graph.configured.prize.id,
        validationPolicySnapshot: BingoValidationPolicy.SIMPLE,
        evidenceHash: sha256(randomUUID()),
        publicDisplaySnapshot: { card: graph.card.displayNumber },
      },
    });
    const audit = await prisma.bingoAuditEvent.create({
      data: {
        eventId: graph.event.id,
        action: "TEST_EVIDENCE",
        result: "SUCCEEDED",
        requestId: randomUUID(),
      },
    });

    await expect(
      prisma.bingoWinGroup.update({
        where: { id: graph.winGroup.id },
        data: { evidenceHash: sha256("rewritten-group") },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoWinnerCandidate.update({
        where: { id: graph.candidate.id },
        data: { evidenceHash: sha256("rewritten-candidate") },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoWinner.update({
        where: { id: winner.id },
        data: { publicDisplaySnapshot: { card: "rewritten" } },
      }),
    ).rejects.toBeDefined();
    await prisma.bingoWinnerCandidate.update({
      where: { id: graph.candidate.id },
      data: { status: "VALIDATED" },
    });
    await prisma.bingoWinner.update({
      where: { id: winner.id },
      data: {
        status: "CONFIRMED",
        validatedByUserId: graph.fixture.user.id,
        validatedAt: new Date(),
      },
    });
    await expect(
      prisma.bingoWinnerCandidate.update({
        where: { id: graph.candidate.id },
        data: { status: "PENDING" },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoWinner.update({
        where: { id: winner.id },
        data: { status: "PENDING_VALIDATION", tieResolution: { changed: true } },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoWinner.update({
        where: { id: winner.id },
        data: { evidenceHash: sha256("rewritten-winner") },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.bingoCardAssignment.delete({ where: { id: graph.assignment.id } }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoRoundExecution.delete({ where: { id: graph.execution.id } }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoDraw.update({
        where: { id: graph.draw.id },
        data: { requestId: randomUUID() },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoWinnerCandidate.delete({ where: { id: graph.candidate.id } }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoWinner.delete({ where: { id: winner.id } }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoAuditEvent.delete({ where: { id: audit.id } }),
    ).rejects.toBeDefined();
  });

  it("requires distinct dual-control actors and enforces commit publication/reveal order", async () => {
    const fixture = await createBingoFixture(prisma, "dual-commit");
    const supervisor = await prisma.user.create({
      data: {
        email: `bingo-supervisor-${randomUUID()}@example.com`,
        passwordHash: "test",
        fullName: "Bingo Supervisor",
      },
    });
    const event = await fixture.createEvent("dual-commit", {
      validationPolicy: BingoValidationPolicy.DUAL_CONTROL,
      fairnessMode: BingoFairnessMode.CRYPTO_RNG_COMMIT_REVEAL,
    });
    const configured = await fixture.createConfiguredRound(event.id, {
      validationPolicy: BingoValidationPolicy.DUAL_CONTROL,
    });
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
      {
        validationPolicy: BingoValidationPolicy.DUAL_CONTROL,
        fairnessMode: BingoFairnessMode.CRYPTO_RNG_COMMIT_REVEAL,
      },
    );
    const committedAt = new Date();
    await expect(
      prisma.bingoFairnessCommitment.create({
        data: {
          eventId: event.id,
          executionId: execution.id,
          hashAlgorithm: "SHA-256",
          rngAlgorithm: "Node crypto.randomBytes",
          protocolVersion: "1",
          commitmentHash: sha256("revealed-on-insert"),
          configurationHash: sha256(`configuration:${event.id}:1`),
          canonicalizationVersion: "jcs-v1",
          seedCiphertext: "encrypted-test-seed",
          custodyKeyId: "test-custody-v1",
          committedByUserId: fixture.user.id,
          committedAt,
          revealedSeed: "forbidden",
          revealedByUserId: supervisor.id,
          revealedAt: committedAt,
          revealEvidenceHash: sha256("forbidden"),
        },
      }),
    ).rejects.toBeDefined();
    const commitment = await prisma.bingoFairnessCommitment.create({
      data: {
        eventId: event.id,
        executionId: execution.id,
        hashAlgorithm: "SHA-256",
        rngAlgorithm: "Node crypto.randomBytes",
        protocolVersion: "1",
        commitmentHash: sha256(randomUUID()),
        configurationHash: sha256(`configuration:${event.id}:1`),
        canonicalizationVersion: "jcs-v1",
        seedCiphertext: "encrypted-test-seed",
        custodyKeyId: "test-custody-v1",
        committedByUserId: fixture.user.id,
        committedAt,
      },
    });
    await expect(
      prisma.bingoFairnessCommitment.update({
        where: { id: commitment.id },
        data: { configurationHash: sha256("rewritten-configuration") },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoRoundExecution.update({
        where: { id: execution.id },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          operatorUserId: fixture.user.id,
          supervisorUserId: fixture.user.id,
        },
      }),
    ).rejects.toBeDefined();
    await prisma.bingoFairnessCommitment.update({
      where: { id: commitment.id },
      data: { publishedAt: new Date() },
    });
    await expect(
      prisma.bingoRoundExecution.update({
        where: { id: execution.id },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          operatorUserId: fixture.user.id,
          supervisorUserId: fixture.user.id,
        },
      }),
    ).rejects.toBeDefined();
    await prisma.bingoRoundExecution.update({
      where: { id: execution.id },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        operatorUserId: fixture.user.id,
        supervisorUserId: supervisor.id,
      },
    });
    await expect(
      prisma.bingoFairnessCommitment.update({
        where: { id: commitment.id },
        data: {
          revealedSeed: "test-seed",
          revealedByUserId: supervisor.id,
          revealedAt: new Date(),
          revealEvidenceHash: sha256("test-seed"),
        },
      }),
    ).rejects.toBeDefined();
    await prisma.bingoRoundExecution.update({
      where: { id: execution.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await expect(
      prisma.bingoFairnessCommitment.update({
        where: { id: commitment.id },
        data: {
          revealedSeed: "test-seed",
          revealedByUserId: supervisor.id,
          revealedAt: new Date(),
          revealEvidenceHash: sha256("test-seed"),
        },
      }),
    ).resolves.toBeDefined();

    const retrospective = await fixture.createExecution(
      event.id,
      configured.round.id,
      {
        revision: 2,
        previousExecutionId: execution.id,
        validationPolicy: BingoValidationPolicy.DUAL_CONTROL,
        fairnessMode: BingoFairnessMode.CRYPTO_RNG_COMMIT_REVEAL,
      },
    );
    await prisma.bingoRoundExecution.update({
      where: { id: retrospective.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "test" },
    });
    await expect(
      prisma.bingoFairnessCommitment.create({
        data: {
          eventId: event.id,
          executionId: retrospective.id,
          hashAlgorithm: "SHA-256",
          rngAlgorithm: "Node crypto.randomBytes",
          protocolVersion: "1",
          commitmentHash: sha256("retrospective"),
          configurationHash: sha256(`configuration:${event.id}:1`),
          canonicalizationVersion: "jcs-v1",
          seedCiphertext: "encrypted-test-seed",
          custodyKeyId: "test-custody-v1",
          committedByUserId: fixture.user.id,
          committedAt: new Date(),
        },
      }),
    ).rejects.toBeDefined();
  });

  it("allows only the distinct configured supervisor to confirm a dual-control winner", async () => {
    const graph = await createEvidenceGraph(
      "dual-winner",
      BingoValidationPolicy.DUAL_CONTROL,
    );
    const supervisor = await prisma.user.create({
      data: {
        email: `bingo-winner-supervisor-${randomUUID()}@example.com`,
        passwordHash: "test",
        fullName: "Winner Supervisor",
      },
    });
    await prisma.bingoRoundExecution.update({
      where: { id: graph.execution.id },
      data: {
        operatorUserId: graph.fixture.user.id,
        supervisorUserId: supervisor.id,
      },
    });
    const data = {
      eventId: graph.event.id,
      roundId: graph.configured.round.id,
      executionId: graph.execution.id,
      winGroupId: graph.winGroup.id,
      candidateId: graph.candidate.id,
      prizeId: graph.configured.prize.id,
      validationPolicySnapshot: BingoValidationPolicy.DUAL_CONTROL,
      evidenceHash: sha256(randomUUID()),
      publicDisplaySnapshot: { card: graph.card.displayNumber },
    };
    const winner = await prisma.bingoWinner.create({ data });
    await prisma.bingoWinnerCandidate.update({
      where: { id: graph.candidate.id },
      data: { status: "VALIDATED" },
    });
    await expect(
      prisma.bingoWinner.update({
        where: { id: winner.id },
        data: {
          status: "CONFIRMED",
          validatedAt: new Date(),
          validatedByUserId: graph.fixture.user.id,
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoWinner.update({
        where: { id: winner.id },
        data: {
          status: "CONFIRMED",
          validatedByUserId: supervisor.id,
          validatedAt: new Date(),
        },
      }),
    ).resolves.toBeDefined();
  });

  it("validates import hashes, counters, row lifecycle and per-event deduplication", async () => {
    const fixture = await createBingoFixture(prisma, "imports");
    const event = await fixture.createEvent("imports");
    const hash = sha256("stage3-import");
    const valid = await prisma.bingoImportBatch.create({
      data: {
        eventId: event.id,
        format: "CSV",
        sha256: hash,
        originalFilename: "participants.csv",
        storageReference: "quarantine/test",
        sizeBytes: 10,
        rowCount: 2,
        validCount: 1,
        errorCount: 1,
        validatorVersion: "1",
        uploadedByUserId: fixture.user.id,
      },
    });
    await expect(
      prisma.bingoImportBatch.create({
        data: {
          eventId: event.id,
          format: "CSV",
          sha256: hash,
          originalFilename: "copy.csv",
          storageReference: "quarantine/copy",
          sizeBytes: 10,
          validatorVersion: "1",
          uploadedByUserId: fixture.user.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma.bingoImportBatch.create({
        data: {
          eventId: event.id,
          format: "CSV",
          sha256: sha256("bad-counts"),
          originalFilename: "bad.csv",
          storageReference: "quarantine/bad",
          sizeBytes: 10,
          rowCount: 1,
          validCount: 2,
          validatorVersion: "1",
          uploadedByUserId: fixture.user.id,
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.bingoImportRow.create({
        data: {
          eventId: event.id,
          batchId: valid.id,
          rowNumber: 1,
          status: "APPLIED",
          errorCodes: [],
          payloadSchemaVersion: "1",
        },
      }),
    ).rejects.toBeDefined();
  });

  it("installs the representative partial indexes, scope FKs and evidence triggers", async () => {
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
        'bingo_round_executions_one_active_key',
        'bingo_card_assignments_one_active_key',
        'bingo_eligibility_approvals_active_key'
      )
    `;
    const constraints = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname IN (
        'bingo_winners_candidate_scope_fkey',
        'bingo_winners_win_group_prize_scope_fkey',
        'bingo_winner_candidates_assignment_scope_fkey',
        'bingo_draws_execution_id_round_id_event_id_fkey'
      )
    `;
    const triggers = await prisma.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (
        'bingo_card_assignments_guard',
        'bingo_round_executions_guard',
        'bingo_draws_append_only',
        'bingo_winners_validation_guard'
      )
    `;
    expect(indexes).toHaveLength(3);
    expect(constraints).toHaveLength(4);
    expect(triggers).toHaveLength(4);
  });
});
