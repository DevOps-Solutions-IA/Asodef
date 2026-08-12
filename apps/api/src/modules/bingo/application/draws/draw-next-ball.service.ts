import { createHash } from "node:crypto";
import { BingoAuditResult, Prisma } from "@prisma/client";
import { createCanonicalCard, toPostgresBit75 } from "../../domain/cards";
import { evaluatePatternBatch } from "../../domain/patterns";
import { PrismaBingoAuditRepository } from "../audit";
import type { BallSelector } from "../fairness";
import { PrismaBingoIdempotencyRepository } from "../idempotency";
import {
  BingoApplicationError,
  BingoApplicationErrorCode,
  BingoLockManager,
  BingoTransactionKernel,
  type CommandContext,
} from "../kernel";
import { PrismaBingoOutboxRepository } from "../outbox";

export interface DrawNextBallCommand {
  readonly eventId: string;
  readonly roundId: string;
  readonly executionId: string;
}

export interface DrawNextBallResult {
  readonly kind: "DRAW";
  readonly drawId: string;
  readonly executionId: string;
  readonly sequence: number;
  readonly ballNumber: number;
  readonly stateVersion: bigint;
  readonly candidateCount: number;
}

export class BingoDrawError extends Error {
  constructor(
    readonly code:
      | "BINGO_NO_BALLS_REMAINING"
      | "BINGO_INVALID_BALL_SELECTION"
      | "BINGO_DRAW_SEQUENCE_CORRUPTED"
      | "BINGO_IDEMPOTENCY_IN_PROGRESS",
  ) {
    super(code);
    this.name = "BingoDrawError";
  }
}

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export class DrawNextBallService {
  constructor(
    private readonly kernel: BingoTransactionKernel,
    private readonly locks: BingoLockManager,
    private readonly idempotency: PrismaBingoIdempotencyRepository,
    private readonly audit: PrismaBingoAuditRepository,
    private readonly outbox: PrismaBingoOutboxRepository,
    private readonly selector: BallSelector,
  ) {}

  execute(
    command: DrawNextBallCommand,
    context: CommandContext,
  ): Promise<DrawNextBallResult> {
    if (!context.actor.permissions.has("bingo.operate")) {
      throw new BingoApplicationError(BingoApplicationErrorCode.FORBIDDEN, {
        permission: "bingo.operate",
      });
    }
    return this.kernel.execute(
      context,
      {
        command: "bingo.draw.next",
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        idempotent: true,
      },
      async (tx) => {
        const now = context.clock.now();
        const acquired = await this.idempotency.acquire(tx, {
          eventId: command.eventId,
          executionId: command.executionId,
          actorUserId: context.actor.userId,
          scope: `execution:${command.executionId}`,
          operation: "DRAW_NEXT_BALL",
          idempotencyKey: context.idempotencyKey,
          request: command,
          now,
        });
        if (acquired.kind === "IN_PROGRESS")
          throw new BingoDrawError("BINGO_IDEMPOTENCY_IN_PROGRESS");
        if (acquired.kind === "REPLAY") {
          const result = acquired.result;
          if (
            result.resourceType !== "DRAW" ||
            result.sequence === undefined ||
            result.ballNumber === undefined ||
            result.executionId === undefined
          ) {
            throw new BingoDrawError("BINGO_DRAW_SEQUENCE_CORRUPTED");
          }
          return {
            kind: "DRAW",
            drawId: result.resourceId,
            executionId: result.executionId,
            sequence: result.sequence,
            ballNumber: result.ballNumber,
            stateVersion: BigInt(result.sequence),
            candidateCount: 0,
          };
        }

        await this.locks.acquire(tx, command);
        const execution = await tx.bingoRoundExecution.findFirst({
          where: {
            id: command.executionId,
            roundId: command.roundId,
            eventId: command.eventId,
          },
          include: {
            draws: { orderBy: { sequence: "asc" } },
            round: {
              include: {
                patterns: {
                  orderBy: { sequence: "asc" },
                  include: {
                    pattern: {
                      include: { masks: { orderBy: { sequence: "asc" } } },
                    },
                    prizes: true,
                  },
                },
              },
            },
          },
        });
        if (execution === null)
          throw new BingoApplicationError(BingoApplicationErrorCode.NOT_FOUND);
        if (execution.status !== "RUNNING")
          throw new BingoApplicationError(
            BingoApplicationErrorCode.INVALID_STATE,
            { status: execution.status },
          );
        execution.draws.forEach((draw, index) => {
          if (draw.sequence !== index + 1)
            throw new BingoDrawError("BINGO_DRAW_SEQUENCE_CORRUPTED");
        });
        const used = new Set(execution.draws.map((draw) => draw.ballNumber));
        const available = Array.from(
          { length: 75 },
          (_, index) => index + 1,
        ).filter((ball) => !used.has(ball));
        if (available.length === 0)
          throw new BingoDrawError("BINGO_NO_BALLS_REMAINING");
        const sequence = execution.draws.length + 1;
        const selected = this.selector.selectBall(Object.freeze(available));
        if (!available.includes(selected.ball))
          throw new BingoDrawError("BINGO_INVALID_BALL_SELECTION");
        const previousEvidenceHash =
          execution.draws.at(-1)?.evidenceHash ?? null;
        const evidenceHash = sha256(
          [
            "ASODEF:BINGO:DRAW:V1",
            execution.id,
            sequence,
            selected.ball,
            previousEvidenceHash ?? "GENESIS",
            execution.configurationHash,
          ].join("\n"),
        );
        const nextVersion = execution.stateVersion + 1n;
        const draw = await tx.bingoDraw.create({
          data: {
            eventId: execution.eventId,
            roundId: execution.roundId,
            executionId: execution.id,
            sequence,
            ballNumber: selected.ball,
            drawnByUserId: context.actor.userId,
            drawnAt: now,
            requestId: context.requestId,
            idempotencyRecordId: acquired.recordId,
            previousEvidenceHash,
            evidenceHash,
            rngEvidence: selected.evidence as unknown as Prisma.InputJsonObject,
            stateVersion: nextVersion,
          },
        });
        await tx.bingoRoundExecution.update({
          where: { id: execution.id },
          data: { stateVersion: nextVersion },
        });

        const lastOutbox = await tx.bingoOutboxEvent.findFirst({
          where: { eventId: execution.eventId },
          orderBy: { sequence: "desc" },
          select: { sequence: true },
        });
        let outboxSequence = (lastOutbox?.sequence ?? 0n) + 1n;
        await this.outbox.append(tx, {
          eventId: execution.eventId,
          executionId: execution.id,
          sequence: outboxSequence,
          eventType: "bingo.draw.created.v1",
          aggregateType: "DRAW",
          aggregateId: draw.id,
          aggregateVersion: nextVersion,
          payload: {
            schemaVersion: 1,
            drawId: draw.id,
            executionId: execution.id,
            roundId: execution.roundId,
            sequence,
            ballNumber: selected.ball,
            stateVersion: Number(nextVersion),
            drawnAt: now.toISOString(),
          },
          createdAt: now,
        });

        const assignments = await tx.bingoCardAssignment.findMany({
          where: {
            eventId: execution.eventId,
            status: "ACTIVE",
            participant: { status: "APPROVED" },
            OR: [
              { roundContextId: null },
              { roundContextId: execution.roundId },
            ],
          },
          include: { card: true },
        });
        const drawValues = [
          ...execution.draws.map((item) => ({
            sequence: item.sequence,
            ball: item.ballNumber,
          })),
          { sequence, ball: selected.ball },
        ];
        let candidateCount = 0;
        for (const binding of execution.round.patterns) {
          const definition = {
            id: binding.pattern.id,
            kind: binding.pattern.kind,
            requiredMatchCount: binding.pattern.requiredMatchCount,
            configurationFrozen: execution.round.configurationLockedAt !== null,
            masks: binding.pattern.masks.map((mask) => ({
              id: mask.id,
              sequence: mask.sequence,
              positionMask: mask.positionMask,
            })),
          } as const;
          const matches = evaluatePatternBatch(
            assignments.map((assignment) => ({
              cardId: assignment.cardId,
              card: createCanonicalCard(assignment.card.numbers),
            })),
            drawValues,
            definition,
          ).filter(
            (candidate) =>
              candidate.evaluation.decisiveDrawSequence === sequence,
          );
          if (matches.length === 0) continue;
          for (const prize of binding.prizes) {
            const groupEvidence = sha256(
              [
                "ASODEF:BINGO:WIN-GROUP:V1",
                execution.id,
                prize.id,
                binding.pattern.id,
                draw.id,
                ...matches.map((match) => match.cardId).sort(),
              ].join("\n"),
            );
            const group = await tx.bingoWinGroup.create({
              data: {
                eventId: execution.eventId,
                roundId: execution.roundId,
                executionId: execution.id,
                prizeId: prize.id,
                patternId: binding.pattern.id,
                roundPatternId: binding.id,
                decisiveDrawId: draw.id,
                tiePolicySnapshot: execution.tiePolicySnapshot,
                candidateCount: matches.length,
                detectedAt: now,
                evidenceHash: groupEvidence,
              },
            });
            for (const match of matches) {
              const assignment = assignments.find(
                (item) => item.cardId === match.cardId,
              )!;
              const persistedCandidate = await tx.bingoWinnerCandidate.create({
                data: {
                  eventId: execution.eventId,
                  executionId: execution.id,
                  winGroupId: group.id,
                  cardId: match.cardId,
                  participantId: assignment.participantId,
                  assignmentId: assignment.id,
                  matchedNumbers: toPostgresBit75(
                    match.evaluation.matchedNumbersMask,
                  ),
                  decisiveBall: selected.ball,
                  detectedAt: now,
                  evidenceHash: sha256(
                    `${groupEvidence}\n${match.cardId}\n${assignment.id}`,
                  ),
                },
              });
              candidateCount += 1;
              outboxSequence += 1n;
              await this.audit.append(tx, {
                eventId: execution.eventId,
                roundId: execution.roundId,
                executionId: execution.id,
                actorUserId: context.actor.userId,
                actorPermission: "bingo.operate",
                action: "bingo.candidate.detected.v1",
                result: BingoAuditResult.SUCCEEDED,
                newState: {
                  status: "PENDING",
                  sequence,
                  ballNumber: selected.ball,
                },
                requestId: context.requestId,
                idempotencyKeyHash: acquired.keyHash,
                metadata: {
                  schemaVersion: 1,
                  entityId: persistedCandidate.id,
                  sequence,
                  ballNumber: selected.ball,
                },
                occurredAt: now,
              });
              await this.outbox.append(tx, {
                eventId: execution.eventId,
                executionId: execution.id,
                sequence: outboxSequence,
                eventType: "bingo.candidate.detected.v1",
                aggregateType: "CANDIDATE",
                aggregateId: persistedCandidate.id,
                aggregateVersion: 0n,
                payload: {
                  schemaVersion: 1,
                  candidateId: persistedCandidate.id,
                  executionId: execution.id,
                  patternId: binding.pattern.id,
                  decisiveDrawSequence: sequence,
                  decisiveBall: selected.ball,
                  status: "PENDING",
                  occurredAt: now.toISOString(),
                },
                createdAt: now,
              });
            }
          }
        }
        await this.audit.append(tx, {
          eventId: execution.eventId,
          roundId: execution.roundId,
          executionId: execution.id,
          actorUserId: context.actor.userId,
          actorPermission: "bingo.operate",
          action: "bingo.draw.created.v1",
          result: BingoAuditResult.SUCCEEDED,
          previousState: {
            sequence: sequence - 1,
            stateVersion: Number(execution.stateVersion),
          },
          newState: {
            sequence,
            ballNumber: selected.ball,
            stateVersion: Number(nextVersion),
          },
          requestId: context.requestId,
          idempotencyKeyHash: acquired.keyHash,
          metadata: {
            schemaVersion: 1,
            entityId: draw.id,
            sequence,
            ballNumber: selected.ball,
            candidateCount,
          },
          occurredAt: now,
        });
        await this.idempotency.succeed(
          tx,
          acquired.recordId,
          {
            schemaVersion: 1,
            resourceType: "DRAW",
            resourceId: draw.id,
            status: "CREATED",
            executionId: execution.id,
            sequence,
            ballNumber: selected.ball,
          },
          now,
        );
        return {
          kind: "DRAW",
          drawId: draw.id,
          executionId: execution.id,
          sequence,
          ballNumber: selected.ball,
          stateVersion: nextVersion,
          candidateCount,
        };
      },
    );
  }
}
