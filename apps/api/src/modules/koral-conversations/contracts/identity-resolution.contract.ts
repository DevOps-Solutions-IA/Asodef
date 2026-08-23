import type { ConversationChannel } from "@prisma/client";
import {
  resolveGatewayIdentityLevel,
  type GatewayIdentityEvidence,
  type MinimumIdentityLevel,
} from "@asodef/connect-contracts";

export const IDENTITY_RESOLUTION_CONTRACT_VERSION = "1.0.0" as const;

export const IDENTITY_ASSURANCE_LEVELS = [
  "ANONYMOUS",
  "CLAIMED",
  "MATCHED",
  "VERIFIED",
  "AUTHENTICATED",
  "STEP_UP_VERIFIED",
] as const;

export type IdentityAssuranceLevel = (typeof IDENTITY_ASSURANCE_LEVELS)[number];

export interface ResolvedChannelIdentity {
  channel: ConversationChannel;
  externalIdentityId: string;
  verified: boolean;
}

export interface VerifiedIdentityAttribute {
  name: string;
  verifiedAt: string;
  source: string;
}

export interface ResolvedIdentityContext {
  version: typeof IDENTITY_RESOLUTION_CONTRACT_VERSION;
  identityId: string;
  contactId?: string;
  portalUserId?: string;
  channelIdentities: readonly ResolvedChannelIdentity[];
  assuranceLevel: IdentityAssuranceLevel;
  authenticationEvidence: GatewayIdentityEvidence;
  consentState: {
    status: "UNKNOWN" | "GRANTED" | "DENIED" | "WITHDRAWN";
    purposeKeys: readonly string[];
    verifiedAt?: string;
  };
  verifiedAttributes: readonly VerifiedIdentityAttribute[];
}

const ASSURANCE_RANK: Readonly<Record<IdentityAssuranceLevel, number>> = {
  ANONYMOUS: 0,
  CLAIMED: 1,
  MATCHED: 2,
  VERIFIED: 3,
  AUTHENTICATED: 4,
  STEP_UP_VERIFIED: 5,
};

export function hasIdentityAssurance(
  actual: IdentityAssuranceLevel,
  required: IdentityAssuranceLevel,
): boolean {
  return ASSURANCE_RANK[actual] >= ASSURANCE_RANK[required];
}

/** Channel claims through VERIFIED are never authentication. AUTHENTICATED
 * and STEP_UP_VERIFIED additionally require explicit server-side evidence. */
export function resolveCanonicalIdentityLevel(
  identity: ResolvedIdentityContext,
): MinimumIdentityLevel | null {
  if (!hasIdentityAssurance(identity.assuranceLevel, "AUTHENTICATED")) {
    return null;
  }
  const resolved = resolveGatewayIdentityLevel(identity.authenticationEvidence);
  if (!resolved) return null;
  if (identity.assuranceLevel === "STEP_UP_VERIFIED") {
    return resolved === "STEP_UP_VERIFIED" ? resolved : null;
  }
  return resolved === "STEP_UP_VERIFIED" ? null : resolved;
}

export const IDENTITY_RESOLUTION_CONTRACT_SEMANTICS = {
  version: IDENTITY_RESOLUTION_CONTRACT_VERSION,
  inputSchema: "CHANNEL_ASSERTIONS_AND_EXISTING_IDENTITY_EVIDENCE",
  outputSchema: "RESOLVED_IDENTITY_CONTEXT",
  errors: ["AMBIGUOUS_IDENTITY", "INSUFFICIENT_EVIDENCE", "CONSENT_UNRESOLVED", "IDENTITY_UNAVAILABLE"],
  permissions: "Resolution may reveal only identifiers and attributes permitted for the current purpose.",
  audit: "Evidence source and assurance changes are auditable; raw credentials and channel secrets are excluded.",
  idempotency: "Resolution is read-only and does not create or merge identities implicitly.",
} as const;
