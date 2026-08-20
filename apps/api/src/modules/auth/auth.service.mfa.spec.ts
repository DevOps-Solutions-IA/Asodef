import { AuthService } from "./auth.service";
import { MfaRequiredException } from "./mfa/mfa.types";

describe("AuthService MFA login boundary", () => {
  it("creates no Session, access token, or login-success event before the required factor", async () => {
    const user = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "admin@asodef.com.co",
      passwordHash: "argon-hash",
      fullName: "Administrator",
      status: "ACTIVE",
      failedLoginAttempts: 0,
      lockedUntil: null,
    };
    const createSession = jest.fn();
    const signAccessToken = jest.fn();
    const record = jest.fn();
    const recordAttempt = jest.fn();
    const registerSuccessfulLogin = jest.fn();
    const service = new AuthService(
      { user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn() } } as never,
      { verify: jest.fn().mockResolvedValue(true), needsRehash: jest.fn().mockReturnValue(false) } as never,
      { signAccessToken } as never,
      { createSession } as never,
      {
        wasLockoutJustExpired: jest.fn().mockReturnValue(false),
        isLocked: jest.fn().mockReturnValue(false),
        recordAttempt,
        registerSuccessfulLogin,
      } as never,
      { record } as never,
      { checkAndIncrement: jest.fn().mockResolvedValue({ limited: false }) } as never,
      { get: jest.fn().mockReturnValue(5) } as never,
      { mayAuthenticate: jest.fn().mockReturnValue(true) } as never,
      {
        isEnforcementRequiredFor: jest.fn().mockReturnValue(true),
        createLoginChallenge: jest.fn().mockResolvedValue({ challengeToken: "opaque-challenge", expiresAt: new Date() }),
      } as never,
    );

    await expect(service.login(
      { email: user.email, password: "valid-password-value" },
      { ipAddress: "203.0.113.8", userAgent: "jest", requestId: "request-1" },
    )).rejects.toBeInstanceOf(MfaRequiredException);
    expect(createSession).not.toHaveBeenCalled();
    expect(signAccessToken).not.toHaveBeenCalled();
    expect(recordAttempt).not.toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(registerSuccessfulLogin).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalledWith(expect.objectContaining({ type: "LOGIN_SUCCEEDED" }));
  });

  it("records a successful login and creates the full session only after MFA verification", async () => {
    const user = {
      id: "00000000-0000-4000-8000-000000000002",
      email: "admin@asodef.com.co",
      passwordHash: "argon-hash",
      fullName: "Administrator",
      status: "ACTIVE",
    };
    const recordAttempt = jest.fn();
    const registerSuccessfulLogin = jest.fn();
    const createSession = jest.fn().mockResolvedValue({
      session: { id: "00000000-0000-4000-8000-000000000003" },
      rawRefreshToken: "raw-refresh-token",
    });
    const signAccessToken = jest.fn().mockReturnValue("access-token");
    const tx = {
      $queryRaw: jest.fn(),
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    };
    const completeLoginChallenge = jest.fn().mockImplementation(
      async (_token: string, _code: string, _context: unknown, writer: (client: typeof tx, verifiedUser: typeof user, at: Date) => unknown) =>
        writer(tx, user, new Date("2026-08-20T12:00:00.000Z")),
    );
    const recordRequired = jest.fn();
    const service = new AuthService(
      {} as never,
      {} as never,
      { signAccessToken } as never,
      { createSession } as never,
      { recordAttempt, registerSuccessfulLogin } as never,
      { record: jest.fn(), recordRequired } as never,
      {} as never,
      {} as never,
      { mayAuthenticate: jest.fn().mockReturnValue(true) } as never,
      { completeLoginChallenge } as never,
    );

    const result = await service.completeMfaLogin("opaque-challenge", "123456", { requestId: "request-2" });
    expect(recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ success: true, userId: user.id }), tx);
    expect(registerSuccessfulLogin).toHaveBeenCalledWith(user.id, tx, expect.any(Date));
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith(
      user.id,
      expect.any(Object),
      tx,
      { mfaVerifiedAt: expect.any(Date), recentAuthenticationAt: expect.any(Date) },
    );
    expect(recordRequired).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ accessToken: "access-token", rawRefreshToken: "raw-refresh-token" });
  });
});
