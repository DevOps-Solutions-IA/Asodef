import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { SecurityEventService } from "../../../common/security-events/security-event.service";
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
  let securityEventService: jest.Mocked<Pick<SecurityEventService, "record">>;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    securityEventService = { record: jest.fn().mockResolvedValue(undefined) };
    guard = new RolesGuard(reflector, securityEventService as unknown as SecurityEventService);
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

  it("records an AUTHORIZATION_DENIED security event (internal audit only) when denying access", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["SUPER_ADMIN"]);
    expect(() => guard.canActivate(buildContext(ADMIN_USER))).toThrow(ForbiddenException);

    expect(securityEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "AUTHORIZATION_DENIED",
        userId: "user-1",
        metadata: expect.objectContaining({ requiredRoles: "SUPER_ADMIN" }),
      }),
    );
  });

  it("does not record any security event when access is allowed", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["ADMIN"]);
    guard.canActivate(buildContext(ADMIN_USER));
    expect(securityEventService.record).not.toHaveBeenCalled();
  });
});
