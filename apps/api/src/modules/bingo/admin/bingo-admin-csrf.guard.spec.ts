import type { ExecutionContext } from "@nestjs/common";

import { BingoAdminCsrfGuard } from "./bingo-admin-csrf.guard";

const config = {
  get: jest.fn((key: string) =>
    key === "CORS_ORIGIN"
      ? "https://asodef.com.co,https://www.asodef.com.co"
      : "https://asodef.com.co",
  ),
};

function context(method: string, headers: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        header: (name: string) => headers[name.toLowerCase()],
      }),
    }),
  } as ExecutionContext;
}

describe("BingoAdminCsrfGuard", () => {
  const guard = new BingoAdminCsrfGuard(config as never);

  it("allows safe reads without an Origin", () => {
    expect(guard.canActivate(context("GET"))).toBe(true);
  });

  it("allows an unsafe same-origin command", () => {
    expect(
      guard.canActivate(
        context("POST", {
          origin: "https://asodef.com.co",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).toBe(true);
  });

  it.each([
    [{}, "missing Origin"],
    [{ origin: "https://evil.example" }, "untrusted Origin"],
    [
      { origin: "https://asodef.com.co", "sec-fetch-site": "cross-site" },
      "cross-site Fetch Metadata",
    ],
  ])("fails closed for %s (%s)", (headers, _description) => {
    expect(() => guard.canActivate(context("POST", headers))).toThrow(
      "Solicitud administrativa no autorizada.",
    );
  });
});
