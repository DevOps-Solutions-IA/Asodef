import type {
  GatewayRequestContext,
  KnowledgeItemContract,
  KnowledgePublicationSnapshotContract,
  KnowledgeVersionContract,
} from "@asodef/connect-contracts";
import {
  AiEvalPolicy,
  type AiEvalResult,
  type AiEvalSuite,
} from "./ai-eval-contracts";
import { KnowledgePublicationPolicy } from "./knowledge-contracts";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const item: KnowledgeItemContract = {
  version: "v1",
  id: "item-1",
  stableKey: "institucional",
  tenantKey: "ASODEF",
  revision: 1,
};
const version: KnowledgeVersionContract = {
  id: "version-1",
  version: 1,
  knowledgeItemId: item.id,
  title: "ASODEF institucional",
  domain: "ASODEF_INSTITUCIONAL",
  audience: "PUBLIC",
  dataClassification: "PUBLIC",
  language: "es",
  status: "PUBLISHED",
  effectiveFrom: "2026-08-01T00:00:00.000Z",
  effectiveUntil: "2026-09-01T00:00:00.000Z",
  revision: 3,
  changeReason: "Publicación aprobada",
  createdAt: "2026-08-20T00:00:00.000Z",
  createdBy: "actor-1",
};
const snapshot: KnowledgePublicationSnapshotContract = {
  version: "v1",
  id: "snapshot-1",
  knowledgeItemId: item.id,
  knowledgeVersionId: version.id,
  knowledgeSourceId: "source-1",
  sourceReference: "https://asodef.com.co/institucional",
  sourceChecksumSha256: "a".repeat(64),
  chunkSetChecksumSha256: "b".repeat(64),
  audience: version.audience,
  dataClassification: version.dataClassification,
  effectiveFrom: version.effectiveFrom,
  effectiveUntil: version.effectiveUntil,
  publishedBy: "actor-2",
  publishedAt: "2026-08-21T00:00:00.000Z",
};
const context: GatewayRequestContext = {
  version: "v1",
  identity: {
    principalType: "KORAL",
    principalId: "koral",
    effectiveActorId: "public-session",
    identityLevel: "AUTHENTICATED",
    permissions: ["knowledge.read"],
  },
  audit: { correlationId: "correlation-1" },
  policy: {
    purpose: "public-assistance",
    consentPurposeKeys: [],
    consentVerified: false,
    piiPolicy: "DENY",
    dataClassification: "PUBLIC",
  },
  effectiveScope: {
    authority: "SERVER_SIDE",
    tenantKey: "ASODEF",
    audience: "PUBLIC",
    organizationIds: [],
    maximumDataClassification: "PUBLIC",
  },
  deadlineAt: "2026-08-24T12:01:00.000Z",
};

describe("Knowledge and AI eval lifecycle contracts", () => {
  const policy = new KnowledgePublicationPolicy();

  it("allows a consistently bound published version in matching server scope", () => {
    expect(() =>
      policy.assertKoralReadable(item, version, snapshot, context, NOW),
    ).not.toThrow();
  });

  it("fails closed for missing, mismatched or ambiguous tenant scope", () => {
    expect(() =>
      policy.assertKoralReadable(
        item,
        version,
        snapshot,
        { ...context, effectiveScope: undefined },
        NOW,
      ),
    ).toThrow("KNOWLEDGE_SERVER_SCOPE_REQUIRED");
    expect(() =>
      policy.assertKoralReadable(
        { ...item, tenantKey: "OTHER" as "ASODEF" },
        version,
        snapshot,
        context,
        NOW,
      ),
    ).toThrow("KNOWLEDGE_TENANT_DENIED");
    expect(() =>
      policy.assertKoralReadable(
        item,
        version,
        snapshot,
        {
          ...context,
          effectiveScope: {
            ...context.effectiveScope!,
            organizationIds: ["org-1", "org-1"],
          },
        },
        NOW,
      ),
    ).toThrow("KNOWLEDGE_ORGANIZATION_SCOPE_UNSUPPORTED");
  });

  it("rejects organization-scoped and deferred company-partner contexts", () => {
    expect(() =>
      policy.assertKoralReadable(
        item,
        version,
        snapshot,
        {
          ...context,
          effectiveScope: {
            ...context.effectiveScope!,
            organizationIds: ["org-1"],
          },
        },
        NOW,
      ),
    ).toThrow("KNOWLEDGE_ORGANIZATION_SCOPE_UNSUPPORTED");
    expect(() =>
      policy.assertKoralReadable(
        item,
        version,
        snapshot,
        {
          ...context,
          effectiveScope: {
            ...context.effectiveScope!,
            audience: "COMPANY_PARTNER",
          },
        },
        NOW,
      ),
    ).toThrow("KNOWLEDGE_AUDIENCE_DENIED");
  });

  it("rejects item/version and version/snapshot binding mismatches", () => {
    expect(() =>
      policy.assertKoralReadable(
        item,
        { ...version, knowledgeItemId: "item-2" },
        snapshot,
        context,
        NOW,
      ),
    ).toThrow("KNOWLEDGE_ITEM_VERSION_MISMATCH");
    expect(() =>
      policy.assertKoralReadable(
        item,
        version,
        { ...snapshot, knowledgeVersionId: "version-2" },
        context,
        NOW,
      ),
    ).toThrow("KNOWLEDGE_PUBLICATION_BINDING_MISMATCH");
  });

  it.each(["DRAFT", "REVIEW", "APPROVED", "RETIRED"] as const)(
    "denies lifecycle status %s",
    (status) => {
      expect(() =>
        policy.assertKoralReadable(
          item,
          { ...version, status },
          snapshot,
          context,
          NOW,
        ),
      ).toThrow("KNOWLEDGE_NOT_PUBLISHED");
    },
  );

  it("denies highly-sensitive, expired and inconsistent evidence", () => {
    const highlySensitive = {
      ...version,
      dataClassification: "HIGHLY_SENSITIVE" as const,
    };
    expect(() =>
      policy.assertKoralReadable(
        item,
        highlySensitive,
        { ...snapshot, dataClassification: "HIGHLY_SENSITIVE" },
        {
          ...context,
          policy: {
            ...context.policy,
            dataClassification: "HIGHLY_SENSITIVE",
          },
          effectiveScope: {
            ...context.effectiveScope!,
            maximumDataClassification: "HIGHLY_SENSITIVE",
          },
        },
        NOW,
      ),
    ).toThrow("KNOWLEDGE_CLASSIFICATION_DENIED");
    expect(() =>
      policy.assertKoralReadable(
        item,
        { ...version, effectiveUntil: NOW.toISOString() },
        { ...snapshot, effectiveUntil: NOW.toISOString() },
        context,
        NOW,
      ),
    ).toThrow("KNOWLEDGE_PUBLICATION_EXPIRED");
    expect(() =>
      policy.assertKoralReadable(
        item,
        version,
        { ...snapshot, audience: "INTERNAL" },
        context,
        NOW,
      ),
    ).toThrow("KNOWLEDGE_PUBLICATION_INCONSISTENT");
  });

  it("keeps the canonical version lifecycle closed", () => {
    expect(() => policy.assertTransition("DRAFT", "REVIEW")).not.toThrow();
    expect(() => policy.assertTransition("DRAFT", "PUBLISHED")).toThrow(
      "INVALID_KNOWLEDGE_TRANSITION",
    );
  });

  it("blocks model publication evidence when a safety dimension fails", () => {
    const evalPolicy = new AiEvalPolicy();
    const suite: AiEvalSuite = {
      id: "suite-1",
      version: 1,
      status: "PUBLISHED",
      caseIds: ["case-1"],
      blockingDimensions: ["PII_LEAKAGE", "JAILBREAK"],
      requiredPassRate: 0.9,
    };
    const result: AiEvalResult = {
      caseId: "case-1",
      caseVersion: 1,
      dimension: "PII_LEAKAGE",
      passed: false,
      score: 0,
      findings: [{ code: "PII_DISCLOSED", severity: "CRITICAL" }],
      modelProfileId: "profile-1",
      modelProfileVersion: 1,
      correlationId: "correlation-1",
    };
    expect(() => evalPolicy.assertPublishable(suite, [result])).toThrow();
  });
});
