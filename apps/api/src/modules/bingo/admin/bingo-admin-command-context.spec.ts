import { hashIdempotencyRequest } from "../application/idempotency";
import { buildBingoCommandContext } from "./bingo-admin-command-context";

const user = {
  id: "04c707d7-8b3e-4741-ad09-dff1561ab1f1",
  permissions: ["bingo.operate"],
};

function request(idempotencyKey?: string) {
  return {
    requestId: "request-1",
    header: (name: string) =>
      name.toLowerCase() === "idempotency-key" ? idempotencyKey : undefined,
  } as never;
}

describe("buildBingoCommandContext", () => {
  it("derives actor and hashes from server-owned request context", () => {
    const command = { eventId: "event", executionId: "execution" };
    const result = buildBingoCommandContext(
      request("command-key-123456"),
      user as never,
      command,
    );
    expect(result.actor.userId).toBe(user.id);
    expect(result.actor.permissions.has("bingo.operate")).toBe(true);
    expect(result.requestHash).toBe(hashIdempotencyRequest(command));
    expect(result.idempotencyKeyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([undefined, "short", `valid-key\nsmuggled`])(
    "rejects an invalid Idempotency-Key (%s)",
    (key) => {
      expect(() =>
        buildBingoCommandContext(request(key), user as never, {}),
      ).toThrow("Idempotency-Key");
    },
  );
});
