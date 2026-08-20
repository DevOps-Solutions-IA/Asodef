import { ExecutionContext, HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { SecurityEventService } from "../../../common/security-events/security-event.service";
import type { SessionService } from "../session.service";
import type { RequestUser } from "../types/request-user.type";
import { StepUpGuard } from "./step-up.guard";

const USER: RequestUser = {
  id: "user-1",
  email: "admin@asodef.com.co",
  fullName: "Admin",
  status: "ACTIVE",
  roles: ["SUPER_ADMIN"],
  permissions: [],
  sessionId: "session-1",
};

function context(user?: RequestUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, path: "/critical", method: "POST", requestId: "req-1" }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe("StepUpGuard", () => {
  const now = new Date("2026-08-19T12:00:00.000Z");
  let reflector: Reflector;
  let sessionService: { findStepUpState: jest.Mock };
  let securityEventService: { record: jest.Mock };
  let guard: StepUpGuard;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    reflector = new Reflector();
    sessionService = { findStepUpState: jest.fn() };
    securityEventService = { record: jest.fn().mockResolvedValue(undefined) };
    guard = new StepUpGuard(
      reflector,
      sessionService as unknown as SessionService,
      { get: jest.fn().mockReturnValue(300) } as never,
      securityEventService as unknown as SecurityEventService,
    );
  });

  afterEach(() => jest.useRealTimers());

  it("does not query session assurance when the route has no step-up metadata", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    await expect(guard.canActivate(context(USER))).resolves.toBe(true);
    expect(sessionService.findStepUpState).not.toHaveBeenCalled();
  });

  it("allows a usable session with MFA and recent authentication inside the TTL", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    sessionService.findStepUpState.mockResolvedValue({
      mfaVerifiedAt: new Date("2026-08-19T11:56:00.000Z"),
      recentAuthenticationAt: new Date("2026-08-19T11:56:00.000Z"),
    });

    await expect(guard.canActivate(context(USER))).resolves.toBe(true);
    expect(sessionService.findStepUpState).toHaveBeenCalledWith("session-1", "user-1", now);
  });

  it.each([
    ["missing session", null],
    ["MFA absent", { mfaVerifiedAt: null, recentAuthenticationAt: now }],
    ["recent authentication absent", { mfaVerifiedAt: now, recentAuthenticationAt: null }],
    ["MFA verification expired", {
      mfaVerifiedAt: new Date("2026-08-19T11:54:59.999Z"),
      recentAuthenticationAt: now,
    }],
    ["recent authentication expired", {
      mfaVerifiedAt: now,
      recentAuthenticationAt: new Date("2026-08-19T11:54:59.999Z"),
    }],
  ])("fails closed when %s", async (_case, state) => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    sessionService.findStepUpState.mockResolvedValue(state);

    const rejection = guard.canActivate(context(USER));
    await expect(rejection).rejects.toThrow(HttpException);
    await expect(rejection).rejects.toMatchObject({
      response: { code: "STEP_UP_REQUIRED", message: "Se requiere autenticación reciente para realizar esta acción." },
      status: 403,
    });
    expect(securityEventService.record).toHaveBeenCalledWith(expect.objectContaining({
      type: "AUTHORIZATION_DENIED",
      userId: "user-1",
      sessionId: "session-1",
      metadata: expect.objectContaining({ reason: "STEP_UP_REQUIRED" }),
    }));
  });

  it("fails closed when authentication context is unexpectedly absent", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    await expect(guard.canActivate(context(undefined))).rejects.toMatchObject({
      response: { code: "STEP_UP_REQUIRED", message: "Se requiere autenticación reciente para realizar esta acción." },
      status: 403,
    });
    expect(sessionService.findStepUpState).not.toHaveBeenCalled();
  });
});
