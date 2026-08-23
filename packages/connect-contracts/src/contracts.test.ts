import { describe, expect, it } from "vitest";
import {
  AI_GATEWAY_CONTRACT,
  KNOWLEDGE_GATEWAY_CONTRACT,
  KNOWLEDGE_STATUSES,
  TOOL_GATEWAY_CONTRACT,
  TOOL_STATUSES,
  resolveGatewayIdentityLevel,
} from "./index";

describe("canonical ASODEF Connect contracts", () => {
  it("keeps the executable tool lifecycle closed", () => {
    expect(TOOL_STATUSES).toEqual([
      "PUBLISHED",
      "REVIEW",
      "DISABLED",
      "RETIRED",
    ]);
  });

  it("keeps knowledge approval distinct from publication", () => {
    expect(KNOWLEDGE_STATUSES).toEqual([
      "DRAFT",
      "REVIEW",
      "APPROVED",
      "PUBLISHED",
      "RETIRED",
    ]);
  });

  it("publishes structured errors and policy semantics for every gateway", () => {
    expect(AI_GATEWAY_CONTRACT.errors).toContain("TIMEOUT");
    expect(TOOL_GATEWAY_CONTRACT.errors).toContain("TOOL_NOT_PUBLISHED");
    expect(KNOWLEDGE_GATEWAY_CONTRACT.errors).toContain(
      "KNOWLEDGE_NOT_PUBLISHED",
    );
    expect(
      JSON.stringify([
        AI_GATEWAY_CONTRACT,
        TOOL_GATEWAY_CONTRACT,
        KNOWLEDGE_GATEWAY_CONTRACT,
      ]),
    ).not.toMatch(/OPENROUTER_API_KEY|credential|prisma|sql/i);
  });

  it("maps identity only from explicit authentication evidence", () => {
    expect(
      resolveGatewayIdentityLevel({
        authenticated: false,
        mfaVerified: true,
        stepUpVerified: true,
      }),
    ).toBeNull();
    expect(
      resolveGatewayIdentityLevel({
        authenticated: true,
        mfaVerified: false,
        stepUpVerified: false,
      }),
    ).toBe("AUTHENTICATED");
    expect(
      resolveGatewayIdentityLevel({
        authenticated: true,
        mfaVerified: true,
        stepUpVerified: false,
      }),
    ).toBe("MFA_VERIFIED");
    expect(
      resolveGatewayIdentityLevel({
        authenticated: true,
        mfaVerified: true,
        stepUpVerified: true,
      }),
    ).toBe("STEP_UP_VERIFIED");
  });
});
