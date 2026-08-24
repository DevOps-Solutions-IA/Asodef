import { ConversationStatus } from "@prisma/client";
import { canTransitionConversation, mayKoralAutoReply, statusAfterInbound } from "./conversation-state-machine";

describe("Koral conversation state machine", () => {
  it("permits controlled handoff and return transitions", () => {
    expect(canTransitionConversation(ConversationStatus.AI_ACTIVE, ConversationStatus.HUMAN_REQUIRED)).toBe(true);
    expect(canTransitionConversation(ConversationStatus.AI_ACTIVE, ConversationStatus.HUMAN_ACTIVE)).toBe(true);
    expect(canTransitionConversation(ConversationStatus.HUMAN_REQUIRED, ConversationStatus.HUMAN_ACTIVE)).toBe(true);
    expect(canTransitionConversation(ConversationStatus.HUMAN_ACTIVE, ConversationStatus.AI_ACTIVE)).toBe(true);
    expect(canTransitionConversation(ConversationStatus.HUMAN_ACTIVE, ConversationStatus.HUMAN_REQUIRED)).toBe(true);
  });

  it("keeps CLOSED terminal and rejects invalid shortcuts", () => {
    expect(canTransitionConversation(ConversationStatus.CLOSED, ConversationStatus.AI_ACTIVE)).toBe(false);
    expect(canTransitionConversation(ConversationStatus.CLOSED, ConversationStatus.HUMAN_ACTIVE)).toBe(false);
  });

  it("never authorizes an automatic Koral reply during human ownership", () => {
    expect(mayKoralAutoReply(ConversationStatus.HUMAN_ACTIVE)).toBe(false);
    expect(mayKoralAutoReply(ConversationStatus.HUMAN_REQUIRED)).toBe(false);
    expect(mayKoralAutoReply(ConversationStatus.AI_ACTIVE)).toBe(true);
    expect(mayKoralAutoReply(ConversationStatus.AI_ACTIVE, true)).toBe(false);
    expect(mayKoralAutoReply(ConversationStatus.WAITING_USER, true)).toBe(false);
  });

  it("reactivates a waiting/resolved conversation on inbound without overriding human state", () => {
    expect(statusAfterInbound(ConversationStatus.WAITING_USER)).toBe(ConversationStatus.AI_ACTIVE);
    expect(statusAfterInbound(ConversationStatus.RESOLVED)).toBe(ConversationStatus.AI_ACTIVE);
    expect(statusAfterInbound(ConversationStatus.HUMAN_ACTIVE)).toBe(ConversationStatus.HUMAN_ACTIVE);
  });
});
