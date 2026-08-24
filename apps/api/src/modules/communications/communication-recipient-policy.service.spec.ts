import type {
  CommunicationsSendRequest,
  GatewayRequestContext,
} from "@asodef/connect-contracts";
import type { PrismaService } from "../../database/prisma.service";
import { CommunicationRecipientPolicyService } from "./communication-recipient-policy.service";

describe("CommunicationRecipientPolicyService", () => {
  const consentFindFirst = jest.fn();
  const suppressionFindFirst = jest.fn();
  const prisma = {
    consentRecord: { findFirst: consentFindFirst },
    suppressionListEntry: { findFirst: suppressionFindFirst },
  } as unknown as PrismaService;
  const policy = new CommunicationRecipientPolicyService(prisma);

  beforeEach(() => {
    consentFindFirst.mockReset();
    suppressionFindFirst.mockReset().mockResolvedValue(null);
  });

  it("records suppression as a terminal recipient policy decision", async () => {
    suppressionFindFirst.mockResolvedValue({ id: "suppression-id" });

    await expect(policy.evaluate(request(), context())).resolves.toEqual([
      {
        allowed: false,
        reasonCode: "SUPPRESSION_LIST",
        consent: { allowed: true, reasonCode: "NOT_REQUIRED", consentRecordId: null },
        suppression: { suppressed: true, reasonCode: "SUPPRESSION_LIST" },
      },
    ]);
    expect(suppressionFindFirst).toHaveBeenCalledWith({
      where: {
        channel: "email",
        recipient: { equals: "Person@Example.com", mode: "insensitive" },
      },
      select: { id: true },
    });
  });

  it("fails closed when authoritative consent has been revoked or is absent", async () => {
    consentFindFirst.mockResolvedValue(null);

    await expect(
      policy.evaluate(marketingRequest(), marketingContext()),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED", retryable: false });
    expect(suppressionFindFirst).not.toHaveBeenCalled();
  });

  it("requires the recipient to match the granted consent subject", async () => {
    consentFindFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "another-user",
      leadSubmissionId: null,
      customerId: null,
    });

    await expect(
      policy.evaluate(marketingRequest(), marketingContext()),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED", retryable: false });
  });

  it("fails closed when the consent or suppression store is unavailable", async () => {
    suppressionFindFirst.mockRejectedValue(new Error("database unavailable"));

    await expect(policy.evaluate(request(), context())).rejects.toMatchObject({
      code: "DELIVERY_STORE_UNAVAILABLE",
      retryable: true,
    });
  });
});

function request(): CommunicationsSendRequest {
  return {
    version: "v1",
    requestId: "request-communications-policy",
    idempotencyKey: "idempotency-communications-policy",
    channel: "EMAIL",
    purpose: "TRANSACTIONAL",
    dataClassification: "PERSONAL",
    consentRequirement: {
      basis: "TRANSACTIONAL_NECESSITY",
      purposeKey: null,
      consentRecordId: null,
    },
    template: { key: "crm_lead_welcome", version: 1 },
    recipients: [{
      type: "TO",
      address: "Person@Example.com",
      subjectType: "USER",
      subjectId: "subject-user",
    }],
    variables: { fullName: "Person", corporateEmail: "info@example.com" },
    testMode: false,
  };
}

function marketingRequest(): CommunicationsSendRequest {
  return {
    ...request(),
    purpose: "MARKETING",
    consentRequirement: {
      basis: "EXPLICIT_CONSENT",
      purposeKey: "optional_marketing",
      consentRecordId: "11111111-1111-4111-8111-111111111111",
    },
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

function marketingContext(): GatewayRequestContext {
  const value = context();
  return {
    ...value,
    policy: {
      ...value.policy,
      consentVerified: true,
      consentPurposeKeys: ["optional_marketing"],
    },
  };
}
