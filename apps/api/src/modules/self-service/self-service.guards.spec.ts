import type { ExecutionContext } from "@nestjs/common";
import { SelfServiceCsrfGuard } from "./self-service.guards";

describe("SelfServiceCsrfGuard", () => {
  function contextFor(headers: Record<string, string> = {}) {
    const setHeader = jest.fn();
    const principal = { sessionId: "session" };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ selfService: principal, headers }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    return { context, principal, setHeader };
  }

  it("rejects a mutation without a valid token", async () => {
    const guard = new SelfServiceCsrfGuard({ consumeCsrf: jest.fn(async () => null) } as never);
    const { context } = contextFor();
    await expect(guard.canActivate(context)).rejects.toThrow("Token CSRF no válido.");
  });

  it("consumes the current token and returns the rotated single-use token", async () => {
    const consumeCsrf = jest.fn(async () => "next-csrf");
    const guard = new SelfServiceCsrfGuard({ consumeCsrf } as never);
    const { context, principal, setHeader } = contextFor({ "x-csrf-token": "csrf" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(consumeCsrf).toHaveBeenCalledWith(principal, "csrf");
    expect(setHeader).toHaveBeenCalledWith("x-csrf-token", "next-csrf");
  });
});
