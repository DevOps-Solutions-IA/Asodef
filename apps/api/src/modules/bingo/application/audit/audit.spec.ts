import { BingoAuditResult } from "@prisma/client";
import type { AppendAuditInput } from "./audit-contracts";
import { assertAuditInput } from "./audit-validation";

const ID = "11111111-1111-4111-8111-111111111111";

function valid(): AppendAuditInput {
  return {
    eventId: ID,
    executionId: ID,
    actorUserId: ID,
    actorPermission: "bingo.operate",
    action: "bingo.execution.started.v1",
    result: BingoAuditResult.SUCCEEDED,
    requestId: "request-1",
    metadata: { schemaVersion: 1, entityId: ID, revision: 1 },
    occurredAt: new Date("2026-08-11T12:00:00.000Z"),
  };
}

describe("Bingo audit allowlist", () => {
  it("accepts a committed operational audit", () => {
    expect(() => assertAuditInput(valid())).not.toThrow();
  });

  it("requires a reason for committed rejection/failure evidence", () => {
    expect(() =>
      assertAuditInput({ ...valid(), result: BingoAuditResult.REJECTED }),
    ).toThrow("BINGO_AUDIT_INVALID_INPUT:reason");
  });

  it("rejects metadata outside the PII-safe schema", () => {
    expect(() =>
      assertAuditInput({
        ...valid(),
        metadata: { ...valid().metadata, document: "123" } as never,
      }),
    ).toThrow("BINGO_AUDIT_INVALID_INPUT:metadata.keys");
  });
});
