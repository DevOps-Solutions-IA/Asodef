import { ConversationChannel, ConversationStatus } from "@prisma/client";
import { MODULE_METADATA } from "@nestjs/common/constants";
import type { ResolvedIdentityContext } from "./contracts/identity-resolution.contract";
import { KORAL_ORCHESTRATION_PIPELINE } from "./contracts/orchestrator.contract";
import { GovernedKoralOrchestrationPipeline } from "./koral-orchestration.pipeline";
import { KoralConversationsModule } from "./koral-conversations.module";

const deadlineAt = "2099-08-24T20:00:00.000Z";

function identity(
  assuranceLevel: ResolvedIdentityContext["assuranceLevel"] = "ANONYMOUS",
  consent: ResolvedIdentityContext["consentState"]["status"] = "UNKNOWN",
): ResolvedIdentityContext {
  const authenticated = ["AUTHENTICATED", "MFA_VERIFIED", "STEP_UP_VERIFIED"].includes(assuranceLevel);
  return {
    version: "1.0.0",
    identityId: "visitor-identity",
    channelIdentities: [{ channel: ConversationChannel.WEB, externalIdentityId: "visitor", verified: authenticated }],
    assuranceLevel,
    authenticationEvidence: {
      authenticated,
      mfaVerified: assuranceLevel === "MFA_VERIFIED" || assuranceLevel === "STEP_UP_VERIFIED",
      stepUpVerified: assuranceLevel === "STEP_UP_VERIFIED",
    },
    consentState: {
      status: consent,
      purposeKeys: consent === "GRANTED" ? ["crm-assistance"] : [],
    },
    verifiedAttributes: [],
  };
}

function createHarness(
  body: string,
  gatewayOutcome: unknown,
  knowledgeOutcome: unknown = {
    kind: "FOUND",
    outcome: "NO_EVIDENCE",
    passages: [],
    correlationId: "knowledge-1",
  },
) {
  const snapshot = {
    conversationId: "conversation-1",
    conversationVersion: 4,
    status: ConversationStatus.AI_ACTIVE,
    sourceMessageId: "message-1",
    channel: ConversationChannel.WEB,
    externalSessionId: "web-session-1",
    participantSummary: [{ kind: "EXTERNAL", channel: ConversationChannel.WEB }],
    recentMessages: [{ id: "message-1", direction: "INBOUND", contentType: "text/plain", body, occurredAt: new Date() }],
    tags: [],
  };
  const conversations = {
    buildKoralContextSnapshot: jest.fn().mockResolvedValue(snapshot),
    requestKoralHandoff: jest.fn().mockResolvedValue({ transitioned: true, replayed: false }),
    commitKoralOutbound: jest.fn().mockResolvedValue({ committed: true, replayed: false, messageId: "outbound-1" }),
  };
  const gateway = { infer: jest.fn().mockResolvedValue(gatewayOutcome) };
  const knowledgeGateway = {
    search: jest.fn().mockResolvedValue(knowledgeOutcome),
  };
  const pipeline = new GovernedKoralOrchestrationPipeline(
    conversations as never,
    gateway as never,
    knowledgeGateway as never,
    { get: jest.fn().mockReturnValue(true) } as never,
  );
  return { pipeline, conversations, gateway, knowledgeGateway };
}

function runInput(effectiveIdentity = identity()) {
  return {
    version: "1.0.0" as const,
    normalizedMessageId: "message-1",
    correlationId: "correlation-1",
    deadlineAt,
    effectiveIdentity,
  };
}

describe("GovernedKoralOrchestrationPipeline", () => {
  it("is registered as the concrete Nest orchestration provider", () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, KoralConversationsModule) as Array<unknown>;
    expect(providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: KORAL_ORCHESTRATION_PIPELINE }),
    ]));
  });

  it("projects provider-disabled state while preserving a deterministic handoff result", async () => {
    const { conversations, gateway, knowledgeGateway } = createHarness("Hola", {});
    gateway.infer.mockResolvedValueOnce({
      kind: "REJECTED",
      reasonCode: "MODEL_NOT_AVAILABLE",
      retryable: false,
      gatewayCorrelationId: "gateway-disabled",
    });
    const pipeline = new GovernedKoralOrchestrationPipeline(
      conversations as never,
      gateway as never,
      knowledgeGateway as never,
      { get: jest.fn().mockReturnValue(false) } as never,
    );
    expect(pipeline.available).toBe(false);
    await expect(pipeline.run(runInput())).resolves.toMatchObject({
      kind: "HANDED_OFF",
      reasonCodes: ["PROVIDER_UNAVAILABLE", "MODEL_NOT_AVAILABLE"],
    });
  });

  it("hands arbitrary anonymous content to humans without external inference", async () => {
    const { pipeline, conversations, gateway, knowledgeGateway } = createHarness("Mi número de contrato es 123456", {});
    await expect(pipeline.run(runInput())).resolves.toMatchObject({
      kind: "HANDED_OFF",
      reasonCodes: ["PERSONAL_OR_UNSUPPORTED_REQUEST"],
    });
    expect(gateway.infer).not.toHaveBeenCalled();
    expect(knowledgeGateway.search).not.toHaveBeenCalled();
    expect(conversations.requestKoralHandoff).toHaveBeenCalledWith(expect.objectContaining({
      reasonCodes: ["PERSONAL_OR_UNSUPPORTED_REQUEST"],
      correlationId: "correlation-1",
    }));
  });

  it("retrieves published evidence before inference and preserves its trace", async () => {
    const { pipeline, conversations, gateway, knowledgeGateway } = createHarness(
      "¿Cuáles son los beneficios de ASODEF?",
      {
        kind: "ASSISTANT_RESPONSE",
        content: "ignored",
        structuredOutput: { response: "ASODEF ofrece beneficios publicados." },
        gatewayCorrelationId: "ai-grounded",
      },
      {
        kind: "FOUND",
        outcome: "SUFFICIENT_EVIDENCE",
        passages: [
          {
            reference: "publication-1:version-1",
            content: "ASODEF ofrece beneficios publicados.",
            classification: "PUBLIC",
            score: 1,
            trace: {
              publicationSnapshotId: "publication-1",
              knowledgeItemId: "item-1",
              knowledgeVersionId: "version-1",
              knowledgeChunkId: "chunk-1",
              knowledgeSourceId: "source-1",
              sourceReference: "manual://beneficios",
              sourceChecksumSha256: "a".repeat(64),
            },
          },
        ],
        correlationId: "knowledge-grounded",
      },
    );

    await expect(pipeline.run(runInput())).resolves.toMatchObject({
      kind: "RESPONDED",
    });
    expect(knowledgeGateway.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: "¿Cuáles son los beneficios de ASODEF?" }),
      expect.objectContaining({
        identity: expect.objectContaining({
          principalType: "KORAL",
          permissions: expect.arrayContaining(["knowledge.read"]),
        }),
        effectiveScope: {
          authority: "SERVER_SIDE",
          tenantKey: "ASODEF",
          audience: "PUBLIC",
          organizationIds: [],
          maximumDataClassification: "PUBLIC",
        },
      }),
    );
    expect(gateway.infer).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("published evidence"),
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining("ASODEF ofrece beneficios publicados") }),
        ]),
      }),
      expect.any(Object),
    );
    expect(conversations.commitKoralOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayReferences: [
          "knowledge-evidence:v1:publication-1:chunk-1:ai:ai-grounded",
        ],
      }),
    );
  });

  it.each([
    { returned: 1, persisted: 1 },
    { returned: 2, persisted: 2 },
    { returned: 4, persisted: 4 },
    { returned: 6, persisted: 4 },
  ])(
    "bounds $returned ranked evidence passages to $persisted canonical references",
    async ({ returned, persisted }) => {
      const passages = Array.from({ length: returned }, (_, index) => ({
        reference: `publication-${index}:version-${index}`,
        content: `Beneficio ASODEF publicado ${index}`,
        classification: "PUBLIC",
        score: 1 - index / 100,
        trace: {
          publicationSnapshotId: `publication-${index}`,
          knowledgeItemId: `item-${index}`,
          knowledgeVersionId: `version-${index}`,
          knowledgeChunkId: `chunk-${index}`,
          knowledgeSourceId: `source-${index}`,
          sourceReference: `manual://beneficio-${index}`,
          sourceChecksumSha256: String(index).padStart(64, "0"),
        },
      }));
      const { pipeline, conversations } = createHarness(
        "¿Cuáles son los beneficios de ASODEF?",
        {
          kind: "ASSISTANT_RESPONSE",
          content: "ignored",
          structuredOutput: { response: "Respuesta respaldada." },
          gatewayCorrelationId: "ai-cardinality",
        },
        {
          kind: "FOUND",
          outcome: "SUFFICIENT_EVIDENCE",
          passages,
          correlationId: "knowledge-cardinality",
        },
      );

      await expect(pipeline.run(runInput())).resolves.toMatchObject({
        kind: "RESPONDED",
      });
      const commit = conversations.commitKoralOutbound.mock.calls[0]![0];
      expect(commit.gatewayReferences).toHaveLength(persisted);
      expect(commit.gatewayReferences).toEqual(
        passages.slice(0, persisted).map(
          ({ trace }) =>
            `knowledge-evidence:v1:${trace.publicationSnapshotId}:${trace.knowledgeChunkId}:ai:ai-cardinality`,
        ),
      );
    },
  );

  it.each(["NO_EVIDENCE", "SOURCE_CONFLICT"] as const)(
    "fails closed for grounded outcome %s without invoking AI",
    async (outcome) => {
      const { pipeline, conversations, gateway } = createHarness(
        "¿Cuáles son los beneficios de ASODEF?",
        {},
        {
          kind: "FOUND",
          outcome,
          passages: outcome === "SOURCE_CONFLICT" ? [
            {
              reference: "publication-1:version-1",
              content: "Fuentes en conflicto",
              classification: "PUBLIC",
              trace: {
                publicationSnapshotId: "publication-1",
                knowledgeItemId: "item-1",
                knowledgeVersionId: "version-1",
                knowledgeChunkId: "chunk-1",
                knowledgeSourceId: "source-1",
                sourceReference: "manual://conflict",
                sourceChecksumSha256: "b".repeat(64),
              },
            },
          ] : [],
          correlationId: `knowledge-${outcome.toLowerCase()}`,
        },
      );
      await expect(pipeline.run(runInput())).resolves.toMatchObject({
        kind: "HANDED_OFF",
        reasonCodes: [outcome],
      });
      expect(gateway.infer).not.toHaveBeenCalled();
      expect(conversations.requestKoralHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ reasonCodes: [outcome] }),
      );
    },
  );

  it("fails closed when the Knowledge provider throws", async () => {
    const { pipeline, conversations, gateway, knowledgeGateway } = createHarness(
      "¿Cuáles son los beneficios de ASODEF?",
      {},
    );
    knowledgeGateway.search.mockRejectedValueOnce(new Error("database detail"));
    await expect(pipeline.run(runInput())).resolves.toMatchObject({
      kind: "HANDED_OFF",
      reasonCodes: ["KNOWLEDGE_PROVIDER_UNAVAILABLE"],
    });
    expect(gateway.infer).not.toHaveBeenCalled();
    expect(conversations.requestKoralHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCodes: ["KNOWLEDGE_PROVIDER_UNAVAILABLE"],
        gatewayReferences: [],
      }),
    );
  });

  it("does not treat visitor assurance as the authenticated gateway actor", async () => {
    const { pipeline, gateway } = createHarness("Hola", {
      kind: "REJECTED",
      reasonCode: "MODEL_NOT_AVAILABLE",
      retryable: false,
      gatewayCorrelationId: "gateway-1",
    });
    await expect(pipeline.run(runInput())).resolves.toMatchObject({
      kind: "HANDED_OFF",
      reasonCodes: ["PROVIDER_UNAVAILABLE", "MODEL_NOT_AVAILABLE"],
    });
    expect(gateway.infer).toHaveBeenCalledWith(
      expect.objectContaining({ availableTools: [] }),
      expect.objectContaining({
        identity: expect.objectContaining({
          principalType: "KORAL",
          principalId: "service:koral-orchestrator",
          effectiveActorId: "service:koral-orchestrator",
          identityLevel: "AUTHENTICATED",
        }),
        policy: expect.objectContaining({ dataClassification: "PUBLIC", consentVerified: false }),
      }),
    );
  });

  it("fails closed when authenticated visitor consent is unresolved", async () => {
    const { pipeline, gateway } = createHarness("Hola", {});
    await expect(pipeline.run(runInput(identity("AUTHENTICATED")))).resolves.toMatchObject({
      kind: "HANDED_OFF",
      reasonCodes: ["CONSENT_NOT_GRANTED"],
    });
    expect(gateway.infer).not.toHaveBeenCalled();
  });

  it("commits a validated Web response with CAS and audit references", async () => {
    const { pipeline, conversations } = createHarness("Hola", {
      kind: "ASSISTANT_RESPONSE",
      content: "Hola",
      structuredOutput: { response: "¡Hola! ¿En qué puedo ayudarte?" },
      gatewayCorrelationId: "gateway-success",
    });
    await expect(pipeline.run(runInput())).resolves.toMatchObject({
      kind: "RESPONDED",
      outboundMessageId: "outbound-1",
    });
    expect(conversations.commitKoralOutbound).toHaveBeenCalledWith(expect.objectContaining({
      expectedVersion: 4,
      gatewayReferences: ["gateway-success"],
      body: "¡Hola! ¿En qué puedo ayudarte?",
    }));
  });

  it("rejects unexpected tool calls and never invokes a tool provider", async () => {
    const { pipeline, conversations } = createHarness("Hola", {
      kind: "TOOL_REQUEST",
      requests: [{ callId: "call-1", toolName: "unsafe.tool", input: {} }],
      gatewayCorrelationId: "gateway-tool",
    });
    const toolSpy = jest.spyOn(pipeline, "invokeToolGateway");
    await expect(pipeline.run(runInput())).resolves.toMatchObject({
      kind: "HANDED_OFF",
      reasonCodes: ["UNEXPECTED_TOOL_REQUEST", "TOOL_GATEWAY_UNAVAILABLE"],
    });
    expect(toolSpy).not.toHaveBeenCalled();
    expect(conversations.requestKoralHandoff).toHaveBeenCalledWith(expect.objectContaining({
      gatewayReferences: ["gateway-tool"],
    }));
  });

  it("preserves uncertain thrown provider failures for UNKNOWN_RESULT handling", async () => {
    const { pipeline, gateway, conversations } = createHarness("Hola", {});
    gateway.infer.mockRejectedValueOnce(new Error("uncertain transport result"));
    await expect(pipeline.run(runInput())).rejects.toThrow("uncertain transport result");
    expect(conversations.requestKoralHandoff).not.toHaveBeenCalled();
    expect(conversations.commitKoralOutbound).not.toHaveBeenCalled();
  });

  it("does not commit stale output when concurrent human ownership wins", async () => {
    const { pipeline, conversations } = createHarness("Hola", {
      kind: "ASSISTANT_RESPONSE",
      content: "Hola",
      structuredOutput: { response: "Hola" },
      gatewayCorrelationId: "gateway-stale",
    });
    conversations.commitKoralOutbound.mockResolvedValueOnce({
      committed: false,
      replayed: false,
      reason: "CONVERSATION_NOT_AI_ACTIVE",
    });
    await expect(pipeline.run(runInput())).resolves.toMatchObject({
      kind: "HANDED_OFF",
      reasonCodes: ["CONCURRENT_HUMAN_OWNERSHIP"],
    });
  });

  it("reports WAITING instead of claiming handoff when a concurrent AI-active change wins", async () => {
    const { pipeline, conversations, gateway } = createHarness("Necesito información sobre mi contrato", {});
    conversations.requestKoralHandoff.mockResolvedValueOnce({
      transitioned: false,
      replayed: false,
      reason: "CONVERSATION_NOT_AI_ACTIVE",
      currentStatus: ConversationStatus.AI_ACTIVE,
      mayAutoReply: true,
    });
    await expect(pipeline.run(runInput())).resolves.toMatchObject({
      kind: "WAITING",
      reasonCodes: ["CONCURRENT_CHANGE"],
    });
    expect(gateway.infer).not.toHaveBeenCalled();
  });
});
