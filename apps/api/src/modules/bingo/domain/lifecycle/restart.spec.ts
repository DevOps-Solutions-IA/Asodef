import { decideRestart, evaluateRestart, RestartRequest } from "./restart";
import { BingoLifecycleErrorCode } from "./lifecycle-errors";
import { BINGO_EXECUTION_STATUSES } from "./state-machines";

const now = new Date("2026-08-09T20:00:00.000Z");

function request(overrides: Partial<RestartRequest> = {}): RestartRequest {
  return {
    roundId: "round-1",
    previousExecution: {
      id: "execution-1",
      roundId: "round-1",
      revision: 4,
      status: "CANCELLED",
    },
    requestedByUserId: "operator-1",
    requestedAt: now,
    reason: "Integrity incident reviewed",
    requiresSupervisorApproval: false,
    ...overrides,
  };
}

describe("Bingo non-destructive restart", () => {
  it("produces CREATE_NEW_EXECUTION linked to the cancelled revision", () => {
    const previousExecution = request().previousExecution;
    const decision = decideRestart(request());

    expect(decision).toEqual({
      type: "CREATE_NEW_EXECUTION",
      roundId: "round-1",
      previousExecutionId: "execution-1",
      revision: 5,
      status: "PLANNED",
      requestedByUserId: "operator-1",
      requestedAt: now,
      reason: "Integrity incident reviewed",
    });
    expect(request().previousExecution).toEqual(previousExecution);
    expect(decision.requestedAt).not.toBe(now);
  });

  it.each(BINGO_EXECUTION_STATUSES.filter((status) => status !== "CANCELLED"))(
    "rejects restart while the previous execution is %s",
    (status) => {
      expect(
        evaluateRestart(
          request({
            previousExecution: { ...request().previousExecution, status },
          }),
        ),
      ).toMatchObject({
        allowed: false,
        code: BingoLifecycleErrorCode.INVALID_RESTART,
      });
    },
  );

  it("rejects cross-round, blank-evidence and unsafe revisions", () => {
    expect(
      evaluateRestart(
        request({
          previousExecution: {
            ...request().previousExecution,
            roundId: "round-2",
          },
        }),
      ),
    ).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.INVALID_RESTART,
    });
    expect(evaluateRestart(request({ reason: " " }))).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.INVALID_RESTART,
    });
    expect(
      evaluateRestart(
        request({
          previousExecution: {
            ...request().previousExecution,
            revision: Number.MAX_SAFE_INTEGER,
          },
        }),
      ),
    ).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.INVALID_RESTART,
    });
  });

  it("enforces distinct supervisor approval when policy requires it", () => {
    expect(
      evaluateRestart(request({ requiresSupervisorApproval: true })),
    ).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.RESTART_SUPERVISOR_REQUIRED,
    });
    expect(
      evaluateRestart(
        request({
          requiresSupervisorApproval: true,
          approvedBySupervisorUserId: "operator-1",
        }),
      ),
    ).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.RESTART_SUPERVISOR_REQUIRED,
    });
    expect(
      decideRestart(
        request({
          requiresSupervisorApproval: true,
          approvedBySupervisorUserId: "supervisor-1",
        }),
      ),
    ).toMatchObject({
      type: "CREATE_NEW_EXECUTION",
      approvedBySupervisorUserId: "supervisor-1",
    });
  });
});
