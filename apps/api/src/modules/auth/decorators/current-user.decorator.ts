import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest, RequestUser } from "../types/request-user.type";

/** Injects request.user (populated by JwtAuthGuard) into a controller
 * method parameter. Only usable on routes behind the guard (i.e. not
 * @Public()) - request.user is undefined otherwise. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser | undefined => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
});
