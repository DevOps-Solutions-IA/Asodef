import { Module } from "@nestjs/common";
import type { AiGateway } from "@asodef/connect-contracts";
import {
  AI_GATEWAY,
  AI_MODEL_REGISTRY,
  AiGatewayModule,
} from "../ai-gateway/ai-gateway.module";
import type { ModelRegistry } from "../ai-gateway/model-registry";
import { APPROVED_AGENT_MODEL_BINDINGS } from "../ai-gateway/runtime-model-catalog";
import { AuthModule } from "../auth/auth.module";
import { ConversationIdentityBindingService } from "./conversation-identity-binding.service";
import { KoralIdentityResolutionService } from "./identity-resolution.service";
import { KoralConversationsController } from "./koral-conversations.controller";
import { KoralConversationsService } from "./koral-conversations.service";
import {
  CanonicalKoralAiGatewayAdapter,
  PublishedModelProfileResolver,
} from "./koral-gateway.adapters";
import { KoralWebChatRuntimeAdapter } from "./web-chat-runtime.adapter";
import { WebChatController } from "./web-chat.controller";
import { WebChatCryptoService } from "./web-chat-crypto.service";
import { WebChatMessageProcessingService } from "./web-chat-message-processing.service";
import { WebChatRequestGuard } from "./web-chat-request.guard";
import { WebChatServerService } from "./web-chat-server.service";
import { WebChatSessionService } from "./web-chat-session.service";

export const KORAL_AI_GATEWAY_ADAPTER = Symbol("KORAL_AI_GATEWAY_ADAPTER");

@Module({
  imports: [AiGatewayModule, AuthModule],
  controllers: [KoralConversationsController, WebChatController],
  providers: [
    KoralConversationsService,
    {
      provide: PublishedModelProfileResolver,
      inject: [AI_MODEL_REGISTRY],
      useFactory: (registry: ModelRegistry) =>
        new PublishedModelProfileResolver(
          registry,
          APPROVED_AGENT_MODEL_BINDINGS,
        ),
    },
    {
      provide: KORAL_AI_GATEWAY_ADAPTER,
      inject: [AI_GATEWAY, PublishedModelProfileResolver],
      useFactory: (
        gateway: AiGateway,
        profiles: PublishedModelProfileResolver,
      ) => new CanonicalKoralAiGatewayAdapter(gateway, profiles),
    },
    KoralIdentityResolutionService,
    ConversationIdentityBindingService,
    KoralWebChatRuntimeAdapter,
    WebChatCryptoService,
    WebChatMessageProcessingService,
    WebChatRequestGuard,
    WebChatSessionService,
    WebChatServerService,
  ],
  exports: [
    KoralConversationsService,
    KORAL_AI_GATEWAY_ADAPTER,
    KoralIdentityResolutionService,
    ConversationIdentityBindingService,
  ],
})
export class KoralConversationsModule {}
