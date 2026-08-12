import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service";
import { PrismaBingoAuditRepository } from "../application/audit";
import { DrawNextBallService } from "../application/draws";
import {
  CryptoBallSelector,
} from "../application/fairness";
import { PrismaBingoIdempotencyRepository } from "../application/idempotency";
import {
  BingoLockManager,
  BingoTransactionKernel,
  PrismaBingoTransactionRunner,
  type CommandContext,
} from "../application/kernel";
import { PrismaBingoOutboxRepository } from "../application/outbox";
import {
  BingoOutcomeCommandFacade,
  PrismaBingoOutcomeService,
  PrismaOutcomeOutboxSequenceAllocator,
} from "../application/outcomes";
import {
  BingoExecutionLifecycleService,
  PrismaExecutionCompletionPolicyAdapter,
  PrismaExecutionConfigurationSnapshotAdapter,
  PrismaExecutionEffectsAdapter,
} from "../application/executions";
import { BingoRestartExecutionService } from "../application/restart";

@Injectable()
export class BingoAdminOperationsService {
  private readonly lifecycle: BingoExecutionLifecycleService;
  private readonly draw: DrawNextBallService;
  private readonly outcomes: BingoOutcomeCommandFacade;
  private readonly restartService: BingoRestartExecutionService;

  constructor(private readonly prisma: PrismaService) {
    const locks = new BingoLockManager();
    const kernel = new BingoTransactionKernel(
      new PrismaBingoTransactionRunner(prisma),
    );
    this.lifecycle = new BingoExecutionLifecycleService(
      kernel,
      locks,
      new PrismaExecutionEffectsAdapter(),
      new PrismaExecutionCompletionPolicyAdapter(),
      new PrismaExecutionConfigurationSnapshotAdapter(),
    );
    this.draw = new DrawNextBallService(
      kernel,
      locks,
      new PrismaBingoIdempotencyRepository(),
      new PrismaBingoAuditRepository(),
      new PrismaBingoOutboxRepository(),
      new CryptoBallSelector(),
    );
    this.outcomes = new BingoOutcomeCommandFacade(
      kernel,
      new PrismaBingoOutcomeService(
        locks,
        new PrismaOutcomeOutboxSequenceAllocator(),
      ),
    );
    this.restartService = new BingoRestartExecutionService(kernel, locks);
  }

  async start(executionId: string, contextFor: ContextFactory) {
    const execution = await this.execution(executionId);
    const command = {
      eventId: execution.eventId,
      roundId: execution.roundId,
      executionId,
      expectedConfigurationVersion: execution.configurationVersion,
    };
    return serializeExecutionResult(
      await this.lifecycle.start(command, contextFor(command)),
    );
  }

  async pause(executionId: string, contextFor: ContextFactory) {
    return this.transition(executionId, "pause", contextFor);
  }

  async resume(executionId: string, contextFor: ContextFactory) {
    return this.transition(executionId, "resume", contextFor);
  }

  async complete(executionId: string, contextFor: ContextFactory) {
    return this.transition(executionId, "complete", contextFor);
  }

  async cancel(
    executionId: string,
    reason: string,
    contextFor: ContextFactory,
  ) {
    const execution = await this.execution(executionId);
    const command = {
      eventId: execution.eventId,
      roundId: execution.roundId,
      executionId,
      reason,
    };
    return serializeExecutionResult(
      await this.lifecycle.cancel(command, contextFor(command)),
    );
  }

  async drawNext(executionId: string, contextFor: ContextFactory) {
    const execution = await this.execution(executionId);
    const command = {
      eventId: execution.eventId,
      roundId: execution.roundId,
      executionId,
    };
    const result = await this.draw.execute(command, contextFor(command));
    return {
      ...result,
      stateVersion: result.stateVersion.toString(),
    };
  }

  async validateCandidate(candidateId: string, contextFor: ContextFactory) {
    const candidate = await this.candidate(candidateId);
    const command = { eventId: candidate.eventId, candidateId };
    return this.outcomes.validateCandidate(contextFor(command), command);
  }

  async rejectCandidate(
    candidateId: string,
    reason: string,
    contextFor: ContextFactory,
  ) {
    const candidate = await this.candidate(candidateId);
    const command = { eventId: candidate.eventId, candidateId, reason };
    return this.outcomes.rejectCandidate(contextFor(command), command);
  }

  async confirmWinners(
    candidateId: string,
    prizeId: string,
    contextFor: ContextFactory,
  ) {
    const candidate = await this.prisma.bingoWinnerCandidate.findUnique({
      where: { id: candidateId },
      include: { winGroup: { select: { id: true, prizeId: true } } },
    });
    if (candidate === null) throw bingoNotFound();
    if (candidate.winGroup.prizeId !== prizeId) {
      throw new UnprocessableEntityException({
        code: "BINGO_CONFLICT",
        message: "El premio no corresponde al grupo ganador oficial.",
      });
    }
    const command = {
      eventId: candidate.eventId,
      winGroupId: candidate.winGroup.id,
    };
    return this.outcomes.confirmWinners(contextFor(command), command);
  }

  async restart(
    previousExecutionId: string,
    reason: string,
    contextFor: ContextFactory,
  ) {
    const execution = await this.execution(previousExecutionId);
    const command = {
      eventId: execution.eventId,
      roundId: execution.roundId,
      previousExecutionId,
      reason,
    };
    const result = await this.restartService.restart(
      command,
      contextFor({ ...command, reason: reason.trim() }),
    );
    return { ...result, occurredAt: result.occurredAt.toISOString() };
  }

  private async transition(
    executionId: string,
    action: "pause" | "resume" | "complete",
    contextFor: ContextFactory,
  ) {
    const execution = await this.execution(executionId);
    const command = {
      eventId: execution.eventId,
      roundId: execution.roundId,
      executionId,
    };
    return serializeExecutionResult(
      await this.lifecycle[action](command, contextFor(command)),
    );
  }

  private async execution(id: string) {
    const execution = await this.prisma.bingoRoundExecution.findUnique({
      where: { id },
      select: {
        eventId: true,
        roundId: true,
        configurationVersion: true,
      },
    });
    if (execution === null) throw bingoNotFound();
    return execution;
  }

  private async candidate(id: string) {
    const candidate = await this.prisma.bingoWinnerCandidate.findUnique({
      where: { id },
      select: { eventId: true },
    });
    if (candidate === null) throw bingoNotFound();
    return candidate;
  }
}

type ContextFactory = (canonicalCommand: unknown) => CommandContext;

function bingoNotFound() {
  return new NotFoundException({
    code: "BINGO_NOT_FOUND",
    message: "El recurso Bingo no existe.",
  });
}

function serializeExecutionResult(result: {
  eventId: string;
  roundId: string;
  executionId: string;
  status: string;
  stateVersion: bigint;
  occurredAt: Date;
  replayed?: boolean;
}) {
  return {
    ...result,
    stateVersion: result.stateVersion.toString(),
    occurredAt: result.occurredAt.toISOString(),
  };
}
