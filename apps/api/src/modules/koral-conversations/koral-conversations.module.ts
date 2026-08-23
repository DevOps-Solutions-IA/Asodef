import { Module } from "@nestjs/common";
import type { AiGateway } from "@asodef/connect-contracts";
import {
  AI_GATEWAY,
  AI_MODEL_REGISTRY,
  AiGatewayModule,
} from "../ai-gateway/ai-gateway.module";
import type { ModelRegistry } from "../ai-gateway/model-registry";
import { APPROVED_AGENT_MODEL_BINDINGS } from "../ai-gateway/runtime-model-catalog";
import { KoralConversationsController } from "./koral-conversations.controller";
import { KoralConversationsService } from "./koral-conversations.service";
import {
  CanonicalKoralAiGatewayAdapter,
  PublishedModelProfileResolver,
} from "./koral-gateway.adapters";

export const KORAL_AI_GATEWAY_ADAPTER = Symbol("KORAL_AI_GATEWAY_ADAPTER");

@Module({
  imports: [AiGatewayModule],
  controllers: [KoralConversationsController],
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
  ],
  exports: [KoralConversationsService, KORAL_AI_GATEWAY_ADAPTER],
})
export class KoralConversationsModule {}
