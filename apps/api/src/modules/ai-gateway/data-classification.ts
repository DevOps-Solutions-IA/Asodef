import {
  DATA_CLASSIFICATIONS,
  type DataClassification,
} from "@asodef/connect-contracts";

export { DATA_CLASSIFICATIONS, type DataClassification };

const CLASSIFICATION_RANK: Readonly<Record<DataClassification, number>> = {
  PUBLIC: 0,
  INTERNAL: 1,
  PERSONAL: 2,
  SENSITIVE: 3,
  HIGHLY_SENSITIVE: 4,
};

export interface DataClassificationPolicyContract {
  allowed: readonly DataClassification[];
  denied: readonly DataClassification[];
  requirePurpose: boolean;
  requireConsentFor: readonly DataClassification[];
  maximumExternalClassification: DataClassification;
}

export interface DataClassificationDecision {
  allowed: boolean;
  reason:
    | "ALLOWED"
    | "CLASSIFICATION_NOT_ALLOWED"
    | "CLASSIFICATION_EXPLICITLY_DENIED"
    | "CONSENT_REQUIRED"
    | "EXTERNAL_PROVIDER_LIMIT_EXCEEDED"
    | "PURPOSE_REQUIRED";
}

export class DataClassificationPolicy {
  evaluate(
    classification: DataClassification,
    policy: DataClassificationPolicyContract,
    context: {
      purpose?: string;
      consentVerified: boolean;
      externalProvider: boolean;
    },
  ): DataClassificationDecision {
    if (policy.requirePurpose && !context.purpose?.trim())
      return { allowed: false, reason: "PURPOSE_REQUIRED" };
    if (policy.denied.includes(classification))
      return { allowed: false, reason: "CLASSIFICATION_EXPLICITLY_DENIED" };
    if (!policy.allowed.includes(classification))
      return { allowed: false, reason: "CLASSIFICATION_NOT_ALLOWED" };
    if (
      policy.requireConsentFor.includes(classification) &&
      !context.consentVerified
    ) {
      return { allowed: false, reason: "CONSENT_REQUIRED" };
    }
    if (
      context.externalProvider &&
      CLASSIFICATION_RANK[classification] >
        CLASSIFICATION_RANK[policy.maximumExternalClassification]
    ) {
      return { allowed: false, reason: "EXTERNAL_PROVIDER_LIMIT_EXCEEDED" };
    }
    return { allowed: true, reason: "ALLOWED" };
  }

  assertAllowed(
    classification: DataClassification,
    policy: DataClassificationPolicyContract,
    context: {
      purpose?: string;
      consentVerified: boolean;
      externalProvider: boolean;
    },
  ): void {
    const decision = this.evaluate(classification, policy, context);
    if (!decision.allowed)
      throw new Error(`DATA_CLASSIFICATION_DENIED:${decision.reason}`);
  }
}
