import {
  BINGO_EVENT_STATUSES,
  BINGO_EXECUTION_STATUSES,
  BINGO_ROUND_STATUSES,
  BingoEventStatus,
  BingoExecutionStatus,
  BingoRoundStatus,
  evaluateEventTransition,
  evaluateExecutionTransition,
  evaluateRoundTransition,
  isEventTerminal,
  isExecutionTerminal,
  isRoundTerminal,
  transitionExecution,
} from "./state-machines";
import {
  BingoLifecycleError,
  BingoLifecycleErrorCode,
} from "./lifecycle-errors";

const allowedEventTransitions = new Set([
  "DRAFT:CONFIGURED",
  "DRAFT:CANCELLED",
  "CONFIGURED:PUBLISHED",
  "CONFIGURED:CANCELLED",
  "PUBLISHED:IN_PROGRESS",
  "PUBLISHED:CANCELLED",
  "IN_PROGRESS:COMPLETED",
  "IN_PROGRESS:CANCELLED",
  "COMPLETED:ARCHIVED",
]);

const allowedRoundTransitions = new Set([
  "DRAFT:READY",
  "DRAFT:CANCELLED",
  "READY:IN_PROGRESS",
  "READY:CANCELLED",
  "IN_PROGRESS:COMPLETED",
  "IN_PROGRESS:CANCELLED",
]);

const allowedExecutionTransitions = new Set([
  "PLANNED:RUNNING",
  "RUNNING:PAUSED",
  "RUNNING:COMPLETED",
  "PAUSED:RUNNING",
]);

describe("Bingo lifecycle state machines", () => {
  it.each(
    BINGO_EVENT_STATUSES.flatMap((from) =>
      BINGO_EVENT_STATUSES.map((to) => [from, to] as const),
    ),
  )(
    "evaluates event transition %s -> %s from the complete matrix",
    (from, to) => {
      expect(evaluateEventTransition(from, to).allowed).toBe(
        allowedEventTransitions.has(`${from}:${to}`),
      );
    },
  );

  it.each(
    BINGO_ROUND_STATUSES.flatMap((from) =>
      BINGO_ROUND_STATUSES.map((to) => [from, to] as const),
    ),
  )(
    "evaluates round transition %s -> %s from the complete matrix",
    (from, to) => {
      expect(evaluateRoundTransition(from, to).allowed).toBe(
        allowedRoundTransitions.has(`${from}:${to}`),
      );
    },
  );

  it.each(
    BINGO_EXECUTION_STATUSES.flatMap((from) =>
      BINGO_EXECUTION_STATUSES.filter((to) => to !== "CANCELLED").map(
        (to) => [from, to] as const,
      ),
    ),
  )(
    "evaluates execution transition %s -> %s from the complete matrix",
    (from, to) => {
      expect(evaluateExecutionTransition(from, to).allowed).toBe(
        allowedExecutionTransitions.has(`${from}:${to}`),
      );
    },
  );

  it("requires explicit cancellation policy, authorization and a reason", () => {
    const policy = {
      allowedFrom: ["RUNNING", "PAUSED"] as const,
      requiresAuthorization: true,
    };

    expect(evaluateExecutionTransition("RUNNING", "CANCELLED")).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.EXECUTION_CANCELLATION_FORBIDDEN,
    });
    expect(
      evaluateExecutionTransition("PLANNED", "CANCELLED", {
        policy,
        authorized: true,
        reason: "Cancelled before start",
      }),
    ).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.EXECUTION_CANCELLATION_FORBIDDEN,
    });
    expect(
      evaluateExecutionTransition("RUNNING", "CANCELLED", {
        policy,
        authorized: false,
        reason: "Operational incident",
      }),
    ).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.EXECUTION_CANCELLATION_FORBIDDEN,
    });
    expect(
      evaluateExecutionTransition("RUNNING", "CANCELLED", {
        policy,
        authorized: true,
        reason: "   ",
      }),
    ).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.CANCELLATION_REASON_REQUIRED,
    });
    expect(
      evaluateExecutionTransition("PAUSED", "CANCELLED", {
        policy,
        authorized: true,
        reason: "Integrity review failed",
      }),
    ).toEqual({ allowed: true, value: "CANCELLED" });
  });

  it("never reopens terminal states", () => {
    const eventTerminalStates: BingoEventStatus[] = ["CANCELLED", "ARCHIVED"];
    const roundTerminalStates: BingoRoundStatus[] = ["COMPLETED", "CANCELLED"];
    const executionTerminalStates: BingoExecutionStatus[] = [
      "COMPLETED",
      "CANCELLED",
    ];

    for (const from of eventTerminalStates) {
      expect(isEventTerminal(from)).toBe(true);
      for (const to of BINGO_EVENT_STATUSES) {
        expect(evaluateEventTransition(from, to).allowed).toBe(false);
      }
    }
    for (const from of roundTerminalStates) {
      expect(isRoundTerminal(from)).toBe(true);
      for (const to of BINGO_ROUND_STATUSES) {
        expect(evaluateRoundTransition(from, to).allowed).toBe(false);
      }
    }
    for (const from of executionTerminalStates) {
      expect(isExecutionTerminal(from)).toBe(true);
      for (const to of BINGO_EXECUTION_STATUSES) {
        expect(evaluateExecutionTransition(from, to).allowed).toBe(false);
      }
    }
  });

  it("rejects completing a paused execution", () => {
    expect(evaluateExecutionTransition("PAUSED", "COMPLETED")).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.INVALID_STATE_TRANSITION,
    });
  });

  it("throws a structured exception from the imperative helper", () => {
    expect(() => transitionExecution("COMPLETED", "RUNNING")).toThrow(
      expect.objectContaining({
        name: "BingoLifecycleError",
        code: BingoLifecycleErrorCode.INVALID_STATE_TRANSITION,
        details: { aggregate: "EXECUTION", from: "COMPLETED", to: "RUNNING" },
      }) as BingoLifecycleError,
    );
  });

  it("matches the matrices under deterministic fuzzing", () => {
    let seed = 0x5eed1234;
    const next = (limit: number): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed % limit;
    };

    for (let index = 0; index < 10_000; index += 1) {
      const aggregate = next(3);
      if (aggregate === 0) {
        const from =
          BINGO_EVENT_STATUSES[next(BINGO_EVENT_STATUSES.length)] ?? "DRAFT";
        const to =
          BINGO_EVENT_STATUSES[next(BINGO_EVENT_STATUSES.length)] ?? "DRAFT";
        expect(evaluateEventTransition(from, to).allowed).toBe(
          allowedEventTransitions.has(`${from}:${to}`),
        );
      } else if (aggregate === 1) {
        const from =
          BINGO_ROUND_STATUSES[next(BINGO_ROUND_STATUSES.length)] ?? "DRAFT";
        const to =
          BINGO_ROUND_STATUSES[next(BINGO_ROUND_STATUSES.length)] ?? "DRAFT";
        expect(evaluateRoundTransition(from, to).allowed).toBe(
          allowedRoundTransitions.has(`${from}:${to}`),
        );
      } else {
        const from =
          BINGO_EXECUTION_STATUSES[next(BINGO_EXECUTION_STATUSES.length)] ??
          "PLANNED";
        const to =
          BINGO_EXECUTION_STATUSES[next(BINGO_EXECUTION_STATUSES.length)] ??
          "PLANNED";
        const result = evaluateExecutionTransition(from, to);
        const expected =
          to !== "CANCELLED" &&
          allowedExecutionTransitions.has(`${from}:${to}`);
        expect(result.allowed).toBe(expected);
      }
    }
  });
});
