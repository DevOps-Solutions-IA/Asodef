import {
  CONNECT_CONTRACT_VERSION,
  type AiGateway,
  type DataClassification,
  type GatewayPiiPolicy,
  type GatewayPrincipalType,
  type GatewayRequestContext,
  type KnowledgeGateway,
  type ToolGateway,
} from "@asodef/connect-contracts";
import { ModelRegistry, type ModelProfile } from "../ai-gateway/model-registry";
import {
  resolveCanonicalIdentityLevel,
  type ResolvedIdentityContext,
} from "./contracts/identity-resolution.contract";
import type {
  KoralAiGatewayAdapter,
  KoralInferenceOutcome,
  KoralInferenceRequest,
  KoralKnowledgeGatewayAdapter,
  KoralKnowledgeOutcome,
  KoralKnowledgeRequest,
  KoralToolGatewayAdapter,
  KoralToolOutcome,
  KoralToolRequest,
} from "./contracts/gateway.contract";

export interface AgentProfileModelProfileBinding {
  agentProfileKey: string;
  modelProfileId: string;
}

export interface KoralGatewayContextInput {
  identity: ResolvedIdentityContext;
  principalType: GatewayPrincipalType;
  principalId: string;
  effectiveActorId: string;
  permissions: readonly string[];
  correlationId: string;
  conversationId: string;
  requestId?: string;
  causationId?: string;
  purpose: string;
  piiPolicy: GatewayPiiPolicy;
  dataClassification: DataClassification;
  deadlineAt: string;
}

export interface KoralServiceGatewayContextInput {
  visitorIdentity: ResolvedIdentityContext;
  correlationId: string;
  conversationId: string;
  requestId?: string;
  causationId?: string;
  purpose: string;
  piiPolicy: GatewayPiiPolicy;
  dataClassification: DataClassification;
  deadlineAt: string;
}

const KORAL_SERVICE_PRINCIPAL = Object.freeze({
  principalType: "KORAL" as const,
  principalId: "service:koral-orchestrator",
  effectiveActorId: "service:koral-orchestrator",
  identityLevel: "AUTHENTICATED" as const,
  permissions: ["koral.ai.infer"] as const,
});

/** The gateway actor is a server-owned service principal. Visitor assurance
 * remains policy evidence only and is never elevated into gateway authority. */
export function buildKoralServiceGatewayRequestContext(
  input: KoralServiceGatewayContextInput,
): GatewayRequestContext {
  if (!Number.isFinite(Date.parse(input.deadlineAt))) {
    throw new Error("INVALID_GATEWAY_DEADLINE");
  }
  const consentVerified =
    input.visitorIdentity.consentState.status === "GRANTED"
    && input.visitorIdentity.consentState.purposeKeys.includes(input.purpose);
  return {
    version: CONNECT_CONTRACT_VERSION,
    identity: KORAL_SERVICE_PRINCIPAL,
    audit: {
      correlationId: input.correlationId,
      conversationId: input.conversationId,
      requestId: input.requestId,
      causationId: input.causationId,
    },
    policy: {
      purpose: input.purpose,
      consentPurposeKeys: input.visitorIdentity.consentState.purposeKeys,
      consentVerified,
      piiPolicy: input.piiPolicy,
      dataClassification: input.dataClassification,
    },
    deadlineAt: input.deadlineAt,
  };
}

export function buildCanonicalGatewayRequestContext(
  input: KoralGatewayContextInput,
): GatewayRequestContext {
  const identityLevel = resolveCanonicalIdentityLevel(input.identity);
  if (!identityLevel) throw new Error("IDENTITY_EVIDENCE_REQUIRED");
  if (!input.effectiveActorId.trim()) {
    throw new Error("EFFECTIVE_ACTOR_REQUIRED");
  }
  if (!Number.isFinite(Date.parse(input.deadlineAt))) {
    throw new Error("INVALID_GATEWAY_DEADLINE");
  }
  const consentVerified =
    input.identity.consentState.status === "GRANTED" &&
    input.identity.consentState.purposeKeys.includes(input.purpose);
  return {
    version: CONNECT_CONTRACT_VERSION,
    identity: {
      principalType: input.principalType,
      principalId: input.principalId,
      effectiveActorId: input.effectiveActorId,
      identityLevel,
      permissions: input.permissions,
    },
    audit: {
      correlationId: input.correlationId,
      conversationId: input.conversationId,
      requestId: input.requestId,
      causationId: input.causationId,
    },
    policy: {
      purpose: input.purpose,
      consentPurposeKeys: input.identity.consentState.purposeKeys,
      consentVerified,
      piiPolicy: input.piiPolicy,
      dataClassification: input.dataClassification,
    },
    deadlineAt: input.deadlineAt,
  };
}

/** Resolves a Koral routing key through an explicit binding and then requires
 * the latest PUBLISHED canonical model-profile version. */
export class PublishedModelProfileResolver {
  private readonly modelProfileIdsByAgentProfile: ReadonlyMap<string, string>;

  constructor(
    private readonly registry: ModelRegistry,
    bindings: readonly AgentProfileModelProfileBinding[],
  ) {
    const entries = bindings.map((binding) => {
      if (!binding.agentProfileKey.trim() || !binding.modelProfileId.trim()) {
        throw new Error("INVALID_AGENT_MODEL_PROFILE_BINDING");
      }
      return [binding.agentProfileKey, binding.modelProfileId] as const;
    });
    this.modelProfileIdsByAgentProfile = new Map(entries);
    if (this.modelProfileIdsByAgentProfile.size !== entries.length) {
      throw new Error("DUPLICATE_AGENT_PROFILE_KEY");
    }
  }

  resolve(agentProfileKey: string): ModelProfile {
    const modelProfileId =
      this.modelProfileIdsByAgentProfile.get(agentProfileKey);
    if (!modelProfileId) {
      throw new Error(`AGENT_PROFILE_NOT_BOUND:${agentProfileKey}`);
    }
    return this.registry.getPublished(modelProfileId);
  }
}

export class CanonicalKoralAiGatewayAdapter implements KoralAiGatewayAdapter {
  constructor(
    private readonly gateway: AiGateway,
    private readonly modelProfiles: PublishedModelProfileResolver,
  ) {}

  async infer(
    request: KoralInferenceRequest,
    context: GatewayRequestContext,
  ): Promise<KoralInferenceOutcome> {
    const profile = this.modelProfiles.resolve(request.agentProfileKey);
    const result = await this.gateway.infer(
      {
        version: CONNECT_CONTRACT_VERSION,
        modelProfileId: profile.id,
        task: request.task,
        messages: request.messages,
        maxOutputTokens: request.maxOutputTokens,
        outputSchema: request.responseSchema,
        tools: request.availableTools,
        timeout: request.timeout,
      },
      context,
    );
    if (!result.ok) {
      return {
        kind: "REJECTED",
        reasonCode: result.error.code,
        retryable: result.error.retryable,
        gatewayCorrelationId: result.error.correlationId,
      };
    }
    if (result.response.toolCalls.length > 0) {
      return {
        kind: "TOOL_REQUEST",
        requests: result.response.toolCalls.map((call) => ({
          callId: call.id,
          toolName: call.name,
          input: call.arguments,
        })),
        gatewayCorrelationId: result.response.correlationId,
      };
    }
    return {
      kind: "ASSISTANT_RESPONSE",
      content: result.response.content,
      structuredOutput: result.response.structuredOutput,
      gatewayCorrelationId: result.response.correlationId,
    };
  }
}

export class CanonicalKoralToolGatewayAdapter
  implements KoralToolGatewayAdapter
{
  constructor(private readonly gateway: ToolGateway) {}

  async invoke(
    request: KoralToolRequest,
    context: GatewayRequestContext,
  ): Promise<KoralToolOutcome> {
    const result = await this.gateway.invoke(
      { version: CONNECT_CONTRACT_VERSION, ...request },
      context,
    );
    if (!result.ok) {
      return {
        kind: "REJECTED",
        reasonCode: result.error.code,
        retryable: result.error.retryable,
        correlationId: result.error.correlationId,
      };
    }
    return {
      kind: "SUCCEEDED",
      output: result.response.data,
      auditReference: result.response.meta.auditEventId,
      replayed: result.response.meta.replayed,
      correlationId: result.response.meta.correlationId,
    };
  }
}

export class CanonicalKoralKnowledgeGatewayAdapter
  implements KoralKnowledgeGatewayAdapter
{
  constructor(private readonly gateway: KnowledgeGateway) {}

  async search(
    request: KoralKnowledgeRequest,
    context: GatewayRequestContext,
  ): Promise<KoralKnowledgeOutcome> {
    const result = await this.gateway.search(
      { version: CONNECT_CONTRACT_VERSION, ...request },
      context,
    );
    if (!result.ok) {
      return {
        kind: "REJECTED",
        reasonCode: result.error.code,
        retryable: result.error.retryable,
        correlationId: result.error.correlationId,
      };
    }
    return {
      kind: "FOUND",
      outcome: result.response.outcome,
      passages: result.response.citations.map((citation) => ({
        reference: `${citation.publicationId}:${citation.knowledgeVersionId}`,
        content: citation.excerpt,
        classification: citation.dataClassification,
        score: citation.score,
        trace: {
          publicationSnapshotId: citation.publicationId,
          knowledgeItemId: citation.knowledgeItemId,
          knowledgeVersionId: citation.knowledgeVersionId,
          knowledgeChunkId: citation.knowledgeChunkId,
          knowledgeSourceId: citation.knowledgeSourceId,
          sourceReference: citation.sourceReference,
          sourceChecksumSha256: citation.sourceChecksumSha256,
        },
      })),
      correlationId: result.response.correlationId,
    };
  }
}
