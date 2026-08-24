import { Injectable } from "@nestjs/common";
import type {
  CommunicationAddress,
  CommunicationsSendRequest,
  GatewayRequestContext,
} from "@asodef/connect-contracts";
import { PrismaService } from "../../database/prisma.service";
import { CommunicationsRuntimeError } from "./communications-runtime.error";

export interface ConsentDecision {
  allowed: boolean;
  reasonCode: "NOT_REQUIRED" | "CONSENT_GRANTED";
  consentRecordId: string | null;
}

export interface SuppressionDecision {
  suppressed: boolean;
  reasonCode: "SUPPRESSION_LIST" | "NOT_SUPPRESSED";
}

export interface CommunicationRecipientDecision {
  allowed: boolean;
  reasonCode: "POLICY_ALLOWED" | "SUPPRESSION_LIST";
  consent: ConsentDecision;
  suppression: SuppressionDecision;
}

type ConsentRecord = {
  id: string;
  userId: string | null;
  leadSubmissionId: string | null;
  customerId: string | null;
};

/** Resolves authoritative consent and suppression state. Dependency failures
 * fail closed; request-provided policy claims never replace database state. */
@Injectable()
export class CommunicationRecipientPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    request: CommunicationsSendRequest,
    context: GatewayRequestContext,
  ): Promise<readonly CommunicationRecipientDecision[]> {
    try {
      const consent = await this.resolveConsent(request, context);
      return await Promise.all(
        request.recipients.map(async (recipient) => {
          const suppression = await this.resolveSuppression(request.channel, recipient.address);
          return {
            allowed: !suppression.suppressed,
            reasonCode: suppression.suppressed
              ? "SUPPRESSION_LIST" as const
              : "POLICY_ALLOWED" as const,
            consent,
            suppression,
          };
        }),
      );
    } catch (error) {
      if (error instanceof CommunicationsRuntimeError) throw error;
      throw new CommunicationsRuntimeError("DELIVERY_STORE_UNAVAILABLE", true);
    }
  }

  private async resolveConsent(
    request: CommunicationsSendRequest,
    context: GatewayRequestContext,
  ): Promise<ConsentDecision> {
    if (request.purpose !== "MARKETING") {
      return { allowed: true, reasonCode: "NOT_REQUIRED", consentRecordId: null };
    }

    const requirement = request.consentRequirement;
    if (
      !context.policy.consentVerified ||
      !requirement.consentRecordId ||
      !requirement.purposeKey ||
      !context.policy.consentPurposeKeys.includes(requirement.purposeKey)
    ) {
      throw new CommunicationsRuntimeError("CONSENT_REQUIRED", false);
    }
    const consent = await this.prisma.consentRecord.findFirst({
      where: {
        id: requirement.consentRecordId,
        status: "GRANTED",
        revokedAt: null,
        consentPurpose: { key: requirement.purposeKey },
      },
      select: {
        id: true,
        userId: true,
        leadSubmissionId: true,
        customerId: true,
      },
    });
    if (!consent) throw new CommunicationsRuntimeError("CONSENT_REQUIRED", false);
    if (request.recipients.some((recipient) => !matchesConsentSubject(recipient, consent))) {
      throw new CommunicationsRuntimeError("CONSENT_REQUIRED", false);
    }
    return {
      allowed: true,
      reasonCode: "CONSENT_GRANTED",
      consentRecordId: consent.id,
    };
  }

  private async resolveSuppression(
    channel: CommunicationsSendRequest["channel"],
    address: string,
  ): Promise<SuppressionDecision> {
    const suppressed = await this.prisma.suppressionListEntry.findFirst({
      where: {
        channel: channel.toLowerCase(),
        recipient: { equals: address, mode: "insensitive" },
      },
      select: { id: true },
    });
    return suppressed
      ? { suppressed: true, reasonCode: "SUPPRESSION_LIST" }
      : { suppressed: false, reasonCode: "NOT_SUPPRESSED" };
  }
}

function matchesConsentSubject(
  recipient: CommunicationAddress,
  consent: ConsentRecord,
): boolean {
  if (!recipient.subjectType || !recipient.subjectId) return false;
  const normalized = recipient.subjectType.toUpperCase();
  if (normalized === "USER") return consent.userId === recipient.subjectId;
  if (normalized === "LEAD" || normalized === "LEADSUBMISSION") {
    return consent.leadSubmissionId === recipient.subjectId;
  }
  if (normalized === "CUSTOMER") return consent.customerId === recipient.subjectId;
  return false;
}
