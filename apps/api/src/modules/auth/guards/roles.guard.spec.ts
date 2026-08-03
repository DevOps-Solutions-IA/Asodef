import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import type { RequestUser } from "../types/request-user.type";

function buildContext(user?: RequestUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

const ADMIN_USER: RequestUser = {
  id: "user-1",
  email: "admin@example.com",
  fullName: "Admin",
  status: "ACTIVE",
  roles: ["ADMIN"],
  permissions: [],
  sessionId: "session-1",
};

describe("RolesGuard", () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it("allows a route with no @RequireRoles() metadata", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    expect(guard.canActivate(buildContext(ADMIN_USER))).toBe(true);
  });

  it("allows a user holding one of the required roles", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["ADMIN", "SUPER_ADMIN"]);
    expect(guard.canActivate(buildContext(ADMIN_USER))).toBe(true);
  });

  it("rejects ADMIN from a SUPER_ADMIN-only governance route", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["SUPER_ADMIN"]);
    expect(() => guard.canActivate(buildContext(ADMIN_USER))).toThrow(ForbiddenException);
  });

  it("rejects when there is no authenticated user", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["SUPER_ADMIN"]);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });
});
