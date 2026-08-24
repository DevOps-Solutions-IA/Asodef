import {
  resolveKnowledgeAccessScope,
  type KnowledgeAccessScopeInput,
  type KnowledgeAudience,
  type KnowledgeDataClassification,
} from "./knowledge-access-scope";

function input(
  audience: KnowledgeAudience,
  dataClassification: KnowledgeDataClassification,
  subject: { organizationIds?: unknown; affiliateId?: unknown } = {},
): KnowledgeAccessScopeInput {
  return {
    authority: "SERVER_SIDE",
    serverDerivedScope: {
      source: "SERVER_SIDE",
      tenant: "ASODEF",
      audience,
      dataClassification,
      ...subject,
    },
  };
}

describe("resolveKnowledgeAccessScope", () => {
  it.each(["CLIENT", "PROMPT", "TOOL", undefined, null])(
    "rejects %p as tenant authority",
    (authority) => {
      expect(
        resolveKnowledgeAccessScope({
          ...input("PUBLIC", "PUBLIC"),
          authority,
        }),
      ).toMatchObject({ ok: false, error: { code: "UNTRUSTED_AUTHORITY" } });
    },
  );

  it("requires a complete server-derived scope", () => {
    expect(
      resolveKnowledgeAccessScope({ authority: "SERVER_SIDE" }),
    ).toMatchObject({ ok: false, error: { code: "SCOPE_REQUIRED" } });
    expect(
      resolveKnowledgeAccessScope({
        ...input("PUBLIC", "PUBLIC"),
        serverDerivedScope: {
          ...input("PUBLIC", "PUBLIC").serverDerivedScope!,
          source: "PROMPT",
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "UNTRUSTED_SCOPE_SOURCE" } });
  });

  it("denies cross-tenant access even when all other scope values are valid", () => {
    expect(
      resolveKnowledgeAccessScope({
        ...input("ADMIN_ONLY", "HIGHLY_SENSITIVE"),
        serverDerivedScope: {
          ...input("ADMIN_ONLY", "HIGHLY_SENSITIVE").serverDerivedScope!,
          tenant: "OTHER_TENANT",
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "TENANT_DENIED" } });
  });

  it.each([
    ["PUBLIC", "INTERNAL"],
    ["AUTHENTICATED_AFFILIATE", "SENSITIVE"],
    ["INTERNAL", "HIGHLY_SENSITIVE"],
  ] as const)(
    "denies %s access to %s knowledge",
    (audience, classification) => {
      const subject = audience === "AUTHENTICATED_AFFILIATE"
        ? { affiliateId: "affiliate-1" }
        : {};
      expect(
        resolveKnowledgeAccessScope(input(audience, classification, subject)),
      ).toMatchObject({
        ok: false,
        error: { code: "CLASSIFICATION_DENIED" },
      });
    },
  );

  it("accepts only the affiliate identity scope for an authenticated affiliate", () => {
    expect(
      resolveKnowledgeAccessScope(
        input("AUTHENTICATED_AFFILIATE", "PERSONAL", {
          affiliateId: " affiliate-1 ",
        }),
      ),
    ).toEqual({
      ok: true,
      scope: {
        authority: "SERVER_SIDE",
        tenant: "ASODEF",
        audience: "AUTHENTICATED_AFFILIATE",
        dataClassification: "PERSONAL",
        affiliateId: "affiliate-1",
      },
    });
    expect(
      resolveKnowledgeAccessScope(input("AUTHENTICATED_AFFILIATE", "PERSONAL")),
    ).toMatchObject({ ok: false, error: { code: "SUBJECT_SCOPE_INVALID" } });
  });

  it("rejects the deferred company-partner audience and organization authority", () => {
    expect(
      resolveKnowledgeAccessScope({
        authority: "SERVER_SIDE",
        serverDerivedScope: {
          source: "SERVER_SIDE",
          tenant: "ASODEF",
          audience: "COMPANY_PARTNER",
          dataClassification: "INTERNAL",
          organizationIds: ["company-1", "company-2"],
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "AUDIENCE_DENIED" },
    });
  });

  it.each(["PUBLIC", "INTERNAL", "ADMIN_ONLY"] as const)(
    "rejects injected subject scope for tenant-wide audience %s",
    (audience) => {
      const classification =
        audience === "PUBLIC"
          ? "PUBLIC"
          : audience === "INTERNAL"
            ? "INTERNAL"
            : "HIGHLY_SENSITIVE";
      expect(
        resolveKnowledgeAccessScope(
          input(audience, classification, { organizationIds: ["injected"] }),
        ),
      ).toMatchObject({ ok: false, error: { code: "SUBJECT_SCOPE_INVALID" } });
    },
  );

  it("fails closed for unknown audiences and classifications", () => {
    expect(
      resolveKnowledgeAccessScope({
        authority: "SERVER_SIDE",
        serverDerivedScope: {
          source: "SERVER_SIDE",
          tenant: "ASODEF",
          audience: "UNKNOWN",
          dataClassification: "PUBLIC",
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "AUDIENCE_DENIED" } });
    expect(
      resolveKnowledgeAccessScope({
        authority: "SERVER_SIDE",
        serverDerivedScope: {
          source: "SERVER_SIDE",
          tenant: "ASODEF",
          audience: "ADMIN_ONLY",
          dataClassification: "UNKNOWN",
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "CLASSIFICATION_DENIED" } });
  });
});
