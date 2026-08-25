import { Module } from "@nestjs/common";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";
import {
  DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG,
  KNOWLEDGE_BINARY_PARSERS,
  KNOWLEDGE_RETRIEVAL_CONFIG,
} from "./knowledge.tokens";

export const KNOWLEDGE_GATEWAY = Symbol("KNOWLEDGE_GATEWAY");

@Module({
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    { provide: KNOWLEDGE_GATEWAY, useExisting: KnowledgeService },
    { provide: KNOWLEDGE_BINARY_PARSERS, useValue: Object.freeze([]) },
    {
      provide: KNOWLEDGE_RETRIEVAL_CONFIG,
      useValue: DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG,
    },
  ],
  exports: [KnowledgeService, KNOWLEDGE_GATEWAY],
})
export class KnowledgeModule {}
