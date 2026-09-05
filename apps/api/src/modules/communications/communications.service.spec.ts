import type {
  CommunicationsSendRequest,
  GatewayRequestContext,
} from "@asodef/connect-contracts";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaService } from "../../database/prisma.service";
import {
  RateLimitDependencyUnavailableError,
  type RateLimiterService,
} from "../auth/rate-limiter.service";
import type { CommunicationChannelRegistry } from "./communication-channel.registry";
import type { CommunicationRecipientPolicyService } from "./communication-recipient-policy.service";
import { CommunicationsRuntimeError } from "./communications-runtime.error";
import { CommunicationsService } from "./communications.service";
import type { PublishedTemplateRenderer } from "./published-template.renderer";

describe("CommunicationsService reliability boundaries", () => {
  const findFirst = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    connectCommunication: { findFirst },
    $transaction: transaction,
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
    transaction.mockReset();
    jest.mocked(templates.render).mockClear();
    jest.mocked(channels.assertAvailable).mockReset();
    jest.mocked(channels.dispatch).mockReset();
    jest.mocked(recipientPolicy.evaluate).mockReset();
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

  it("rejects conflicting content for an existing idempotency key without side effects", async () => {
    findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: "QUEUED",
      requestHash: "different-request-hash",
      recipients: [{
        recipientIndex: 0,
        decision: "ALLOWED",
        decisionReason: "POLICY_ALLOWED",
      }],
    });

    await expect(service.send(request(), context())).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      retryable: false,
    });
    expect(checkAndIncrementStrict).not.toHaveBeenCalled();
    expect(recipientPolicy.evaluate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(channels.dispatch).not.toHaveBeenCalled();
  });

  it("rejects an unavailable transport before rendering or persistence", async () => {
    jest.mocked(channels.assertAvailable).mockImplementationOnce(() => {
      throw new CommunicationsRuntimeError("TRANSPORT_NOT_AVAILABLE", false);
    });

    await expect(service.send(request(), context())).rejects.toMatchObject({
      code: "TRANSPORT_NOT_AVAILABLE",
      retryable: false,
    });
    expect(templates.render).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
    expect(checkAndIncrementStrict).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("classifies an unavailable outbox provider as retryable without returning success", async () => {
    jest.mocked(recipientPolicy.evaluate).mockResolvedValue([{
      allowed: true,
      reasonCode: "POLICY_ALLOWED",
      consent: { allowed: true, reasonCode: "NOT_REQUIRED", consentRecordId: null },
      suppression: { suppressed: false, reasonCode: "NOT_SUPPRESSED" },
    }]);
    const tx = {
      connectCommunication: {
        create: jest.fn().mockResolvedValue({
          id: "11111111-1111-4111-8111-111111111111",
          recipients: [],
        }),
      },
    };
    transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    jest.mocked(channels.dispatch).mockRejectedValue(new Error("outbox unavailable"));

    await expect(service.send(request(), context())).rejects.toMatchObject({
      code: "DELIVERY_STORE_UNAVAILABLE",
      retryable: true,
    });
    expect(channels.dispatch).toHaveBeenCalledTimes(1);
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
  const reference = randomUUID();
  return {
    version: "v1",
    requestId: `request-${reference}`,
    idempotencyKey: `idempotency-${reference}`,
    channel: "EMAIL",
    purpose: "TRANSACTIONAL",
    dataClassification: "PERSONAL",
    consentRequirement: {
      basis: "TRANSACTIONAL_NECESSITY",
      purposeKey: null,
      consentRecordId: null,
    },
    template: { key: "crm_lead_welcome", version: 1 },
    recipients: [{ type: "TO", address: `person-${reference}@example.com` }],
    variables: { fullName: "Person", corporateEmail: "info@example.com" },
    testMode: false,
  };
}

function context(): GatewayRequestContext {
  const reference = randomUUID();
  return {
    version: "v1",
    identity: {
      principalType: "SYSTEM",
      principalId: `system-${reference}`,
      effectiveActorId: `actor-${reference}`,
      identityLevel: "MFA_VERIFIED",
      permissions: ["communications.send"],
    },
    audit: { correlationId: `correlation-${reference}` },
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
