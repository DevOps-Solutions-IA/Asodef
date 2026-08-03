import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { SecurityEventsModule } from "../../common/security-events/security-events.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { AuthCookieService } from "./auth-cookie.service";
import { SessionService } from "./session.service";
import { LoginAttemptService } from "./login-attempt.service";
import { RateLimiterService } from "./rate-limiter.service";
import { PasswordPolicyService } from "./password-policy/password-policy.service";
import { PasswordResetTokenService } from "./password-reset-token.service";
import { PasswordRecoveryService } from "./password-recovery.service";
import { AccountUnlockService } from "./account-unlock.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { RolesGuard } from "./guards/roles.guard";

@Module({
  imports: [JwtModule.register({}), SecurityEventsModule, NotificationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    AuthCookieService,
    SessionService,
    LoginAttemptService,
    RateLimiterService,
    PasswordPolicyService,
    PasswordResetTokenService,
    PasswordRecoveryService,
    AccountUnlockService,
    // Global, deny-by-default: JwtAuthGuard runs first (populates
    // request.user or throws), then PermissionsGuard/RolesGuard, which
    // each no-op when a route declares no @RequirePermissions()/
    // @RequireRoles() metadata. Mark a route @Public() to skip the first
    // guard entirely (health checks, login/refresh/logout).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, TokenService, SessionService, AccountUnlockService, PasswordResetTokenService, PasswordService, RateLimiterService],
})
export class AuthModule {}
