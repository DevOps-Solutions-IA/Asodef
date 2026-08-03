import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { AuthService, RateLimitedException, type RequestContext } from "./auth.service";
import { AuthCookieService } from "./auth-cookie.service";
import { PasswordRecoveryService } from "./password-recovery.service";
import { PasswordRecoveryErrorCode, PasswordRecoveryException } from "./password-recovery.types";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { AuthenticatedRequest, RequestUser } from "./types/request-user.type";

const SAFE_RATE_LIMITED_MESSAGE = "Demasiados intentos. Intenta nuevamente más tarde.";

/** Maps the password-recovery domain's safe error codes to HTTP status:
 * token/policy problems are 400 (bad request input), rate limiting is
 * 429, matching the existing RateLimitedException convention below. */
function passwordRecoveryHttpStatus(code: PasswordRecoveryErrorCode): number {
  return code === PasswordRecoveryErrorCode.RATE_LIMITED ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_REQUEST;
}

function buildRequestContext(request: AuthenticatedRequest): RequestContext {
  const userAgent = request.headers["user-agent"];
  return {
    ipAddress: request.ip ?? null,
    userAgent: typeof userAgent === "string" ? userAgent : null,
    requestId: (request as AuthenticatedRequest & { requestId?: string }).requestId ?? null,
  };
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieService: AuthCookieService,
    private readonly passwordRecoveryService: PasswordRecoveryService,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const context = buildRequestContext(request);
    try {
      const result = await this.authService.login(dto, context);
      this.cookieService.setAccessTokenCookie(response, result.accessToken);
      this.cookieService.setRefreshTokenCookie(response, result.rawRefreshToken);
      return { user: result.user };
    } catch (error) {
      if (error instanceof RateLimitedException) {
        throw new HttpException(
          { message: SAFE_RATE_LIMITED_MESSAGE, retryAfterSeconds: error.retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
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

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
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
