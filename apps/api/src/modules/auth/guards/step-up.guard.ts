import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { SecurityEventService } from "../../../common/security-events/security-event.service";
import type { EnvConfig } from "../../../config/env.validation";
import { REQUIRE_STEP_UP_KEY } from "../decorators/require-step-up.decorator";
import { SessionService } from "../session.service";
import type { AuthenticatedRequest } from "../types/request-user.type";

const SAFE_STEP_UP_MESSAGE = "Se requiere autenticación reciente para realizar esta acción.";

/**
 * Fail-closed authorization gate for sensitive administrative operations.
 * JwtAuthGuard has already authenticated the request, but this guard reads
 * the server-side session again so client claims can never establish MFA or
 * recent-authentication state.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly securityEventService: SecurityEventService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_STEP_UP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw stepUpRequired();
    }

    const ttlSeconds = this.configService.get("ADMIN_STEP_UP_TTL_SECONDS", { infer: true });
    const now = new Date();
    const notBefore = new Date(now.getTime() - ttlSeconds * 1_000);
    const state = await this.sessionService.findStepUpState(user.sessionId, user.id, now);
    const verified = state?.mfaVerifiedAt != null
      && state.recentAuthenticationAt != null
      && state.mfaVerifiedAt.getTime() >= notBefore.getTime()
      && state.recentAuthenticationAt.getTime() >= notBefore.getTime();

    if (!verified) {
      void this.securityEventService.record({
        type: "AUTHORIZATION_DENIED",
        userId: user.id,
        sessionId: user.sessionId,
        requestId: extractRequestId(request),
        metadata: { reason: "STEP_UP_REQUIRED", path: request.path, method: request.method },
      });
      throw stepUpRequired();
    }

    return true;
  }
}

function stepUpRequired(): HttpException {
  return new HttpException(
    { code: "STEP_UP_REQUIRED", message: SAFE_STEP_UP_MESSAGE },
    HttpStatus.FORBIDDEN,
  );
}

function extractRequestId(request: AuthenticatedRequest): string | null {
  return (request as AuthenticatedRequest & { requestId?: string }).requestId ?? null;
}
