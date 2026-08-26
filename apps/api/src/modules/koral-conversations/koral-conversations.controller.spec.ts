import { PERMISSIONS_KEY } from "../auth/decorators/permissions.decorator";
import { REQUIRE_STEP_UP_KEY } from "../auth/decorators/require-step-up.decorator";
import { KoralConversationsController } from "./koral-conversations.controller";

describe("KoralConversationsController governance metadata", () => {
  it.each(["list", "findById", "markRead"] as const)(
    "keeps %s behind the canonical read permission",
    (method) => {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, KoralConversationsController.prototype[method])).toEqual([
        "koral.conversations.read",
      ]);
    },
  );

  it.each([
    "assign",
    "escalate",
    "transitionStatus",
    "returnToKoral",
    "release",
    "changePriority",
  ] as const)("keeps %s behind manage permission and step-up", (method) => {
    const handler = KoralConversationsController.prototype[method];
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      "koral.conversations.manage",
    ]);
    expect(Reflect.getMetadata(REQUIRE_STEP_UP_KEY, handler)).toBe(true);
  });

  it("protects assignee discovery and internal notes with the canonical manage permission", () => {
    for (const method of ["eligibleAssignees", "addInternalNote"] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, KoralConversationsController.prototype[method])).toEqual([
        "koral.conversations.manage",
      ]);
    }
  });
});
