import { ForbiddenException } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { cookieCsrfMiddleware } from "./cookie-csrf.middleware";

function request(overrides: Partial<Request> = {}): Request {
  const headers = (overrides.headers ?? {}) as Record<string, string>;
  return {
    method: "POST",
    cookies: { asodef_at: "opaque" },
    header: (name: string) => headers[name.toLowerCase()],
    ...overrides,
  } as Request;
}

describe("cookieCsrfMiddleware", () => {
  const middleware = cookieCsrfMiddleware(["https://asodef.com.co"], ["asodef_at", "asodef_rt"]);
  const response = {} as Response;

  it("rejects a cookie-authenticated cross-site mutation", () => {
    const next = jest.fn() as jest.MockedFunction<NextFunction>;
    middleware(request({ headers: { "sec-fetch-site": "cross-site" } }), response, next);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ForbiddenException);
  });

  it("rejects a supplied origin outside the CORS allowlist", () => {
    const next = jest.fn() as jest.MockedFunction<NextFunction>;
    middleware(request({ headers: { origin: "https://attacker.invalid" } }), response, next);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ForbiddenException);
  });

  it("accepts same-origin authenticated mutations", () => {
    const next = jest.fn() as jest.MockedFunction<NextFunction>;
    middleware(request({ headers: { origin: "https://asodef.com.co", "sec-fetch-site": "same-origin" } }), response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("does not interfere with unauthenticated webhooks or login requests", () => {
    const next = jest.fn() as jest.MockedFunction<NextFunction>;
    middleware(request({ cookies: {}, headers: { origin: "https://provider.invalid" } }), response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
