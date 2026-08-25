import { MODULE_METADATA } from "@nestjs/common/constants";
import { KnowledgeService } from "./knowledge.service";
import { KNOWLEDGE_GATEWAY, KnowledgeModule } from "./knowledge.module";

describe("KnowledgeModule canonical gateway registration", () => {
  it("exports one real KnowledgeGateway backed by KnowledgeService", () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, KnowledgeModule) as Array<unknown>;
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, KnowledgeModule) as Array<unknown>;
    expect(providers).toContain(KnowledgeService);
    expect(providers).toContainEqual({ provide: KNOWLEDGE_GATEWAY, useExisting: KnowledgeService });
    expect(exports).toContain(KNOWLEDGE_GATEWAY);
  });
});
