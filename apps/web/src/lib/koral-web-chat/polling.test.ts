import { describe, expect, it } from "vitest";
import { nextWebChatPollDelay } from "./polling";

describe("nextWebChatPollDelay", () => {
  it("polls active and human-owned conversations with bounded server hints", () => {
    expect(nextWebChatPollDelay("AI_ACTIVE")).toBe(3_000);
    expect(nextWebChatPollDelay("HUMAN_ACTIVE", 200)).toBe(1_000);
    expect(nextWebChatPollDelay("HUMAN_REQUIRED", 90_000)).toBe(30_000);
  });

  it("stops polling terminal and resolved conversations", () => {
    expect(nextWebChatPollDelay("RESOLVED")).toBeNull();
    expect(nextWebChatPollDelay("CLOSED")).toBeNull();
  });
});
