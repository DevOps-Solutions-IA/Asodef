import type {
  CommunicationsSendRequest,
  GatewayRequestContext,
} from "@asodef/connect-contracts";
import { createHash } from "node:crypto";
import type { PrismaService } from "../../database/prisma.service";
import {
  RateLimitDependencyUnavailableError,
  type RateLimiterService,
} from "../auth/rate-limiter.service";
import type { CommunicationChannelRegistry } from "./communication-channel.registry";
import type { CommunicationRecipientPolicyService } from "./communication-recipient-policy.service";
import { CommunicationsService } from "./communications.service";
import type { PublishedTemplateRenderer } from "./published-template.renderer";

describe("CommunicationsService reliability boundaries", () => {
  const findFirst = jest.fn();
  const prisma = {
    connectCommunication: { findFirst },
  } as unknown as PrismaService;
  const templates = {
    render: jest.fn().mockReturnValue({
      subject: "Subject",
      textBody: "Body",
      templateReference: "crm_lead_welcome@v1",
    }),
  } as unknown as PublishedTemplateRenderer;
  const channels = {
    assertAvailable: jest.fn(),
    dispatch: jest.fn(),
  } as unknown as CommunicationChannelRegistry;
  const recipientPolicy = {
    evaluate: jest.fn(),
  } as unknown as CommunicationRecipientPolicyService;
  const checkAndIncrementStrict = jest.fn();
  const rateLimiter = { checkAndIncrementStrict } as unknown as RateLimiterService;
  const service = new CommunicationsService(
    prisma,
    templates,
    channels,
    recipientPolicy,
    rateLimiter,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findFirst.mockResolvedValue(null);
    checkAndIncrementStrict.mockResolvedValue({
      limited: false,
      remaining: 99,
      retryAfterSeconds: 60,
    });
  });

  it("returns the original communication without rate counting or dispatch on idempotent replay", async () => {
    const input = request();
    const gateway = context();
    findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: "QUEUED",
      requestHash: hashCanonical({ request: input, audit: gateway.audit }),
      recipients: [{
        recipientIndex: 0,
        decision: "ALLOWED",
        decisionReason: "POLICY_ALLOWED",
      }],
    });

    await expect(service.send(input, gateway)).resolves.toMatchObject({
      communicationId: "11111111-1111-4111-8111-111111111111",
      disposition: "DUPLICATE",
      replayed: true,
    });
    expect(checkAndIncrementStrict).not.toHaveBeenCalled();
    expect(recipientPolicy.evaluate).not.toHaveBeenCalled();
    expect(channels.dispatch).not.toHaveBeenCalled();
  });

  it("fails closed when the actor rate limit is exhausted", async () => {
    checkAndIncrementStrict.mockResolvedValue({
      limited: true,
      remaining: 0,
      retryAfterSeconds: 60,
    });

    await expect(service.send(request(), context())).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
    });
    expect(recipientPolicy.evaluate).not.toHaveBeenCalled();
    expect(channels.dispatch).not.toHaveBeenCalled();
  });

  it("fails closed when the strict rate-limit dependency is unavailable", async () => {
    checkAndIncrementStrict.mockRejectedValue(new RateLimitDependencyUnavailableError());

    await expect(service.send(request(), context())).rejects.toMatchObject({
      code: "RATE_LIMIT_DEPENDENCY_UNAVAILABLE",
      retryable: true,
    });
    expect(recipientPolicy.evaluate).not.toHaveBeenCalled();
    expect(channels.dispatch).not.toHaveBeenCalled();
  });
});

function request(): CommunicationsSendRequest {
  return {
    version: "v1",
    requestId: "request-communications-service",
    idempotencyKey: "idempotency-communications-service",
    channel: "EMAIL",
    purpose: "TRANSACTIONAL",
    dataClassification: "PERSONAL",
    consentRequirement: {
      basis: "TRANSACTIONAL_NECESSITY",
      purposeKey: null,
      consentRecordId: null,
    },
    template: { key: "crm_lead_welcome", version: 1 },
    recipients: [{ type: "TO", address: "person@example.com" }],
    variables: { fullName: "Person", corporateEmail: "info@example.com" },
    testMode: false,
  };
}

function context(): GatewayRequestContext {
  return {
    version: "v1",
    identity: {
      principalType: "SYSTEM",
      principalId: "system",
      effectiveActorId: "actor",
      identityLevel: "MFA_VERIFIED",
      permissions: ["communications.send"],
    },
    audit: { correlationId: "correlation" },
    policy: {
      purpose: "transactional",
      consentPurposeKeys: [],
      consentVerified: false,
      piiPolicy: "MINIMIZE",
      dataClassification: "PERSONAL",
    },
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}
