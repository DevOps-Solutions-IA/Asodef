import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";
import { SecurityEventService } from "../../../common/security-events/security-event.service";
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
  let securityEventService: jest.Mocked<Pick<SecurityEventService, "record">>;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    securityEventService = { record: jest.fn().mockResolvedValue(undefined) };
    guard = new PermissionsGuard(reflector, securityEventService as unknown as SecurityEventService);
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

  it("returns the identical safe message for two different missing permissions (US-008)", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["settings.manage"]);
    let firstMessage: string | undefined;
    try {
      guard.canActivate(buildContext(BASE_USER));
    } catch (error) {
      firstMessage = (error as ForbiddenException).message;
    }

    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["users.manage"]);
    let secondMessage: string | undefined;
    try {
      guard.canActivate(buildContext(BASE_USER));
    } catch (error) {
      secondMessage = (error as ForbiddenException).message;
    }

    expect(firstMessage).toBeDefined();
    expect(firstMessage).toBe(secondMessage);
  });

  it("records an AUTHORIZATION_DENIED security event (internal audit only) when denying access", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["settings.manage"]);
    expect(() => guard.canActivate(buildContext(BASE_USER))).toThrow(ForbiddenException);

    expect(securityEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "AUTHORIZATION_DENIED",
        userId: "user-1",
        metadata: expect.objectContaining({ requiredPermissions: "settings.manage" }),
      }),
    );
  });

  it("does not record any security event when access is allowed", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["payments.read"]);
    guard.canActivate(buildContext(BASE_USER));
    expect(securityEventService.record).not.toHaveBeenCalled();
  });
});
