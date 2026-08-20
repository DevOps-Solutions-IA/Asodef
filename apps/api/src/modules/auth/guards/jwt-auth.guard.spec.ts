import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { TokenService } from "../token.service";
import { PrismaService } from "../../../database/prisma.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SessionService } from "../session.service";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function buildContext(cookies: Record<string, string> = {}): ExecutionContext {
  const request = { cookies, headers: {} };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe("JwtAuthGuard", () => {
  let reflector: Reflector;
  let tokenService: jest.Mocked<Pick<TokenService, "verifyAccessToken">>;
  let prisma: { user: { findUnique: jest.Mock } };
  let configService: { get: jest.Mock };
  let adminIdentityPolicy: { mayAuthenticate: jest.Mock; isPrivilegedAdminEmail: jest.Mock };
  let sessionService: {
    findUsableByIdForUser: jest.Mock;
    touchLastUsedIfUsable: jest.Mock;
  };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    tokenService = { verifyAccessToken: jest.fn() };
    prisma = { user: { findUnique: jest.fn() } };
    configService = {
      get: jest.fn((key: string) => key === "COOKIE_ACCESS_TOKEN_NAME" ? "asodef_at" : false),
    };
    adminIdentityPolicy = {
      mayAuthenticate: jest.fn().mockReturnValue(true),
      isPrivilegedAdminEmail: jest.fn().mockReturnValue(false),
    };
    sessionService = {
      findUsableByIdForUser: jest.fn().mockResolvedValue({ id: "session-1", userId: "user-1" }),
      touchLastUsedIfUsable: jest.fn().mockResolvedValue(undefined),
    };
    guard = new JwtAuthGuard(
      reflector,
      tokenService as unknown as TokenService,
      prisma as unknown as PrismaService,
      configService as never,
      sessionService as unknown as SessionService,
      adminIdentityPolicy as never,
    );
  });

  it("allows a route marked @Public() without checking for a token at all", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    const context = buildContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("rejects a request with no access-token cookie at all (missing authentication)", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    const context = buildContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a malformed/garbage token without leaking why it failed", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    tokenService.verifyAccessToken.mockImplementation(() => {
      throw new Error("jwt malformed");
    });
    const context = buildContext({ asodef_at: "not-a-real-jwt" });

    let caught: unknown;
    try {
      await guard.canActivate(context);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnauthorizedException);
    expect((caught as UnauthorizedException).message).not.toMatch(/jwt malformed/);
  });

  it("rejects a validly-signed token whose user no longer exists", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    tokenService.verifyAccessToken.mockReturnValue({
      sub: "ghost-user-id",
      sid: "session-1",
      iat: nowSeconds(),
      exp: nowSeconds() + 900,
    });
    prisma.user.findUnique.mockResolvedValue(null);
    const context = buildContext({ asodef_at: "a.valid.jwt" });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a valid token for a user whose status is no longer ACTIVE", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    tokenService.verifyAccessToken.mockReturnValue({
      sub: "user-1",
      sid: "session-1",
      iat: nowSeconds(),
      exp: nowSeconds() + 900,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      fullName: "A",
      status: "SUSPENDED",
      roles: [],
    });
    const context = buildContext({ asodef_at: "a.valid.jwt" });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects an access token when its server-side session was revoked, rotated, expired, or belongs to another user", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    tokenService.verifyAccessToken.mockReturnValue({
      sub: "user-1",
      sid: "session-1",
      iat: nowSeconds(),
      exp: nowSeconds() + 900,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      fullName: "A",
      status: "ACTIVE",
      roles: [],
    });
    sessionService.findUsableByIdForUser.mockResolvedValue(null);

    await expect(guard.canActivate(buildContext({ asodef_at: "a.valid.jwt" }))).rejects.toThrow(UnauthorizedException);
    expect(sessionService.findUsableByIdForUser).toHaveBeenCalledWith("session-1", "user-1");
    expect(sessionService.touchLastUsedIfUsable).not.toHaveBeenCalled();
  });

  it("invalidates a password-only official-admin session immediately when MFA enforcement is enabled", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    configService.get.mockImplementation((key: string) => key === "COOKIE_ACCESS_TOKEN_NAME" ? "asodef_at" : true);
    adminIdentityPolicy.isPrivilegedAdminEmail.mockReturnValue(true);
    tokenService.verifyAccessToken.mockReturnValue({
      sub: "user-1", sid: "session-1", iat: nowSeconds(), exp: nowSeconds() + 900,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1", email: "admin@asodef.com.co", fullName: "Admin", status: "ACTIVE", roles: [],
    });
    sessionService.findUsableByIdForUser.mockResolvedValue({
      id: "session-1", userId: "user-1", mfaVerifiedAt: null,
    });

    await expect(guard.canActivate(buildContext({ asodef_at: "a.valid.jwt" })))
      .rejects.toThrow(UnauthorizedException);
    expect(sessionService.touchLastUsedIfUsable).not.toHaveBeenCalled();
  });

  it("accepts an MFA-verified official-admin session after enforcement is enabled", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    configService.get.mockImplementation((key: string) => key === "COOKIE_ACCESS_TOKEN_NAME" ? "asodef_at" : true);
    adminIdentityPolicy.isPrivilegedAdminEmail.mockReturnValue(true);
    tokenService.verifyAccessToken.mockReturnValue({
      sub: "user-1", sid: "session-1", iat: nowSeconds(), exp: nowSeconds() + 900,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1", email: "admin@asodef.com.co", fullName: "Admin", status: "ACTIVE", roles: [],
    });
    sessionService.findUsableByIdForUser.mockResolvedValue({
      id: "session-1", userId: "user-1", mfaVerifiedAt: new Date(),
    });

    await expect(guard.canActivate(buildContext({ asodef_at: "a.valid.jwt" }))).resolves.toBe(true);
  });

  it("populates request.user with safe fields (no password/token hash) for a valid token", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    tokenService.verifyAccessToken.mockReturnValue({
      sub: "user-1",
      sid: "session-1",
      iat: nowSeconds(),
      exp: nowSeconds() + 900,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      fullName: "A User",
      status: "ACTIVE",
      passwordHash: "should-never-leak",
      roles: [
        {
          role: {
            name: "AUDITOR",
            permissions: [{ permission: { key: "audit.read" } }],
          },
        },
      ],
    });
    const request: { cookies: Record<string, string>; headers: Record<string, string>; user?: unknown } = {
      cookies: { asodef_at: "a.valid.jwt" },
      headers: {},
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;

    await guard.canActivate(context);

    expect(request.user).toEqual({
      id: "user-1",
      email: "a@example.com",
      fullName: "A User",
      status: "ACTIVE",
      roles: ["AUDITOR"],
      permissions: ["audit.read"],
      sessionId: "session-1",
    });
    expect(JSON.stringify(request.user)).not.toContain("should-never-leak");
    expect(sessionService.touchLastUsedIfUsable).toHaveBeenCalledWith("session-1", "user-1");
  });

  it("rejects an access token issued before the user's most recent password change (US-007)", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    const tokenIssuedAt = nowSeconds() - 3600; // one hour ago
    tokenService.verifyAccessToken.mockReturnValue({
      sub: "user-1",
      sid: "session-1",
      iat: tokenIssuedAt,
      exp: tokenIssuedAt + 900,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      fullName: "A",
      status: "ACTIVE",
      // Changed *after* the token's iat - the token must now be rejected
      // even though its signature and expiry are both still valid.
      passwordChangedAt: new Date((tokenIssuedAt + 1800) * 1000),
      roles: [],
    });
    const context = buildContext({ asodef_at: "a.valid.jwt" });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("accepts an access token issued after the user's most recent password change", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    const tokenIssuedAt = nowSeconds();
    tokenService.verifyAccessToken.mockReturnValue({
      sub: "user-1",
      sid: "session-1",
      iat: tokenIssuedAt,
      exp: tokenIssuedAt + 900,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      fullName: "A",
      status: "ACTIVE",
      passwordChangedAt: new Date((tokenIssuedAt - 3600) * 1000),
      roles: [],
    });
    const context = buildContext({ asodef_at: "a.valid.jwt" });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("accepts an access token issued in the exact same whole second as passwordChangedAt (iat has only second precision)", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    const sharedSecond = nowSeconds();
    tokenService.verifyAccessToken.mockReturnValue({
      sub: "user-1",
      sid: "session-1",
      iat: sharedSecond,
      exp: sharedSecond + 900,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      fullName: "A",
      status: "ACTIVE",
      // A few hundred milliseconds into the *same* second as iat - must
      // not be rejected just because the sub-second ordering is
      // unknowable from a second-granularity `iat`.
      passwordChangedAt: new Date(sharedSecond * 1000 + 750),
      roles: [],
    });
    const context = buildContext({ asodef_at: "a.valid.jwt" });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("reads the IS_PUBLIC_KEY metadata via getAllAndOverride against both handler and class", async () => {
    const spy = jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    const context = buildContext();

    await guard.canActivate(context);

    expect(spy).toHaveBeenCalledWith(IS_PUBLIC_KEY, expect.any(Array));
  });
});
