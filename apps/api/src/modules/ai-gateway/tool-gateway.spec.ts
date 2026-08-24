import { CRM_TOOL_CONTRACTS } from "../crm/ai/crm-tool-contracts";
import { TOOL_DOMAIN_DEPENDENCIES, TOOL_GATEWAY_CATALOG } from "./tool-catalog";
import { ToolGatewayPolicy } from "./tool-gateway.policy";
import { ToolRegistry } from "./tool-registry";

describe("Tool Gateway contracts", () => {
  it("publishes unique governed tools backed only by brownfield application services", () => {
    const names = TOOL_GATEWAY_CATALOG.map(
      (tool) => `${tool.name}@${tool.version}`,
    );
    expect(new Set(names).size).toBe(names.length);
    expect(TOOL_GATEWAY_CATALOG).toEqual(
      expect.arrayContaining(Object.values(CRM_TOOL_CONTRACTS)),
    );
    for (const tool of TOOL_GATEWAY_CATALOG) {
      expect(tool).toEqual(
        expect.objectContaining({
          version: "v1",
          inputSchema: expect.any(Object),
          outputSchema: expect.any(Object),
          errors: expect.any(Array),
          permission: expect.any(String),
          audit: expect.any(Object),
          rateLimit: expect.objectContaining({
            scope: "ACTOR_TOOL",
            failClosed: true,
          }),
          dataClassification: expect.any(String),
          status: expect.stringMatching(/^(PUBLISHED|REVIEW)$/),
          execution: expect.objectContaining({
            directDataAccess: false,
            ownershipAndTenantScope: "APPLICATION_SERVICE_ENFORCED",
          }),
        }),
      );
      expect(JSON.stringify(tool)).not.toMatch(
        /OPENROUTER_API_KEY|SELECT\s|prisma\.|firebird/i,
      );
    }
    expect(
      TOOL_GATEWAY_CATALOG.filter((tool) => tool.status === "REVIEW")
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(["get_lead", "send_communication", "update_lead"]);
  });

  it("keeps Plans blocked and communications governed but not published", () => {
    expect(TOOL_DOMAIN_DEPENDENCIES).toEqual([
      expect.objectContaining({ domain: "PLANS", status: "BLOCKED" }),
    ]);
    expect(TOOL_GATEWAY_CATALOG.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["send_communication"]),
    );
    expect(TOOL_GATEWAY_CATALOG.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining(["get_plan"]),
    );
  });

  it("exposes only PUBLISHED versions for execution", () => {
    const registry = new ToolRegistry(TOOL_GATEWAY_CATALOG);
    expect(
      registry
        .list("REVIEW")
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(["get_lead", "send_communication", "update_lead"]);
    expect(() => registry.getPublished("get_lead", "v1")).toThrow(
      "TOOL_NOT_PUBLISHED:get_lead@v1:REVIEW",
    );
    expect(() => registry.getPublished("send_communication", "v1")).toThrow(
      "TOOL_NOT_PUBLISHED:send_communication@v1:REVIEW",
    );
    expect(registry.getPublished("search_leads", "v1").status).toBe(
      "PUBLISHED",
    );
  });

  it("fails closed on permission, step-up, consent, confirmation and idempotency", () => {
    const policy = new ToolGatewayPolicy();
    const baseContext = {
      version: "v1" as const,
      identity: {
        principalType: "KORAL" as const,
        principalId: "koral",
        effectiveActorId: "actor-1",
        permissions: ["crm.manage"],
        identityLevel: "MFA_VERIFIED" as const,
      },
      audit: {
        correlationId: "correlation-1",
        conversationId: "conversation-1",
      },
      policy: {
        purpose: "crm-assistance",
        consentPurposeKeys: ["crm-assistance"],
        piiPolicy: "MINIMIZE" as const,
        dataClassification: "PERSONAL" as const,
        consentVerified: true,
      },
      deadlineAt: "2026-08-22T20:00:00.000Z",
      confirmationGranted: true,
      rateLimitAllowed: true,
      idempotencyKey: "1234567890123456",
    };
    expect(
      policy.evaluate(CRM_TOOL_CONTRACTS.update_opportunity_stage, baseContext),
    ).toEqual({
      allowed: true,
      reason: "ALLOWED",
    });
    expect(
      policy.evaluate(CRM_TOOL_CONTRACTS.update_opportunity_stage, {
        ...baseContext,
        identity: { ...baseContext.identity, permissions: [] },
      }).reason,
    ).toBe("PERMISSION_DENIED");
    expect(
      policy.evaluate(CRM_TOOL_CONTRACTS.update_opportunity_stage, {
        ...baseContext,
        rateLimitAllowed: false,
      }).reason,
    ).toBe("RATE_LIMITED");
    expect(
      policy.evaluate(CRM_TOOL_CONTRACTS.update_opportunity_stage, {
        ...baseContext,
        identity: { ...baseContext.identity, identityLevel: "AUTHENTICATED" },
      }).reason,
    ).toBe("IDENTITY_LEVEL_INSUFFICIENT");
    expect(
      policy.evaluate(CRM_TOOL_CONTRACTS.update_opportunity_stage, {
        ...baseContext,
        confirmationGranted: false,
      }).reason,
    ).toBe("CONFIRMATION_REQUIRED");
    expect(
      policy.evaluate(CRM_TOOL_CONTRACTS.update_opportunity_stage, {
        ...baseContext,
        idempotencyKey: undefined,
      }).reason,
    ).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const consentTool = TOOL_GATEWAY_CATALOG.find(
      (tool) => tool.name === "get_consent_record",
    );
    expect(consentTool).toBeDefined();
    expect(
      policy.evaluate(consentTool!, {
        ...baseContext,
        identity: {
          ...baseContext.identity,
          permissions: ["data.manage"],
          identityLevel: "STEP_UP_VERIFIED",
        },
        policy: { ...baseContext.policy, consentVerified: false },
      }).reason,
    ).toBe("CONSENT_REQUIRED");
  });
});
