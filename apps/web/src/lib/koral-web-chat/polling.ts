import type { WebChatConversationStatus } from "./types";

const DEFAULT_POLL_MS: Readonly<Partial<Record<WebChatConversationStatus, number>>> = {
  AI_ACTIVE: 3_000,
  WAITING_INTERNAL: 3_000,
  WAITING_USER: 8_000,
  HUMAN_REQUIRED: 5_000,
  HUMAN_ACTIVE: 5_000,
};

export function nextWebChatPollDelay(status: WebChatConversationStatus, serverHint?: number): number | null {
  const defaultDelay = DEFAULT_POLL_MS[status];
  if (defaultDelay === undefined) return null;
  if (serverHint === undefined) return defaultDelay;
  return Math.max(1_000, Math.min(serverHint, 30_000));
}
