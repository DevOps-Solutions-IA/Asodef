import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { AuthService, RateLimitedException } from "./auth.service";
import { AuthCookieService } from "./auth-cookie.service";
import { PasswordRecoveryService } from "./password-recovery.service";
import { PasswordRecoveryErrorCode, PasswordRecoveryException } from "./password-recovery.types";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { buildRequestContext } from "../../common/http/request-context.util";
import type { AuthenticatedRequest, RequestUser } from "./types/request-user.type";
import { AdminMfaService } from "./mfa/admin-mfa.service";
import { VerifyMfaLoginDto } from "./mfa/dto/verify-mfa-login.dto";
import { ConfirmMfaEnrollmentDto } from "./mfa/dto/confirm-mfa-enrollment.dto";
import { BeginMfaEnrollmentDto } from "./mfa/dto/begin-mfa-enrollment.dto";
import { ManageMfaDto } from "./mfa/dto/manage-mfa.dto";
import { MfaException, MfaRequiredException, type MfaErrorCode } from "./mfa/mfa.types";
import { RequireRoles } from "./decorators/roles.decorator";
import { RequireStepUp } from "./decorators/require-step-up.decorator";

const SAFE_RATE_LIMITED_MESSAGE = "Demasiados intentos. Intenta nuevamente más tarde.";

/** Maps the password-recovery domain's safe error codes to HTTP status:
 * token/policy problems are 400 (bad request input), rate limiting is
 * 429, matching the existing RateLimitedException convention below. */
function passwordRecoveryHttpStatus(code: PasswordRecoveryErrorCode): number {
  if (code === PasswordRecoveryErrorCode.RATE_LIMITED) return HttpStatus.TOO_MANY_REQUESTS;
  if (code === PasswordRecoveryErrorCode.CONCURRENT_UPDATE) return HttpStatus.CONFLICT;
  return HttpStatus.BAD_REQUEST;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieService: AuthCookieService,
    private readonly passwordRecoveryService: PasswordRecoveryService,
    private readonly adminMfaService: AdminMfaService,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Cache-Control", "no-store");
    const context = buildRequestContext(request);
    try {
      const result = await this.authService.login(dto, context);
      this.cookieService.setAccessTokenCookie(response, result.accessToken);
      this.cookieService.setRefreshTokenCookie(response, result.rawRefreshToken);
      return { user: result.user };
    } catch (error) {
      if (error instanceof MfaRequiredException) {
        return { mfaRequired: true, challengeToken: error.challengeToken, expiresAt: error.expiresAt };
      }
      if (error instanceof RateLimitedException) {
        throw new HttpException(
          { message: SAFE_RATE_LIMITED_MESSAGE, retryAfterSeconds: error.retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw mapMfaError(error);
    }
  }

  @Public()
  @Post("mfa/verify-login")
  @HttpCode(HttpStatus.OK)
  async verifyMfaLogin(
    @Body() dto: VerifyMfaLoginDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    try {
      const result = await this.authService.completeMfaLogin(dto.challengeToken, dto.code, buildRequestContext(request));
      this.cookieService.setAccessTokenCookie(response, result.accessToken);
      this.cookieService.setRefreshTokenCookie(response, result.rawRefreshToken);
      return { user: result.user };
    } catch (error) {
      throw mapMfaError(error);
    }
  }

  @ApiCookieAuth("asodef_at")
  @Post("step-up")
  @HttpCode(HttpStatus.OK)
  @RequireRoles("SUPER_ADMIN")
  async stepUp(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: ManageMfaDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (!user) throw new HttpException("No autenticado.", HttpStatus.UNAUTHORIZED);
    try {
      return await this.adminMfaService.verifyStepUp(
        user.id,
        user.sessionId,
        dto.password,
        dto.code,
        buildRequestContext(request),
      );
    } catch (error) {
      throw mapMfaError(error);
    }
  }

  @ApiCookieAuth("asodef_at")
  @Get("mfa/status")
  @RequireRoles("SUPER_ADMIN")
  async mfaStatus(@CurrentUser() user: RequestUser | undefined, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Cache-Control", "no-store");
    if (!user) throw new HttpException("No autenticado.", HttpStatus.UNAUTHORIZED);
    try {
      return await this.adminMfaService.getStatus(user.id);
    } catch (error) {
      throw mapMfaError(error);
    }
  }

  @ApiCookieAuth("asodef_at")
  @Post("mfa/enrollment")
  @RequireRoles("SUPER_ADMIN")
  async beginMfaEnrollment(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: BeginMfaEnrollmentDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (!user) throw new HttpException("No autenticado.", HttpStatus.UNAUTHORIZED);
    try {
      return await this.adminMfaService.beginEnrollment(
        user.id,
        user.sessionId,
        dto.password,
        buildRequestContext(request),
      );
    } catch (error) {
      throw mapMfaError(error);
    }
  }

  @ApiCookieAuth("asodef_at")
  @Post("mfa/enrollment/confirm")
  @RequireRoles("SUPER_ADMIN")
  async confirmMfaEnrollment(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: ConfirmMfaEnrollmentDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (!user) throw new HttpException("No autenticado.", HttpStatus.UNAUTHORIZED);
    try {
      return await this.adminMfaService.confirmEnrollment(
        user.id,
        user.sessionId,
        dto.password,
        dto.code,
        buildRequestContext(request),
      );
    } catch (error) {
      throw mapMfaError(error);
    }
  }

  @ApiCookieAuth("asodef_at")
  @Post("mfa/recovery-codes/regenerate")
  @RequireRoles("SUPER_ADMIN")
  @RequireStepUp()
  async regenerateMfaRecoveryCodes(
    @CurrentUser() user: RequestUser | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (!user) throw new HttpException("No autenticado.", HttpStatus.UNAUTHORIZED);
    try {
      return await this.adminMfaService.regenerateRecoveryCodes(user.id, buildRequestContext(request));
    } catch (error) {
      throw mapMfaError(error);
    }
  }

  @ApiCookieAuth("asodef_at")
  @Post("mfa/revoke")
  @HttpCode(HttpStatus.OK)
  @RequireRoles("SUPER_ADMIN")
  @RequireStepUp()
  async revokeMfa(
    @CurrentUser() user: RequestUser | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (!user) throw new HttpException("No autenticado.", HttpStatus.UNAUTHORIZED);
    try {
      await this.adminMfaService.revoke(user.id, buildRequestContext(request));
      return { status: "ok" };
    } catch (error) {
      throw mapMfaError(error);
    }
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const rawRefreshToken = request.cookies?.[this.cookieService.refreshTokenCookieName] as string | undefined;
    const context = buildRequestContext(request);

    try {
      const result = await this.authService.refresh(rawRefreshToken, context);
      this.cookieService.setAccessTokenCookie(response, result.accessToken);
      this.cookieService.setRefreshTokenCookie(response, result.rawRefreshToken);
      return { status: "ok" };
    } catch (error) {
      // A failed refresh always clears whatever auth cookies remain -
      // there is nothing salvageable about the current cookie state.
      this.cookieService.clearAuthCookies(response);
      throw error;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const rawRefreshToken = request.cookies?.[this.cookieService.refreshTokenCookieName] as string | undefined;
    const context = buildRequestContext(request);

    await this.authService.logout(rawRefreshToken, context);
    this.cookieService.clearAuthCookies(response);
    return { status: "ok" };
  }

  // Swagger scheme name matches the default COOKIE_ACCESS_TOKEN_NAME
  // ("asodef_at") - see config/swagger.ts. Decorators are evaluated at
  // class-load time, before env is read, so a deployment that overrides
  // the cookie name will have a (harmless, documentation-only) mismatch
  // here until this literal is updated to match.
  @ApiCookieAuth("asodef_at")
  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: RequestUser | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = buildRequestContext(request);
    // JwtAuthGuard guarantees `user` is defined here (this route is not
    // @Public()); the check exists only to satisfy the type checker.
    if (user) {
      await this.authService.logoutAll(user.id, context);
    }
    this.cookieService.clearAuthCookies(response);
    return { status: "ok" };
  }

  @ApiCookieAuth("asodef_at")
  @Get("me")
  async me(@CurrentUser() user: RequestUser | undefined) {
    if (!user) {
      return null;
    }
    const sessionMetadata = await this.authService.getSessionMetadata(user.sessionId);
    return {
      ...this.authService.toSafeCurrentUser(user),
      session: sessionMetadata,
    };
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: AuthenticatedRequest) {
    return this.passwordRecoveryService.forgotPassword(dto, buildRequestContext(request));
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() request: AuthenticatedRequest) {
    try {
      return await this.passwordRecoveryService.resetPassword(dto, buildRequestContext(request));
    } catch (error) {
      throw mapPasswordRecoveryError(error);
    }
  }

  @ApiCookieAuth("asodef_at")
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @RequireStepUp()
  async changePassword(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: ChangePasswordDto,
    @Req() request: AuthenticatedRequest,
  ) {
    // JwtAuthGuard guarantees `user` is defined here (this route is not
    // @Public()); the check exists only to satisfy the type checker.
    if (!user) {
      throw new HttpException("No autenticado.", HttpStatus.UNAUTHORIZED);
    }
    try {
      return await this.passwordRecoveryService.changePassword(
        user.id,
        user.sessionId,
        dto,
        buildRequestContext(request),
      );
    } catch (error) {
      throw mapPasswordRecoveryError(error);
    }
  }
}

/** Only PasswordRecoveryException gets a bespoke {message, code} mapping;
 * anything else propagates untouched so the global exception filter
 * (US-004) handles it exactly like every other unexpected error. */
function mapPasswordRecoveryError(error: unknown): unknown {
  if (error instanceof PasswordRecoveryException) {
    return new HttpException({ message: error.message, code: error.code }, passwordRecoveryHttpStatus(error.code));
  }
  return error;
}

function mapMfaError(error: unknown): unknown {
  if (!(error instanceof MfaException)) return error;
  const statusByCode: Partial<Record<MfaErrorCode, HttpStatus>> = {
    MFA_ADMIN_ONLY: HttpStatus.FORBIDDEN,
    MFA_PASSWORD_INVALID: HttpStatus.UNAUTHORIZED,
    MFA_CHALLENGE_INVALID: HttpStatus.UNAUTHORIZED,
    MFA_CHALLENGE_EXPIRED: HttpStatus.UNAUTHORIZED,
    MFA_CHALLENGE_USED: HttpStatus.UNAUTHORIZED,
    MFA_ATTEMPTS_EXCEEDED: HttpStatus.TOO_MANY_REQUESTS,
    MFA_ENROLLMENT_REQUIRED: HttpStatus.CONFLICT,
    MFA_ALREADY_ENABLED: HttpStatus.CONFLICT,
    MFA_CONFLICT: HttpStatus.CONFLICT,
  };
  return new HttpException({ code: error.code, message: error.message }, statusByCode[error.code] ?? HttpStatus.BAD_REQUEST);
}
