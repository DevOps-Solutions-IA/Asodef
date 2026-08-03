import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Opts a route out of the global JwtAuthGuard (registered as APP_GUARD -
 * see AuthModule). The app is deny-by-default: every route requires a
 * valid access token unless explicitly marked @Public(). Use for
 * login/refresh/logout (which authenticate via the refresh cookie
 * instead) and for routes that must never require auth (health checks).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
