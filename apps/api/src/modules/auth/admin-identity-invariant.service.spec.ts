import { AdminIdentityInvariantError, AdminIdentityInvariantService } from "./admin-identity-invariant.service";

interface IdentityRow {
  email: string;
  recoveryEmail: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  roles: Array<{ role: { name: string } }>;
}

describe("AdminIdentityInvariantService", () => {
  const official: IdentityRow = {
    email: "admin@asodef.com.co",
    recoveryEmail: "asodefsas@gmail.com",
    status: "ACTIVE",
    roles: [{ role: { name: "SUPER_ADMIN" } }],
  };

  function harness(options: {
    identities?: IdentityRow[];
    privilegedEmails?: string[];
    nodeEnv?: "test" | "production";
  } = {}) {
    const identities = options.identities ?? [official];
    const privilegedEmails = options.privilegedEmails ?? [official.email];
    const findMany = jest.fn()
      .mockResolvedValueOnce(identities)
      .mockResolvedValueOnce(privilegedEmails.map((email) => ({ email })));
    const tx = { user: { findMany } };
    const transaction = jest.fn(async (callback: (client: typeof tx) => Promise<void>, settings: unknown) => {
      expect(settings).toEqual({ isolationLevel: "Serializable" });
      return callback(tx);
    });
    const service = new AdminIdentityInvariantService(
      { $transaction: transaction } as never,
      {
        accountEmail: official.email,
        recoveryEmail: official.recoveryEmail,
        isPrivilegedAdminEmail: (email: string) => email.trim().toLowerCase() === official.email,
        isRecoveryOnlyEmail: (email: string) => email.trim().toLowerCase() === official.recoveryEmail,
      } as never,
      { get: () => options.nodeEnv ?? "production" } as never,
    );
    return { service, transaction };
  }

  it("accepts exactly one ACTIVE official privileged account with its configured recovery channel", async () => {
    const { service } = harness();
    await expect(service.verify()).resolves.toBeUndefined();
    expect(service.getStatus()).toMatchObject({ status: "VERIFIED", verifiedAt: expect.any(String) });
  });

  it.each([
    ["OFFICIAL_ACCOUNT_MISSING", []],
    ["OFFICIAL_ACCOUNT_NOT_ACTIVE", [{ ...official, status: "INACTIVE" }]],
    ["OFFICIAL_RECOVERY_MISMATCH", [{ ...official, recoveryEmail: "mismatch@example.com" }]],
    ["OFFICIAL_PRIVILEGE_MISSING", [{ ...official, roles: [] }]],
  ] as const)("fails closed with sanitized code %s", async (code, identities) => {
    const { service } = harness({ identities: identities as unknown as IdentityRow[] });
    await expect(service.verify()).rejects.toMatchObject({ code });
    expect(service.getStatus()).toEqual({ status: "NOT_VERIFIED", verifiedAt: null });
  });

  it("rejects any second user holding ADMIN or SUPER_ADMIN", async () => {
    const { service } = harness({ privilegedEmails: [official.email, "other@example.com"] });
    await expect(service.verify()).rejects.toMatchObject({ code: "UNAUTHORIZED_PRIVILEGED_IDENTITY" });
  });

  it("rejects a User row for the recovery-only identity even if it has no role", async () => {
    const recoveryIdentity: IdentityRow = {
      email: "asodefsas@gmail.com",
      recoveryEmail: null,
      status: "INACTIVE",
      roles: [],
    };
    const { service } = harness({ identities: [official, recoveryIdentity] });
    await expect(service.verify()).rejects.toMatchObject({ code: "RECOVERY_IDENTITY_EXISTS" });
  });

  it("skips only the lifecycle preflight in NODE_ENV=test, while explicit verify remains available", async () => {
    const { service, transaction } = harness({ nodeEnv: "test" });
    await service.onApplicationBootstrap();
    expect(transaction).not.toHaveBeenCalled();
    await service.verify();
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("runs the fail-closed preflight during a production lifecycle bootstrap", async () => {
    const { service, transaction } = harness({ nodeEnv: "production" });
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(service.getStatus()).toMatchObject({ status: "VERIFIED", verifiedAt: expect.any(String) });
  });

  it("propagates only a sanitized invariant error without configured addresses", () => {
    const error = new AdminIdentityInvariantError("OFFICIAL_ACCOUNT_MISSING");
    expect(error.message).toBe("Administrative identity invariant failed (OFFICIAL_ACCOUNT_MISSING).");
    expect(error.message).not.toContain("@");
  });

  it("fails closed and redacts a concurrent serialization/preflight failure", async () => {
    const { service, transaction } = harness();
    transaction.mockRejectedValueOnce(new Error("P2034 with sensitive database details"));
    await expect(service.verify()).rejects.toMatchObject({
      code: "PREFLIGHT_UNAVAILABLE",
      message: "Administrative identity invariant failed (PREFLIGHT_UNAVAILABLE).",
    });
    expect(service.getStatus()).toEqual({ status: "NOT_VERIFIED", verifiedAt: null });
  });
});
