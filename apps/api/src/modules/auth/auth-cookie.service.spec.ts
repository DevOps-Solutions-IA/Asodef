import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import type { CookieOptions, Response } from "express";
import { AuthCookieService } from "./auth-cookie.service";
import { validateEnv } from "../../config/env.validation";

// Response.cookie()/clearCookie() are overloaded in @types/express, which
// makes TypeScript infer an ambiguous (too-narrow) tuple type for
// jest.fn()'s .mock.calls when mocked via `jest.Mocked<Pick<Response, ...>>`.
// Pinning down the exact (name, value, options) signature here keeps the
// mock's call-argument types unambiguous everywhere below.
type CookieSetter = (name: string, value: string, options: CookieOptions) => Response;
type CookieClearer = (name: string, options: CookieOptions) => Response;

interface MockResponse {
  cookie: jest.Mock<ReturnType<CookieSetter>, Parameters<CookieSetter>>;
  clearCookie: jest.Mock<ReturnType<CookieClearer>, Parameters<CookieClearer>>;
}

function mockResponse(): MockResponse {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

async function buildService(envOverrides: Record<string, string>): Promise<AuthCookieService> {
  const original = { ...process.env };
  Object.assign(process.env, envOverrides);

  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv })],
    providers: [AuthCookieService],
  }).compile();

  process.env = original;
  return moduleRef.get(AuthCookieService);
}

describe("AuthCookieService", () => {
  describe("development cookie behavior", () => {
    it("sets secure:false so cookies work over plain http://localhost", async () => {
      const service = await buildService({ NODE_ENV: "development" });
      const response = mockResponse();

      service.setAccessTokenCookie(response as unknown as Response, "raw-access-token");

      const [, , options] = response.cookie.mock.calls[0]!;
      expect(options).toMatchObject({ secure: false, httpOnly: true, sameSite: "strict" });
    });
  });

  describe("production cookie behavior", () => {
    it("sets secure:true so cookies are never sent over plain http", async () => {
      const service = await buildService({ NODE_ENV: "production" });
      const response = mockResponse();

      service.setAccessTokenCookie(response as unknown as Response, "raw-access-token");

      const [, , options] = response.cookie.mock.calls[0]!;
      expect(options).toMatchObject({ secure: true, httpOnly: true, sameSite: "strict" });
    });
  });

  it("always sets httpOnly:true regardless of environment (never readable by client JS)", async () => {
    for (const env of ["development", "production", "test"]) {
      const service = await buildService({ NODE_ENV: env });
      const response = mockResponse();
      service.setRefreshTokenCookie(response as unknown as Response, "raw-refresh-token");
      const [, , options] = response.cookie.mock.calls[0]!;
      expect(options).toMatchObject({ httpOnly: true });
    }
  });

  it("uses configurable cookie names from the environment, not hardcoded strings", async () => {
    const service = await buildService({
      NODE_ENV: "development",
      COOKIE_ACCESS_TOKEN_NAME: "custom_access_name",
      COOKIE_REFRESH_TOKEN_NAME: "custom_refresh_name",
    });
    const response = mockResponse();

    service.setAccessTokenCookie(response as unknown as Response, "token");
    service.setRefreshTokenCookie(response as unknown as Response, "token");

    expect(response.cookie).toHaveBeenNthCalledWith(1, "custom_access_name", "token", expect.anything());
    expect(response.cookie).toHaveBeenNthCalledWith(2, "custom_refresh_name", "token", expect.anything());
  });

  it("scopes the access-token cookie to /api and the refresh-token cookie to /api/v1/auth", async () => {
    const service = await buildService({ NODE_ENV: "development" });
    const response = mockResponse();

    service.setAccessTokenCookie(response as unknown as Response, "token");
    service.setRefreshTokenCookie(response as unknown as Response, "token");

    const [, , accessOptions] = response.cookie.mock.calls[0]!;
    const [, , refreshOptions] = response.cookie.mock.calls[1]!;
    expect(accessOptions).toMatchObject({ path: "/api" });
    expect(refreshOptions).toMatchObject({ path: "/api/v1/auth" });
  });

  it("does not set a Domain attribute when COOKIE_DOMAIN is empty (no hardcoded domain)", async () => {
    const service = await buildService({ NODE_ENV: "production", COOKIE_DOMAIN: "" });
    const response = mockResponse();

    service.setAccessTokenCookie(response as unknown as Response, "token");

    const [, , options] = response.cookie.mock.calls[0]!;
    expect(options).not.toHaveProperty("domain");
  });

  it("clears both auth cookies with matching paths on clearAuthCookies", async () => {
    const service = await buildService({ NODE_ENV: "development" });
    const response = mockResponse();

    service.clearAuthCookies(response as unknown as Response);

    expect(response.clearCookie).toHaveBeenCalledTimes(2);
    const [, accessOptions] = response.clearCookie.mock.calls[0]!;
    const [, refreshOptions] = response.clearCookie.mock.calls[1]!;
    expect(accessOptions).toMatchObject({ path: "/api" });
    expect(refreshOptions).toMatchObject({ path: "/api/v1/auth" });
  });
});
