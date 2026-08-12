import { Prisma } from "@prisma/client";
import { BingoTransactionKernel, type CommandContext } from "../kernel";
import type {
  CandidateCommandResult,
  ConfirmWinnerCommand,
  ConfirmWinnersResult,
  RejectCandidateCommand,
  ValidateCandidateCommand,
} from "./outcome-contracts";
import { PrismaBingoOutcomeService } from "./prisma-bingo-outcome.service";

/**
 * Production-facing transaction boundary. HTTP remains out of ETAPA 5; a
 * future controller supplies the authenticated CommandContext and never an
 * actor id from request payload.
 */
export class BingoOutcomeCommandFacade {
  constructor(
    private readonly kernel: BingoTransactionKernel,
    private readonly outcomes: PrismaBingoOutcomeService,
  ) {}

  validateCandidate(
    context: CommandContext,
    command: ValidateCandidateCommand,
  ): Promise<CandidateCommandResult> {
    const now = context.clock.now();
    return this.kernel.execute(
      context,
      {
        command: "VALIDATE_CANDIDATE",
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        idempotent: true,
      },
      (tx) =>
        this.outcomes.validateCandidate(
          tx,
          { ...context, now, idempotencyKey: context.idempotencyKey },
          command,
        ),
    );
  }

  rejectCandidate(
    context: CommandContext,
    command: RejectCandidateCommand,
  ): Promise<CandidateCommandResult> {
    const now = context.clock.now();
    return this.kernel.execute(
      context,
      {
        command: "REJECT_CANDIDATE",
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        idempotent: true,
      },
      (tx) =>
        this.outcomes.rejectCandidate(
          tx,
          { ...context, now, idempotencyKey: context.idempotencyKey },
          command,
        ),
    );
  }

  confirmWinners(
    context: CommandContext,
    command: ConfirmWinnerCommand,
  ): Promise<ConfirmWinnersResult> {
    const now = context.clock.now();
    return this.kernel.execute(
      context,
      {
        command: "CONFIRM_WINNER",
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        idempotent: true,
      },
      (tx) =>
        this.outcomes.confirmWinners(
          tx,
          { ...context, now, idempotencyKey: context.idempotencyKey },
          command,
        ),
    );
  }
}
