import type {
  CanonicalAiGatewayPort,
  CanonicalToolGatewayPort,
  KoralGatewayInvocationContext,
} from "./gateway.contract";
import { KORAL_GATEWAY_ADAPTER_SEMANTICS } from "./gateway.contract";
import { KORAL_ORCHESTRATION_STEPS } from "./orchestrator.contract";

type Agent2AiRequest = { version: "v1"; modelProfileId: string };
type Agent2AiContext = { actorId: string; correlationId: string };
type Agent2AiResponse = { version: "v1"; correlationId: string };
type Agent2AiGatewayShape = {
  infer(request: Agent2AiRequest, context: Agent2AiContext): Promise<Agent2AiResponse>;
};

type Agent2ToolRequest = { version: "v1"; toolName: string; toolVersion: `v${number}` };
type Agent2ToolContext = { actorId: string; correlationId: string; idempotencyKey?: string };
type Agent2ToolResponse = { version: "v1"; meta: { correlationId: string; replayed: boolean } };
type Agent2ToolGatewayShape = {
  invoke(request: Agent2ToolRequest, context: Agent2ToolContext): Promise<Agent2ToolResponse>;
};

type Assert<T extends true> = T;
type AiGatewayMethodIsCompatible = Assert<
  Agent2AiGatewayShape extends CanonicalAiGatewayPort<Agent2AiRequest, Agent2AiContext, Agent2AiResponse>
    ? true
    : false
>;
type ToolGatewayMethodIsCompatible = Assert<
  Agent2ToolGatewayShape extends CanonicalToolGatewayPort<Agent2ToolRequest, Agent2ToolContext, Agent2ToolResponse>
    ? true
    : false
>;

describe("Agent 2 gateway reconciliation", () => {
  it("keeps only minimal structural ports compatible with Agent 2 method signatures", () => {
    const aiCompatible: AiGatewayMethodIsCompatible = true;
    const toolCompatible: ToolGatewayMethodIsCompatible = true;
    expect({ aiCompatible, toolCompatible }).toEqual({ aiCompatible: true, toolCompatible: true });
  });

  it("propagates explicit identity, consent, correlation and one absolute deadline", () => {
    const context: KoralGatewayInvocationContext<"PERSONAL"> = {
      version: "1.0.0",
      audit: {
        conversationId: "conversation-1",
        correlationId: "correlation-1",
        identityId: "identity-1",
        purpose: "customer-support",
      },
      identity: {
        version: "1.0.0",
        identityId: "identity-1",
        channelIdentities: [],
        assuranceLevel: "VERIFIED",
        consentState: { status: "GRANTED", purposeKeys: ["customer-support"] },
        verifiedAttributes: [],
      },
      permissions: ["koral.conversations.read"],
      dataClassification: "PERSONAL",
      consentVerified: true,
      deadlineAt: "2026-08-22T20:00:00.000Z",
    };

    expect(context.audit.correlationId).toBe("correlation-1");
    expect(context.deadlineAt).toBe("2026-08-22T20:00:00.000Z");
    expect(KORAL_GATEWAY_ADAPTER_SEMANTICS.idempotency).toContain("never retry");
  });

  it("fixes the complete orchestration order without embedding a provider transport", () => {
    expect(KORAL_ORCHESTRATION_STEPS).toEqual([
      "RECEIVE_NORMALIZED_MESSAGE",
      "RESOLVE_CONVERSATION",
      "BUILD_SAFE_CONTEXT",
      "EVALUATE_AI_POLICY",
      "INVOKE_AI_GATEWAY",
      "RECEIVE_TOOL_REQUEST",
      "INVOKE_TOOL_GATEWAY",
      "RETURN_TOOL_RESULT",
      "CONTINUE_INFERENCE_IF_ALLOWED",
      "VALIDATE_OUTBOUND_RESPONSE",
      "HANDOFF_IF_REQUIRED",
      "APPEND_AUDIT_AND_CONVERSATION_EVENTS",
    ]);
  });
});
