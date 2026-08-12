import {
  BingoLifecycleDecision,
  BingoLifecycleErrorCode,
  requireLifecycleDecision,
} from "./lifecycle-errors";
import { BingoExecutionStatus } from "./state-machines";

export interface PreviousExecutionReference {
  readonly id: string;
  readonly roundId: string;
  readonly revision: number;
  readonly status: BingoExecutionStatus;
}

export interface RestartRequest {
  readonly roundId: string;
  readonly previousExecution: PreviousExecutionReference;
  readonly requestedByUserId: string;
  readonly requestedAt: Date;
  readonly reason: string;
  readonly requiresSupervisorApproval: boolean;
  readonly approvedBySupervisorUserId?: string;
}

export interface CreateNewExecutionDecision {
  readonly type: "CREATE_NEW_EXECUTION";
  readonly roundId: string;
  readonly previousExecutionId: string;
  readonly revision: number;
  readonly status: "PLANNED";
  readonly requestedByUserId: string;
  readonly requestedAt: Date;
  readonly reason: string;
  readonly approvedBySupervisorUserId?: string;
}

function invalidRestart(
  request: RestartRequest,
): BingoLifecycleDecision<CreateNewExecutionDecision> {
  return {
    allowed: false,
    code: BingoLifecycleErrorCode.INVALID_RESTART,
    details: {
      aggregate: "EXECUTION",
      executionId: request.previousExecution.id,
      roundId: request.roundId,
    },
  };
}

export function evaluateRestart(
  request: RestartRequest,
): BingoLifecycleDecision<CreateNewExecutionDecision> {
  const previous = request.previousExecution;
  if (
    previous.status !== "CANCELLED" ||
    previous.roundId !== request.roundId ||
    previous.revision < 1 ||
    previous.revision >= Number.MAX_SAFE_INTEGER ||
    request.reason.trim().length === 0 ||
    request.requestedByUserId.trim().length === 0 ||
    Number.isNaN(request.requestedAt.getTime())
  ) {
    return invalidRestart(request);
  }

  if (
    request.requiresSupervisorApproval &&
    (request.approvedBySupervisorUserId === undefined ||
      request.approvedBySupervisorUserId.trim().length === 0 ||
      request.approvedBySupervisorUserId === request.requestedByUserId)
  ) {
    return {
      allowed: false,
      code: BingoLifecycleErrorCode.RESTART_SUPERVISOR_REQUIRED,
      details: {
        aggregate: "EXECUTION",
        executionId: previous.id,
        roundId: request.roundId,
      },
    };
  }

  return {
    allowed: true,
    value: {
      type: "CREATE_NEW_EXECUTION",
      roundId: request.roundId,
      previousExecutionId: previous.id,
      revision: previous.revision + 1,
      status: "PLANNED",
      requestedByUserId: request.requestedByUserId,
      requestedAt: new Date(request.requestedAt.getTime()),
      reason: request.reason.trim(),
      ...(request.approvedBySupervisorUserId === undefined
        ? {}
        : { approvedBySupervisorUserId: request.approvedBySupervisorUserId }),
    },
  };
}

export function decideRestart(
  request: RestartRequest,
): CreateNewExecutionDecision {
  return requireLifecycleDecision(evaluateRestart(request));
}
