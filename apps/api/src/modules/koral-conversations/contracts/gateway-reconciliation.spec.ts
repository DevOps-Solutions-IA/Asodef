import type {
  AiGateway,
  GatewayRequestContext,
  KnowledgeGateway,
  ToolGateway,
} from "@asodef/connect-contracts";
import {
  CanonicalKoralAiGatewayAdapter,
  CanonicalKoralKnowledgeGatewayAdapter,
  CanonicalKoralToolGatewayAdapter,
  PublishedModelProfileResolver,
  buildCanonicalGatewayRequestContext,
} from "../koral-gateway.adapters";
import {
  ModelRegistry,
  type ModelProfile,
} from "../../ai-gateway/model-registry";
import { KORAL_GATEWAY_ADAPTER_SEMANTICS } from "./gateway.contract";
import { KORAL_ORCHESTRATION_STEPS } from "./orchestrator.contract";
import type { ResolvedIdentityContext } from "./identity-resolution.contract";

const publishedProfile: ModelProfile = {
  id: "model-profile-crm",
  name: "Koral CRM assistant",
  primaryModel: "vendor/model-primary",
  fallbackModels: [],
  allowedProviders: ["openrouter"],
  purpose: "customer-support",
  maxInputTokens: 8_000,
  maxOutputTokens: 1_000,
  budgetPolicy: {
    currency: "USD",
    maxCostMicrosPerRequest: 20_000,
    maxCostMicrosPerDay: 1_000_000,
    failClosedWhenPricingUnknown: true,
  },
  toolCallingAllowed: true,
  structuredOutputRequired: false,
  dataClassificationPolicy: {
    allowed: ["PUBLIC", "INTERNAL", "PERSONAL"],
    denied: ["SENSITIVE", "HIGHLY_SENSITIVE"],
    requirePurpose: true,
    requireConsentFor: ["PERSONAL"],
    maximumExternalClassification: "PERSONAL",
  },
  enabled: true,
  policyApproved: true,
  status: "PUBLISHED",
  version: 1,
};

const authenticatedIdentity: ResolvedIdentityContext = {
  version: "1.0.0",
  identityId: "identity-1",
  portalUserId: "user-1",
  channelIdentities: [],
  assuranceLevel: "AUTHENTICATED",
  authenticationEvidence: {
    authenticated: true,
    mfaVerified: false,
    stepUpVerified: false,
  },
  consentState: {
    status: "GRANTED",
    purposeKeys: ["customer-support"],
  },
  verifiedAttributes: [],
};

const context: GatewayRequestContext = buildCanonicalGatewayRequestContext({
  identity: authenticatedIdentity,
  principalType: "KORAL",
  principalId: "koral",
  effectiveActorId: "user-1",
  permissions: ["koral.conversations.read"],
  correlationId: "correlation-1",
  conversationId: "conversation-1",
  purpose: "customer-support",
  piiPolicy: "MINIMIZE",
  dataClassification: "PERSONAL",
  deadlineAt: "2026-08-22T20:00:00.000Z",
});

describe("canonical Connect gateway reconciliation", () => {
  it("maps an agent profile key through an explicit published profile binding", async () => {
    const infer = jest
      .fn<ReturnType<AiGateway["infer"]>, Parameters<AiGateway["infer"]>>()
      .mockResolvedValue({
        ok: true,
        response: {
          version: "v1",
          provider: "openrouter",
          model: "vendor/model-primary",
          content: "Safe response",
          toolCalls: [],
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
            costMicros: 3,
          },
          correlationId: "correlation-1",
        },
      });
    const resolver = new PublishedModelProfileResolver(
      new ModelRegistry([publishedProfile]),
      [
        {
          agentProfileKey: "crm-assistant",
          modelProfileId: "model-profile-crm",
        },
      ],
    );
    const adapter = new CanonicalKoralAiGatewayAdapter({ infer }, resolver);

    await expect(
      adapter.infer(
        {
          agentProfileKey: "crm-assistant",
          messages: [{ role: "user", content: "hello" }],
        },
        context,
      ),
    ).resolves.toMatchObject({ kind: "ASSISTANT_RESPONSE" });
    expect(infer).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "v1",
        modelProfileId: "model-profile-crm",
      }),
      context,
    );
    expect(() => resolver.resolve("model-profile-crm")).toThrow(
      "AGENT_PROFILE_NOT_BOUND",
    );
  });

  it("rejects an unpublished bound model profile before gateway inference", () => {
    const resolver = new PublishedModelProfileResolver(
      new ModelRegistry([{ ...publishedProfile, status: "REVIEW" }]),
      [
        {
          agentProfileKey: "crm-assistant",
          modelProfileId: "model-profile-crm",
        },
      ],
    );
    expect(() => resolver.resolve("crm-assistant")).toThrow(
      "MODEL_PROFILE_NOT_AVAILABLE",
    );
  });

  it("adapts canonical tool and knowledge results without duplicate contracts", async () => {
    const invoke = jest
      .fn<
        ReturnType<ToolGateway["invoke"]>,
        Parameters<ToolGateway["invoke"]>
      >()
      .mockResolvedValue({
        ok: true,
        response: {
          version: "v1",
          data: { safe: true },
          meta: { correlationId: "correlation-1", replayed: false },
        },
      });
    const search = jest
      .fn<
        ReturnType<KnowledgeGateway["search"]>,
        Parameters<KnowledgeGateway["search"]>
      >()
      .mockResolvedValue({
        ok: true,
        response: {
          version: "v1",
          outcome: "SUFFICIENT_EVIDENCE",
          correlationId: "correlation-1",
          citations: [
            {
              publicationId: "publication-1",
              knowledgeItemId: "item-1",
              knowledgeVersionId: "version-1",
              knowledgeChunkId: "chunk-1",
              knowledgeSourceId: "source-1",
              title: "Approved",
              excerpt: "Approved excerpt",
              dataClassification: "INTERNAL",
              audience: "INTERNAL",
              language: "es",
              sourceReference: "https://asodef.com.co/conocimiento",
              sourceChecksumSha256:
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              score: 1,
            },
          ],
        },
      });
    await expect(
      new CanonicalKoralToolGatewayAdapter({ invoke }).invoke(
        {
          toolName: "crm.list_leads",
          toolVersion: "v1",
          input: {},
          confirmationGranted: false,
        },
        context,
      ),
    ).resolves.toMatchObject({ kind: "SUCCEEDED", replayed: false });
    await expect(
      new CanonicalKoralKnowledgeGatewayAdapter({ search }).search(
        {
          query: "approved",
          domainKeys: ["ASODEF_INSTITUCIONAL"],
          limit: 1,
        },
        context,
      ),
    ).resolves.toMatchObject({
      kind: "FOUND",
      outcome: "SUFFICIENT_EVIDENCE",
      passages: [{ classification: "INTERNAL", trace: { knowledgeItemId: "item-1" } }],
    });
  });

  it("preserves canonical context, absolute deadline and orchestration order", () => {
    expect(context).toMatchObject({
      version: "v1",
      identity: { identityLevel: "AUTHENTICATED", effectiveActorId: "user-1" },
      audit: {
        correlationId: "correlation-1",
        conversationId: "conversation-1",
      },
      policy: { consentVerified: true, dataClassification: "PERSONAL" },
      deadlineAt: "2026-08-22T20:00:00.000Z",
    });
    expect(KORAL_GATEWAY_ADAPTER_SEMANTICS.idempotency).toContain(
      "never retry",
    );
    expect(KORAL_ORCHESTRATION_STEPS).toEqual([
      "RECEIVE_NORMALIZED_MESSAGE",
      "RESOLVE_CONVERSATION",
      "BUILD_SAFE_CONTEXT",
      "EVALUATE_AI_POLICY",
      "INVOKE_KNOWLEDGE_GATEWAY",
      "GROUND_KNOWLEDGE",
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
