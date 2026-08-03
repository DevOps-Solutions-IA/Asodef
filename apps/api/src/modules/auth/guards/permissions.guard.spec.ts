import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";
import type { RequestUser } from "../types/request-user.type";

function buildContext(user?: RequestUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

const BASE_USER: RequestUser = {
  id: "user-1",
  email: "a@example.com",
  fullName: "A",
  status: "ACTIVE",
  roles: ["FINANCE"],
  permissions: ["payments.read", "payments.reconcile"],
  sessionId: "session-1",
};

describe("PermissionsGuard", () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it("allows a route with no @RequirePermissions() metadata at all", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    expect(guard.canActivate(buildContext(BASE_USER))).toBe(true);
  });

  it("allows a user who holds every required permission", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["payments.read"]);
    expect(guard.canActivate(buildContext(BASE_USER))).toBe(true);
  });

  it("requires ALL declared permissions, not just one", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["payments.read", "payments.refund"]);
    expect(() => guard.canActivate(buildContext(BASE_USER))).toThrow(ForbiddenException);
  });

  it("rejects a user missing the required permission", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["users.manage"]);
    expect(() => guard.canActivate(buildContext(BASE_USER))).toThrow(ForbiddenException);
  });

  it("rejects when there is no authenticated user at all (missing authentication)", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["payments.read"]);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });

  it("never leaks which specific permission was missing in the exception message", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["settings.manage"]);
    try {
      guard.canActivate(buildContext(BASE_USER));
      throw new Error("expected canActivate to throw");
    } catch (error) {
      expect((error as ForbiddenException).message).not.toContain("settings.manage");
    }
  });
});
