import type { GatewayRequestContext } from "@asodef/connect-contracts";
import type {
  KoralAiGatewayAdapter,
  KoralInferenceRequest,
  KoralKnowledgeGatewayAdapter,
  KoralKnowledgeRequest,
  KoralToolGatewayAdapter,
  KoralToolRequest,
} from "./contracts/gateway.contract";

/** Runtime boundary owned by Koral. It coordinates only canonical adapters;
 * provider transports and every data/infrastructure dependency stay behind
 * AiGateway, ToolGateway and KnowledgeGateway. */
export class KoralGatewayRuntime {
  constructor(
    private readonly ai: KoralAiGatewayAdapter,
    private readonly tools: KoralToolGatewayAdapter,
    private readonly knowledge: KoralKnowledgeGatewayAdapter,
  ) {}

  infer(request: KoralInferenceRequest, context: GatewayRequestContext) {
    assertLiveDeadline(context.deadlineAt);
    return this.ai.infer(request, context);
  }

  invokeTool(request: KoralToolRequest, context: GatewayRequestContext) {
    assertLiveDeadline(context.deadlineAt);
    return this.tools.invoke(request, context);
  }

  searchKnowledge(request: KoralKnowledgeRequest, context: GatewayRequestContext) {
    assertLiveDeadline(context.deadlineAt);
    return this.knowledge.search(request, context);
  }
}

function assertLiveDeadline(deadlineAt: string): void {
  const deadline = Date.parse(deadlineAt);
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error("DEADLINE_EXCEEDED");
}
