import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { DataClassification } from "@asodef/connect-contracts";
import type { EnvConfig } from "../../config/env.validation";
import {
  KORAL_ORCHESTRATOR_CONTRACT_VERSION,
  KORAL_ORCHESTRATION_STEPS,
  type KoralOrchestrationPipeline,
  type KoralOrchestrationRunInput,
  type KoralOrchestrationRunResult,
  type KoralOrchestrationStep,
  type OrchestrationAnalysis,
  type OrchestrationDecision,
  type ResponseValidationResult,
  type SafeConversationContext,
} from "./contracts/orchestrator.contract";
import type {
  KoralInferenceOutcome,
  KoralToolOutcome,
} from "./contracts/gateway.contract";
import type { ResolvedIdentityContext } from "./contracts/identity-resolution.contract";
import {
  buildKoralServiceGatewayRequestContext,
  type CanonicalKoralAiGatewayAdapter,
} from "./koral-gateway.adapters";
import { KoralConversationsService } from "./koral-conversations.service";

const AGENT_PROFILE_KEY = "koral.crm-assistant";
const PURPOSE = "crm-assistance";
const MAX_RESPONSE_LENGTH = 4_000;
const SAFE_PUBLIC_GREETING = /^(hola|buen(?:os|as)\s+(?:d[ií]as|tardes|noches)|hello|hi)[.!¡¿?\s]*$/iu;
const RESPONSE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["response"],
  properties: {
    response: { type: "string", minLength: 1, maxLength: MAX_RESPONSE_LENGTH },
  },
});

/** Concrete Koral application pipeline. Persistence stays behind the
 * conversation service and provider transport stays behind AiGateway. */
@Injectable()
export class GovernedKoralOrchestrationPipeline
implements KoralOrchestrationPipeline {
  readonly available: boolean;

  constructor(
    private readonly conversations: KoralConversationsService,
    private readonly aiGateway: CanonicalKoralAiGatewayAdapter,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.available = config.get("AI_RUNTIME_ENABLED", { infer: true });
  }

  async receiveNormalizedMessage(
    input: KoralOrchestrationRunInput,
  ): Promise<string> {
    const messageId = input.normalizedMessageId.trim();
    if (!messageId) throw new BadRequestException("KORAL_MESSAGE_REQUIRED");
    return messageId;
  }

  async resolveConversation(
    normalizedMessageId: string,
    _correlationId: string,
  ): Promise<string> {
    return (await this.conversations.buildKoralContextSnapshot(normalizedMessageId))
      .conversationId;
  }

  async buildSafeContext(
    conversationId: string,
    normalizedMessageId: string,
    correlationId: string,
    deadlineAt: string,
    effectiveIdentity: ResolvedIdentityContext,
  ): Promise<SafeConversationContext> {
    const snapshot = await this.conversations.buildKoralContextSnapshot(
      normalizedMessageId,
    );
    if (snapshot.conversationId !== conversationId) {
      throw new BadRequestException("KORAL_CONTEXT_CONVERSATION_MISMATCH");
    }
    const sourceBody = sourceMessageBody(snapshot.recentMessages, snapshot.sourceMessageId);
    const dataClassification: DataClassification = SAFE_PUBLIC_GREETING.test(sourceBody)
      ? "PUBLIC"
      : "PERSONAL";
    return {
      version: KORAL_ORCHESTRATOR_CONTRACT_VERSION,
      ...snapshot,
      identity: effectiveIdentity,
      dataClassification,
      gatewayContext: buildKoralServiceGatewayRequestContext({
        visitorIdentity: effectiveIdentity,
        correlationId,
        conversationId,
        causationId: snapshot.sourceMessageId,
        purpose: PURPOSE,
        piiPolicy: dataClassification === "PUBLIC" ? "DENY" : "MINIMIZE",
        dataClassification,
        deadlineAt,
      }),
    };
  }

  async analyze(context: SafeConversationContext): Promise<OrchestrationAnalysis> {
    const body = sourceMessageBody(context.recentMessages, context.sourceMessageId);
    const publicGreeting = context.dataClassification === "PUBLIC" && SAFE_PUBLIC_GREETING.test(body);
    return {
      intent: publicGreeting ? "PUBLIC_GREETING" : "BUSINESS_INFORMATION_REQUEST",
      taskKind: publicGreeting ? "PUBLIC_CONVERSATION" : "KNOWLEDGE_REQUIRED",
      confidence: publicGreeting ? 1 : 0,
      requiresKnowledge: !publicGreeting,
      proposedToolKeys: [],
      requiresHuman: !publicGreeting,
      reasonCodes: publicGreeting ? [] : ["KNOWLEDGE_PROVIDER_UNAVAILABLE"],
    };
  }

  async selectAgentProfile(
    _context: SafeConversationContext,
    _analysis: OrchestrationAnalysis,
  ): Promise<string> {
    return AGENT_PROFILE_KEY;
  }

  async evaluateAiPolicy(
    context: SafeConversationContext,
  ): Promise<OrchestrationDecision> {
    const analysis = await this.analyze(context);
    if (analysis.requiresKnowledge) {
      return decision(analysis, "HANDOFF", ["KNOWLEDGE_REQUIRED"]);
    }
    if (
      context.identity.assuranceLevel !== "ANONYMOUS"
      && context.identity.assuranceLevel !== "CLAIMED"
      && context.identity.consentState.status !== "GRANTED"
    ) {
      return decision(
        { ...analysis, requiresHuman: true, reasonCodes: ["CONSENT_NOT_GRANTED"] },
        "HANDOFF",
        ["CONSENT_REQUIRED"],
      );
    }
    return decision(analysis, "RESPOND", ["PUBLIC_CONTENT_ONLY", "NO_TOOLS"]);
  }

  async invokeAiGateway(
    context: SafeConversationContext,
    decisionValue: OrchestrationDecision,
  ): Promise<KoralInferenceOutcome> {
    if (decisionValue.action !== "RESPOND") {
      return {
        kind: "REJECTED",
        reasonCode: "POLICY_DENIED",
        retryable: false,
      };
    }
    const body = sourceMessageBody(context.recentMessages, context.sourceMessageId);
    if (!SAFE_PUBLIC_GREETING.test(body)) {
      return {
        kind: "REJECTED",
        reasonCode: "DATA_CLASSIFICATION_DENIED",
        retryable: false,
      };
    }
    const remaining = Date.parse(context.gatewayContext.deadlineAt) - Date.now();
    if (remaining <= 0) {
      return { kind: "REJECTED", reasonCode: "TIMEOUT", retryable: false };
    }
    return this.aiGateway.infer(
      {
        agentProfileKey: decisionValue.agentProfileKey ?? AGENT_PROFILE_KEY,
        task: "Provide a brief public greeting. Do not claim business facts.",
        messages: [
          {
            role: "system",
            content: "Return only a brief greeting in the user's language. Do not provide business facts or request personal data.",
          },
          { role: "user", content: body },
        ],
        responseSchema: RESPONSE_SCHEMA,
        availableTools: [],
        maxOutputTokens: 120,
        timeout: { milliseconds: remaining, maxAttempts: 1 },
      },
      context.gatewayContext,
    );
  }

  async receiveToolRequest(
    outcome: KoralInferenceOutcome,
  ): Promise<readonly string[]> {
    return outcome.kind === "TOOL_REQUEST"
      ? outcome.requests.map(({ callId }) => callId)
      : [];
  }

  async invokeToolGateway(
    _context: SafeConversationContext,
    _toolCallId: string,
  ): Promise<KoralToolOutcome> {
    return {
      kind: "REJECTED",
      reasonCode: "TOOL_GATEWAY_UNAVAILABLE",
      retryable: false,
      correlationId: "not-invoked",
    };
  }

  async returnToolResult(
    _conversationId: string,
    _outcome: KoralToolOutcome,
  ): Promise<void> {}

  async continueInferenceIfAllowed(
    _context: SafeConversationContext,
  ): Promise<KoralInferenceOutcome | undefined> {
    return undefined;
  }

  async validateOutboundResponse(
    _context: SafeConversationContext,
    candidate: KoralInferenceOutcome,
  ): Promise<ResponseValidationResult> {
    if (candidate.kind !== "ASSISTANT_RESPONSE") {
      return { valid: false, violations: ["ASSISTANT_RESPONSE_REQUIRED"] };
    }
    const structured = candidate.structuredOutput;
    if (!isObject(structured) || typeof structured.response !== "string") {
      return { valid: false, violations: ["STRUCTURED_RESPONSE_REQUIRED"] };
    }
    const safeResponse = structured.response.trim();
    if (
      !safeResponse
      || safeResponse.length > MAX_RESPONSE_LENGTH
      || containsControlCharacter(safeResponse)
    ) {
      return { valid: false, violations: ["INVALID_SAFE_RESPONSE"] };
    }
    return { valid: true, violations: [], safeResponse };
  }

  async handoffIfRequired(
    context: SafeConversationContext,
    violations: readonly string[],
  ): Promise<boolean> {
    const result = await this.conversations.requestKoralHandoff({
      conversationId: context.conversationId,
      expectedVersion: context.conversationVersion,
      sourceMessageId: context.sourceMessageId,
      correlationId: context.gatewayContext.audit.correlationId,
      reasonCodes: violations,
    });
    return result.transitioned;
  }

  async appendAuditAndConversationEvents(
    _conversationId: string,
    _correlationId: string,
    _gatewayReferences: readonly string[],
  ): Promise<void> {
    // Outbound commit and handoff methods append their event atomically with
    // the state mutation. A second non-transactional audit write is avoided.
  }

  async run(input: KoralOrchestrationRunInput): Promise<KoralOrchestrationRunResult> {
    const completed: KoralOrchestrationStep[] = [];
    const messageId = await this.receiveNormalizedMessage(input);
    completed.push(KORAL_ORCHESTRATION_STEPS[0]);
    const snapshot = await this.conversations.buildKoralContextSnapshot(messageId);
    const conversationId = snapshot.conversationId;
    completed.push(KORAL_ORCHESTRATION_STEPS[1]);
    const context = await this.buildSafeContext(
      conversationId,
      messageId,
      input.correlationId,
      input.deadlineAt,
      input.effectiveIdentity,
    );
    completed.push(KORAL_ORCHESTRATION_STEPS[2]);
    const policy = await this.evaluateAiPolicy(context);
    completed.push(KORAL_ORCHESTRATION_STEPS[3]);

    if (policy.action !== "RESPOND") {
      const handoff = await this.handoffWithReferences(context, policy.analysis.reasonCodes, []);
      completed.push(KORAL_ORCHESTRATION_STEPS[10], KORAL_ORCHESTRATION_STEPS[11]);
      if (!handoff.transitioned && handoff.mayAutoReply) {
        return { kind: "WAITING", conversationId, reasonCodes: ["CONCURRENT_CHANGE"], completedSteps: completed };
      }
      return { kind: "HANDED_OFF", conversationId, reasonCodes: policy.analysis.reasonCodes, completedSteps: completed };
    }

    const outcome = await this.invokeAiGateway(context, policy);
    completed.push(KORAL_ORCHESTRATION_STEPS[4]);
    const gatewayReferences = gatewayReferencesOf(outcome);
    if (outcome.kind === "REJECTED") {
      const reasons = ["PROVIDER_UNAVAILABLE", outcome.reasonCode];
      const handoff = await this.handoffWithReferences(context, reasons, gatewayReferences);
      completed.push(KORAL_ORCHESTRATION_STEPS[10], KORAL_ORCHESTRATION_STEPS[11]);
      if (!handoff.transitioned && handoff.mayAutoReply) {
        return { kind: "WAITING", conversationId, reasonCodes: ["CONCURRENT_CHANGE"], completedSteps: completed };
      }
      return { kind: "HANDED_OFF", conversationId, reasonCodes: reasons, completedSteps: completed };
    }
    if (outcome.kind === "TOOL_REQUEST") {
      completed.push(KORAL_ORCHESTRATION_STEPS[5]);
      const reasons = ["UNEXPECTED_TOOL_REQUEST", "TOOL_GATEWAY_UNAVAILABLE"];
      const handoff = await this.handoffWithReferences(context, reasons, gatewayReferences);
      completed.push(KORAL_ORCHESTRATION_STEPS[10], KORAL_ORCHESTRATION_STEPS[11]);
      if (!handoff.transitioned && handoff.mayAutoReply) {
        return { kind: "WAITING", conversationId, reasonCodes: ["CONCURRENT_CHANGE"], completedSteps: completed };
      }
      return { kind: "HANDED_OFF", conversationId, reasonCodes: reasons, completedSteps: completed };
    }
    const validation = await this.validateOutboundResponse(context, outcome);
    completed.push(KORAL_ORCHESTRATION_STEPS[9]);
    if (!validation.valid || !validation.safeResponse) {
      const handoff = await this.handoffWithReferences(context, validation.violations, gatewayReferences);
      completed.push(KORAL_ORCHESTRATION_STEPS[10], KORAL_ORCHESTRATION_STEPS[11]);
      if (!handoff.transitioned && handoff.mayAutoReply) {
        return { kind: "WAITING", conversationId, reasonCodes: ["CONCURRENT_CHANGE"], completedSteps: completed };
      }
      return { kind: "HANDED_OFF", conversationId, reasonCodes: validation.violations, completedSteps: completed };
    }
    const committed = await this.conversations.commitKoralOutbound({
      conversationId,
      channel: context.channel,
      externalSessionId: context.externalSessionId,
      expectedVersion: context.conversationVersion,
      idempotencyKey: `web-ai:${context.sourceMessageId}`,
      correlationId: input.correlationId,
      contentType: "text/plain",
      body: validation.safeResponse,
      gatewayReferences,
    });
    completed.push(KORAL_ORCHESTRATION_STEPS[11]);
    if (!committed.committed) {
      return committed.mayAutoReply
        ? { kind: "WAITING", conversationId, reasonCodes: ["CONCURRENT_CHANGE"], completedSteps: completed }
        : { kind: "HANDED_OFF", conversationId, reasonCodes: ["CONCURRENT_HUMAN_OWNERSHIP"], completedSteps: completed };
    }
    return { kind: "RESPONDED", conversationId, outboundMessageId: committed.messageId, completedSteps: completed };
  }

  private async handoffWithReferences(
    context: SafeConversationContext,
    reasonCodes: readonly string[],
    gatewayReferences: readonly string[],
  ) {
    const result = await this.conversations.requestKoralHandoff({
      conversationId: context.conversationId,
      expectedVersion: context.conversationVersion,
      sourceMessageId: context.sourceMessageId,
      correlationId: context.gatewayContext.audit.correlationId,
      reasonCodes,
      gatewayReferences,
    });
    return {
      transitioned: result.transitioned,
      mayAutoReply: "mayAutoReply" in result && result.mayAutoReply,
    };
  }
}

function decision(
  analysis: OrchestrationAnalysis,
  action: OrchestrationDecision["action"],
  responsePolicyKeys: string[],
): OrchestrationDecision {
  return {
    version: KORAL_ORCHESTRATOR_CONTRACT_VERSION,
    agentProfileKey: AGENT_PROFILE_KEY,
    analysis,
    action,
    responsePolicyKeys,
  };
}

function sourceMessageBody(
  messages: SafeConversationContext["recentMessages"],
  sourceMessageId: string,
): string {
  const source = messages.find(({ id }) => id === sourceMessageId);
  if (!source || source.contentType !== "text/plain" || !source.body) {
    throw new BadRequestException("KORAL_TEXT_MESSAGE_REQUIRED");
  }
  return source.body.trim();
}

function gatewayReferencesOf(outcome: KoralInferenceOutcome): string[] {
  return outcome.gatewayCorrelationId ? [outcome.gatewayCorrelationId] : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
