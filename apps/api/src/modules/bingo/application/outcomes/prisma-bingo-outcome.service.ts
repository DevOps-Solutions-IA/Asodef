import { createHash } from "node:crypto";
import {
  BingoAuditResult,
  BingoCandidateStatus,
  BingoPrizeKind,
  BingoTiePolicy,
  BingoValidationPolicy,
  BingoWinnerStatus,
  Prisma,
} from "@prisma/client";
import { PrismaBingoAuditRepository } from "../audit";
import { PrismaBingoIdempotencyRepository } from "../idempotency";
import { PrismaBingoOutboxRepository } from "../outbox";
import {
  resolveTieOutcome,
  validateCandidate as decideCandidateValidation,
  type ExactPrizeValue,
  type ValidatedCandidate,
  type WinnerCandidate,
} from "../../domain/outcomes";
import type {
  CandidateCommandResult,
  ConfirmWinnerCommand,
  ConfirmWinnersResult,
  OutcomeCommandContext,
  OutcomeLockManager,
  OutcomeOutboxSequenceAllocator,
  RejectCandidateCommand,
  ValidateCandidateCommand,
} from "./outcome-contracts";
import { BINGO_OUTCOME_PERMISSIONS } from "./outcome-contracts";
import {
  BingoOutcomeApplicationError,
  BingoOutcomeApplicationErrorCode,
} from "./outcome-errors";

const candidateGraph =
  Prisma.validator<Prisma.BingoWinnerCandidateDefaultArgs>()({
    include: {
      winGroup: {
        include: {
          decisiveDraw: true,
          execution: { include: { executionActors: true } },
          pattern: true,
          prize: true,
          roundPattern: { include: { round: true } },
        },
      },
    },
  });
type CandidateGraph = Prisma.BingoWinnerCandidateGetPayload<
  typeof candidateGraph
>;

const winGroupGraph = Prisma.validator<Prisma.BingoWinGroupDefaultArgs>()({
  include: {
    candidates: { include: { card: true } },
    decisiveDraw: true,
    execution: { include: { executionActors: true } },
    pattern: true,
    prize: true,
    roundPattern: { include: { round: true } },
    winners: true,
  },
});
type WinGroupGraph = Prisma.BingoWinGroupGetPayload<typeof winGroupGraph>;

function fail(
  code: BingoOutcomeApplicationErrorCode,
  details: Readonly<Record<string, unknown>> = {},
): never {
  throw new BingoOutcomeApplicationError(code, details);
}

function assertAuthorized(context: OutcomeCommandContext): void {
  if (
    context.actor.userId.trim() === "" ||
    !context.actor.permissions.has(BINGO_OUTCOME_PERMISSIONS.VALIDATE)
  ) {
    fail(BingoOutcomeApplicationErrorCode.FORBIDDEN);
  }
  if (
    context.requestId.trim() === "" ||
    context.idempotencyKey.trim().length < 8 ||
    Number.isNaN(context.now.getTime())
  ) {
    fail(BingoOutcomeApplicationErrorCode.INVALID_STATE, {
      reason: "INVALID_COMMAND_CONTEXT",
    });
  }
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    )
    .digest("hex");
}

function asDomainCandidate(candidate: CandidateGraph): WinnerCandidate {
  return {
    id: candidate.id,
    fingerprint: candidate.evidenceHash,
    status: "PENDING",
    match: {
      executionId: candidate.executionId,
      cardId: candidate.cardId,
      cardLayoutHash: candidate.cardId,
      patternId: candidate.winGroup.patternId,
      patternKind: candidate.winGroup.pattern.kind,
      decisiveDraw: {
        id: candidate.winGroup.decisiveDraw.id,
        sequence: candidate.winGroup.decisiveDraw.sequence,
        ball: candidate.winGroup.decisiveDraw.ballNumber,
        evidenceHash: candidate.winGroup.decisiveDraw.evidenceHash,
      },
      matchedPositionMask: 1,
      matchedNumbersMask: 1n,
      drawnBallMaskAtDecision: 1n,
      matchedPatternMasks: [],
    },
  };
}

function toPrizeValue(group: WinGroupGraph): ExactPrizeValue {
  if (group.prize.kind === BingoPrizeKind.MONETARY) {
    if (
      group.prize.amountMinor === null ||
      group.prize.amountMinor <= 0 ||
      group.prize.currency?.trim() === ""
    ) {
      return fail(BingoOutcomeApplicationErrorCode.INVALID_PRIZE);
    }
    return {
      kind: "MONEY",
      minorUnits: BigInt(group.prize.amountMinor),
      currency: group.prize.currency!,
    };
  }
  if (group.prize.quantity <= 0) {
    return fail(BingoOutcomeApplicationErrorCode.INVALID_PRIZE);
  }
  return {
    kind: "UNITS",
    units: BigInt(group.prize.quantity),
    unitCode: `PRIZE:${group.prize.id}`,
  };
}

function specialRuleId(value: Prisma.JsonValue | null): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = (value as Prisma.JsonObject).specialRuleId;
  return typeof candidate === "string" && candidate.trim() !== ""
    ? candidate
    : undefined;
}

function candidatePayload(candidate: CandidateGraph, now: Date) {
  return {
    schemaVersion: 1 as const,
    candidateId: candidate.id,
    executionId: candidate.executionId,
    patternId: candidate.winGroup.patternId,
    decisiveDrawSequence: candidate.winGroup.decisiveDraw.sequence,
    decisiveBall: candidate.decisiveBall,
    status: candidate.status,
    occurredAt: now.toISOString(),
  };
}

export class PrismaBingoOutcomeService {
  constructor(
    private readonly locks: OutcomeLockManager,
    private readonly sequences: OutcomeOutboxSequenceAllocator,
    private readonly idempotency = new PrismaBingoIdempotencyRepository(),
    private readonly audit = new PrismaBingoAuditRepository(),
    private readonly outbox = new PrismaBingoOutboxRepository(),
  ) {}

  async validateCandidate(
    tx: Prisma.TransactionClient,
    context: OutcomeCommandContext,
    command: ValidateCandidateCommand,
  ): Promise<CandidateCommandResult> {
    return this.resolveCandidate(tx, context, command, "APPROVE");
  }

  async rejectCandidate(
    tx: Prisma.TransactionClient,
    context: OutcomeCommandContext,
    command: RejectCandidateCommand,
  ): Promise<CandidateCommandResult> {
    return this.resolveCandidate(tx, context, command, "REJECT");
  }

  private async resolveCandidate(
    tx: Prisma.TransactionClient,
    context: OutcomeCommandContext,
    command: ValidateCandidateCommand | RejectCandidateCommand,
    action: "APPROVE" | "REJECT",
  ): Promise<CandidateCommandResult> {
    assertAuthorized(context);
    const initial = await tx.bingoWinnerCandidate.findFirst({
      where: { id: command.candidateId, eventId: command.eventId },
      ...candidateGraph,
    });
    if (initial === null) fail(BingoOutcomeApplicationErrorCode.NOT_FOUND);

    const operation =
      action === "APPROVE" ? "VALIDATE_CANDIDATE" : "REJECT_CANDIDATE";
    const acquired = await this.idempotency.acquire(tx, {
      eventId: command.eventId,
      executionId: initial.executionId,
      actorUserId: context.actor.userId,
      scope: `candidate:${command.candidateId}`,
      operation,
      idempotencyKey: context.idempotencyKey,
      request: command,
      now: context.now,
    });
    if (acquired.kind === "IN_PROGRESS") {
      return fail(BingoOutcomeApplicationErrorCode.IDEMPOTENCY_IN_PROGRESS, {
        retryAfterMs: acquired.retryAfterMs,
      });
    }
    if (acquired.kind === "REPLAY") {
      return {
        candidateId: command.candidateId,
        executionId: initial.executionId,
        status: action === "APPROVE" ? "VALIDATED" : "REJECTED",
        replayed: true,
      };
    }

    await this.locks.acquire(tx, {
      eventId: command.eventId,
      roundId: initial.winGroup.roundId,
      executionId: initial.executionId,
      candidateIds: [command.candidateId],
    });
    const candidate = await tx.bingoWinnerCandidate.findFirst({
      where: { id: command.candidateId, eventId: command.eventId },
      ...candidateGraph,
    });
    if (candidate === null) fail(BingoOutcomeApplicationErrorCode.NOT_FOUND);
    if (candidate.status !== BingoCandidateStatus.PENDING) {
      return fail(BingoOutcomeApplicationErrorCode.INVALID_STATE, {
        candidateId: candidate.id,
        status: candidate.status,
      });
    }

    const execution = candidate.winGroup.execution;
    const operatorConflict = execution.executionActors.some(
      ({ userId }) => userId === context.actor.userId,
    );
    if (
      execution.validationPolicySnapshot ===
        BingoValidationPolicy.DUAL_CONTROL &&
      (operatorConflict || execution.supervisorUserId !== context.actor.userId)
    ) {
      return fail(BingoOutcomeApplicationErrorCode.DUAL_CONTROL_ACTOR_CONFLICT);
    }
    const decision = decideCandidateValidation({
      candidate: asDomainCandidate(candidate),
      policy: execution.validationPolicySnapshot,
      operatorActorId:
        operatorConflict || execution.operatorUserId === context.actor.userId
          ? context.actor.userId
          : (execution.operatorUserId ?? "distinct-operator"),
      validatorActorId: context.actor.userId,
      validatorAuthorized: true,
      action,
      rejectionReason: "reason" in command ? command.reason : undefined,
      now: context.now,
    });
    if (!decision.accepted) {
      const code =
        decision.code === "REJECTION_REASON_REQUIRED"
          ? BingoOutcomeApplicationErrorCode.REJECTION_REASON_REQUIRED
          : BingoOutcomeApplicationErrorCode.INVALID_STATE;
      return fail(code, { domainCode: decision.code });
    }
    const status =
      action === "APPROVE"
        ? BingoCandidateStatus.VALIDATED
        : BingoCandidateStatus.REJECTED;
    const reason = "reason" in command ? command.reason.trim() : undefined;
    await tx.bingoWinnerCandidate.update({
      where: { id: candidate.id },
      data: { status, rejectionReason: reason },
    });
    const resolvedCandidate = { ...candidate, status };
    const outboxSequence = await this.sequences.next(tx, command.eventId);
    const eventType =
      action === "APPROVE"
        ? "bingo.candidate.validated.v1"
        : "bingo.candidate.rejected.v1";
    await this.audit.append(tx, {
      eventId: command.eventId,
      roundId: candidate.winGroup.roundId,
      executionId: candidate.executionId,
      actorUserId: context.actor.userId,
      actorPermission: "bingo.validate",
      action: eventType,
      result: BingoAuditResult.SUCCEEDED,
      reason,
      previousState: { status: BingoCandidateStatus.PENDING },
      newState: { status },
      requestId: context.requestId,
      idempotencyKeyHash: acquired.keyHash,
      metadata: {
        schemaVersion: 1,
        entityId: candidate.id,
        policy: execution.validationPolicySnapshot,
      },
      occurredAt: context.now,
    });
    await this.outbox.append(tx, {
      eventId: command.eventId,
      executionId: candidate.executionId,
      sequence: outboxSequence,
      eventType,
      aggregateType: "CANDIDATE",
      aggregateId: candidate.id,
      aggregateVersion: 1n,
      payload: candidatePayload(resolvedCandidate, context.now),
      createdAt: context.now,
    });
    await this.idempotency.succeed(
      tx,
      acquired.recordId,
      {
        schemaVersion: 1,
        resourceType: "CANDIDATE",
        resourceId: candidate.id,
        status,
        executionId: candidate.executionId,
      },
      context.now,
    );
    return {
      candidateId: candidate.id,
      executionId: candidate.executionId,
      status,
      replayed: false,
    };
  }

  async confirmWinners(
    tx: Prisma.TransactionClient,
    context: OutcomeCommandContext,
    command: ConfirmWinnerCommand,
  ): Promise<ConfirmWinnersResult> {
    assertAuthorized(context);
    const initial = await tx.bingoWinGroup.findFirst({
      where: { id: command.winGroupId, eventId: command.eventId },
      ...winGroupGraph,
    });
    if (initial === null) fail(BingoOutcomeApplicationErrorCode.NOT_FOUND);
    const acquired = await this.idempotency.acquire(tx, {
      eventId: command.eventId,
      executionId: initial.executionId,
      actorUserId: context.actor.userId,
      scope: `execution:${initial.executionId}`,
      operation: "CONFIRM_WINNER",
      idempotencyKey: context.idempotencyKey,
      request: command,
      now: context.now,
    });
    if (acquired.kind === "IN_PROGRESS") {
      return fail(BingoOutcomeApplicationErrorCode.IDEMPOTENCY_IN_PROGRESS, {
        retryAfterMs: acquired.retryAfterMs,
      });
    }
    if (acquired.kind === "REPLAY") {
      const winners = await tx.bingoWinner.findMany({
        where: { winGroupId: command.winGroupId, eventId: command.eventId },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      return {
        winGroupId: command.winGroupId,
        executionId: initial.executionId,
        winnerIds: winners.map(({ id }) => id),
        policy: initial.tiePolicySnapshot as "SPLIT_PRIZE" | "FULL_PRIZE_EACH",
        replayed: true,
      };
    }
    const candidateIds = initial.candidates.map(({ id }) => id).sort();
    await this.locks.acquire(tx, {
      eventId: command.eventId,
      roundId: initial.roundId,
      executionId: initial.executionId,
      candidateIds,
      winnerIds: initial.winners.map(({ id }) => id).sort(),
    });
    const group = await tx.bingoWinGroup.findFirst({
      where: { id: command.winGroupId, eventId: command.eventId },
      ...winGroupGraph,
    });
    if (group === null) fail(BingoOutcomeApplicationErrorCode.NOT_FOUND);
    if (group.winners.length > 0) {
      return fail(BingoOutcomeApplicationErrorCode.INVALID_STATE, {
        reason: "WIN_GROUP_ALREADY_RESOLVED",
      });
    }
    if (group.candidates.some(({ status }) => status === "PENDING")) {
      return fail(
        BingoOutcomeApplicationErrorCode.INCOMPLETE_CANDIDATE_RESOLUTION,
      );
    }
    const validRows = group.candidates.filter(
      ({ status }) => status === BingoCandidateStatus.VALIDATED,
    );
    if (validRows.length === 0) {
      return fail(BingoOutcomeApplicationErrorCode.NO_VALIDATED_CANDIDATES);
    }
    if (
      group.execution.validationPolicySnapshot ===
        BingoValidationPolicy.DUAL_CONTROL &&
      (group.execution.supervisorUserId !== context.actor.userId ||
        group.execution.executionActors.some(
          ({ userId }) => userId === context.actor.userId,
        ))
    ) {
      return fail(BingoOutcomeApplicationErrorCode.DUAL_CONTROL_ACTOR_CONFLICT);
    }
    const validated: ValidatedCandidate[] = validRows.map((row) => ({
      candidate: asDomainCandidate({ ...row, winGroup: group }),
      status: "VALIDATED",
      policy: group.execution.validationPolicySnapshot,
      validatorActorId: context.actor.userId,
      validatedAt: context.now,
    }));
    const outcome = resolveTieOutcome({
      prizeId: group.prizeId,
      prize: toPrizeValue(group),
      candidates: validated,
      tie: {
        policy: group.tiePolicySnapshot,
        configurationFrozen:
          group.roundPattern.round.configurationLockedAt !== null,
        specialRuleId: specialRuleId(
          group.roundPattern.round.tiePolicyConfiguration,
        ),
      },
    });
    if (!outcome.resolved) {
      if (outcome.code === "TIE_BREAK_REQUIRED") {
        return fail(BingoOutcomeApplicationErrorCode.TIE_BREAK_REQUIRED, {
          winGroupId: group.id,
          candidateIds: outcome.candidateIds,
        });
      }
      if (outcome.code === "SPECIAL_RULE_REQUIRED") {
        return fail(BingoOutcomeApplicationErrorCode.SPECIAL_RULE_REQUIRED, {
          winGroupId: group.id,
          candidateIds: outcome.candidateIds,
          specialRuleId: outcome.specialRuleId,
        });
      }
      return fail(BingoOutcomeApplicationErrorCode.INVALID_STATE, {
        domainCode: outcome.code,
      });
    }

    const winnerIds: string[] = [];
    for (const winner of outcome.winners) {
      const row = validRows.find(
        ({ id }) => id === winner.candidate.candidate.id,
      )!;
      const allocation =
        winner.allocation.kind === "MONEY"
          ? {
              kind: "MONEY",
              currency: winner.allocation.currency,
              payableMinorUnits: winner.allocation.payableMinorUnits.toString(),
              numerator: winner.allocation.exactShareNumerator.toString(),
              denominator: winner.allocation.exactShareDenominator.toString(),
            }
          : {
              kind: "UNITS",
              unitCode: winner.allocation.unitCode,
              payableUnits: winner.allocation.payableUnits.toString(),
              numerator: winner.allocation.exactShareNumerator.toString(),
              denominator: winner.allocation.exactShareDenominator.toString(),
            };
      const tieResolution = {
        schemaVersion: 1,
        policy: outcome.policy,
        allocation,
        simultaneousCandidateCount: validRows.length,
        remainder:
          outcome.remainder.kind === "MONEY"
            ? {
                kind: "MONEY",
                currency: outcome.remainder.currency,
                minorUnits: outcome.remainder.minorUnits.toString(),
              }
            : {
                kind: "UNITS",
                unitCode: outcome.remainder.unitCode,
                units: outcome.remainder.units.toString(),
              },
        remainderDisposition: outcome.remainderDisposition,
      } satisfies Prisma.InputJsonObject;
      const created = await tx.bingoWinner.create({
        data: {
          eventId: group.eventId,
          roundId: group.roundId,
          executionId: group.executionId,
          winGroupId: group.id,
          candidateId: row.id,
          prizeId: group.prizeId,
          validationPolicySnapshot: group.execution.validationPolicySnapshot,
          evidenceHash: sha256({
            candidateEvidenceHash: row.evidenceHash,
            winGroupEvidenceHash: group.evidenceHash,
            tieResolution,
          }),
          publicDisplaySnapshot: {
            schemaVersion: 1,
            cardNumber: row.card.displayNumber,
          },
        },
      });
      await tx.bingoWinner.update({
        where: { id: created.id },
        data: {
          status: BingoWinnerStatus.CONFIRMED,
          validatedByUserId: context.actor.userId,
          validatedAt: context.now,
          tieResolution,
        },
      });
      winnerIds.push(created.id);
      const sequence = await this.sequences.next(tx, group.eventId);
      await this.audit.append(tx, {
        eventId: group.eventId,
        roundId: group.roundId,
        executionId: group.executionId,
        actorUserId: context.actor.userId,
        actorPermission: "bingo.validate",
        action: "bingo.winner.confirmed.v1",
        result: BingoAuditResult.SUCCEEDED,
        previousState: { status: BingoWinnerStatus.PENDING_VALIDATION },
        newState: { status: BingoWinnerStatus.CONFIRMED },
        requestId: context.requestId,
        idempotencyKeyHash: acquired.keyHash,
        metadata: {
          schemaVersion: 1,
          entityId: created.id,
          winnerCount: outcome.winners.length,
          policy: outcome.policy,
        },
        occurredAt: context.now,
      });
      await this.outbox.append(tx, {
        eventId: group.eventId,
        executionId: group.executionId,
        sequence,
        eventType: "bingo.winner.confirmed.v1",
        aggregateType: "WINNER",
        aggregateId: created.id,
        aggregateVersion: 1n,
        payload: {
          schemaVersion: 1,
          winnerId: created.id,
          executionId: group.executionId,
          status: "CONFIRMED",
          occurredAt: context.now.toISOString(),
        },
        createdAt: context.now,
      });
    }
    await this.idempotency.succeed(
      tx,
      acquired.recordId,
      {
        schemaVersion: 1,
        resourceType: "WINNER",
        resourceId: winnerIds[0]!,
        status: "CONFIRMED",
        executionId: group.executionId,
      },
      context.now,
    );
    return {
      winGroupId: group.id,
      executionId: group.executionId,
      winnerIds,
      policy: outcome.policy,
      replayed: false,
    };
  }
}
