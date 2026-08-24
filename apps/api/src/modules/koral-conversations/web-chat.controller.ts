import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { WEB_CHAT_SESSION_COOKIE } from "./contracts/web-chat.contract";
import { BootstrapWebChatDto } from "./dto/bootstrap-web-chat.dto";
import { ClaimWebChatIdentityDto } from "./dto/claim-web-chat-identity.dto";
import { SendWebChatMessageDto } from "./dto/send-web-chat-message.dto";
import { WebChatHistoryQueryDto } from "./dto/web-chat-history-query.dto";
import { WebChatRequestGuard } from "./web-chat-request.guard";
import { WebChatServerService } from "./web-chat-server.service";

type ContextualRequest = Request & { requestId?: string; correlationId?: string };

@ApiTags("koral-web-chat")
@Public()
@UseGuards(WebChatRequestGuard)
@Controller("koral/web-chat")
export class WebChatController {
  constructor(private readonly webChat: WebChatServerService) {}

  @Post("bootstrap")
  @HttpCode(HttpStatus.OK)
  async bootstrap(
    @Body() _dto: BootstrapWebChatDto,
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.withSecurityHeaders(response, async () => {
      const result = await this.webChat.bootstrap(readCookie(request), request.ip || "unknown", correlationId(request));
      if (result.rawToken) {
        response.cookie(WEB_CHAT_SESSION_COOKIE, result.rawToken, {
          httpOnly: true,
          secure: true,
          sameSite: "strict",
          path: "/",
          maxAge: result.cookieMaxAgeMs,
        });
      }
      return result.snapshot;
    });
  }

  @Get("history")
  async history(
    @Query() query: WebChatHistoryQueryDto,
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.withSecurityHeaders(response, () => this.webChat.history(requiredCookie(request), query.cursor, request.ip || "unknown"));
  }

  @Post("messages")
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Body() dto: SendWebChatMessageDto,
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.withSecurityHeaders(response, () => this.webChat.send(requiredCookie(request), dto, correlationId(request), request.ip || "unknown"));
  }

  @Post("identity/claim")
  @HttpCode(HttpStatus.OK)
  async claimIdentity(
    @Body() dto: ClaimWebChatIdentityDto,
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.withSecurityHeaders(response, () => this.webChat.claim(requiredCookie(request), dto, correlationId(request), request.ip || "unknown"));
  }

  private async withSecurityHeaders<T>(response: Response, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        const body = error.getResponse();
        if (typeof body === "object" && body !== null) {
          const retry = (body as Record<string, unknown>).retryAfterSeconds;
          if (typeof retry === "number" && Number.isFinite(retry) && retry > 0) response.setHeader("Retry-After", Math.ceil(retry));
        }
      }
      if (error instanceof HttpException && error.getStatus() === HttpStatus.UNAUTHORIZED) {
        response.clearCookie(WEB_CHAT_SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
      }
      throw error;
    }
  }
}

function readCookie(request: Request): string | undefined {
  const value: unknown = request.cookies?.[WEB_CHAT_SESSION_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredCookie(request: Request): string {
  const value = readCookie(request);
  if (!value) throw new HttpException({ code: "WEB_CHAT_SESSION_UNAVAILABLE", message: "La sesión del chat no está disponible." }, HttpStatus.UNAUTHORIZED);
  return value;
}

function correlationId(request: ContextualRequest): string {
  return request.correlationId ?? request.requestId ?? randomUUID();
}
