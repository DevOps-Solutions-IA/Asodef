import { ExecutionContext, ForbiddenException, UnsupportedMediaTypeException } from "@nestjs/common";
import { WebChatRequestGuard } from "./web-chat-request.guard";

describe("WebChatRequestGuard", () => {
  const config = { get: jest.fn().mockReturnValue("https://asodef.com.co,https://www.asodef.com.co") };
  const guard = new WebChatRequestGuard(config as never);

  function context(method: string, headers: Record<string, string>): ExecutionContext {
    const request = { method, header: (name: string) => headers[name.toLowerCase()] };
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  }

  it("accepts an exact allowlisted same-origin JSON mutation", () => {
    expect(guard.canActivate(context("POST", {
      origin: "https://asodef.com.co",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json; charset=utf-8",
    }))).toBe(true);
  });

  it("rejects absent/foreign origins and cross-site Fetch Metadata", () => {
    expect(() => guard.canActivate(context("POST", { "content-type": "application/json" }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context("POST", {
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
      "content-type": "application/json",
    }))).toThrow(ForbiddenException);
  });

  it("rejects non-JSON mutation bodies", () => {
    expect(() => guard.canActivate(context("POST", {
      origin: "https://asodef.com.co",
      "sec-fetch-site": "same-site",
      "content-type": "text/plain",
    }))).toThrow(UnsupportedMediaTypeException);
  });
});
