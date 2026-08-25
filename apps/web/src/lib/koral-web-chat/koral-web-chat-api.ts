import { z } from "zod";
import { apiClient } from "../api-client";
import {
  WEB_CHAT_CONTRACT_VERSION,
  type ClaimWebChatIdentityInput,
  type SendWebChatMessageInput,
  type WebChatSnapshot,
  webChatSnapshotSchema,
} from "./types";

const WEB_CHAT_BASE_PATH = "/koral/web-chat";

export interface KoralWebChatClient {
  bootstrap(signal?: AbortSignal): Promise<WebChatSnapshot>;
  history(signal?: AbortSignal, cursor?: string): Promise<WebChatSnapshot>;
  sendMessage(input: SendWebChatMessageInput, signal?: AbortSignal): Promise<WebChatSnapshot>;
  claimIdentity(input: ClaimWebChatIdentityInput, signal?: AbortSignal): Promise<WebChatSnapshot>;
}

function parseSnapshot(value: unknown): WebChatSnapshot {
  return webChatSnapshotSchema.parse(value);
}

export const koralWebChatClient: KoralWebChatClient = {
  async bootstrap(signal) {
    const response = await apiClient.post<unknown>(`${WEB_CHAT_BASE_PATH}/bootstrap`, {
      version: WEB_CHAT_CONTRACT_VERSION,
    }, { signal, skipAuthRefresh: true });
    return parseSnapshot(response);
  },

  async history(signal, cursor) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await apiClient.get<unknown>(`${WEB_CHAT_BASE_PATH}/history${query}`, {
      signal,
      skipAuthRefresh: true,
    });
    return parseSnapshot(response);
  },

  async sendMessage(input, signal) {
    const request = z.object({
      clientMessageId: z.string().uuid(),
      body: z.string().trim().min(1).max(4_000),
    }).strict().parse(input);
    const response = await apiClient.post<unknown>(`${WEB_CHAT_BASE_PATH}/messages`, {
      version: WEB_CHAT_CONTRACT_VERSION,
      clientMessageId: request.clientMessageId,
      content: { type: "text/plain", body: request.body },
    }, { signal, skipAuthRefresh: true });
    return parseSnapshot(response);
  },

  async claimIdentity(input, signal) {
    const request = z.object({
      clientClaimId: z.string().uuid(),
      displayName: z.string().trim().min(1).max(120),
    }).strict().parse(input);
    const response = await apiClient.post<unknown>(`${WEB_CHAT_BASE_PATH}/identity/claim`, {
      version: WEB_CHAT_CONTRACT_VERSION,
      clientClaimId: request.clientClaimId,
      displayName: request.displayName,
    }, { signal, skipAuthRefresh: true });
    return parseSnapshot(response);
  },
};

export function isContractValidationError(error: unknown): error is z.ZodError {
  return error instanceof z.ZodError;
}
