import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnsupportedMediaTypeException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import type { EnvConfig } from "../../config/env.validation";
import { parseCorsOrigins } from "../../config/cors";

const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class WebChatRequestGuard implements CanActivate {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(config: ConfigService<EnvConfig, true>) {
    this.allowedOrigins = new Set(parseCorsOrigins(config.get("CORS_ORIGIN", { infer: true })));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.header("origin")?.trim();
    const fetchSite = request.header("sec-fetch-site")?.trim().toLowerCase();
    const fetchMode = request.header("sec-fetch-mode")?.trim().toLowerCase();

    if (fetchSite === "cross-site" || fetchMode === "no-cors" || (origin && !this.allowedOrigins.has(origin))) {
      throw new ForbiddenException({ code: "WEB_CHAT_ORIGIN_REJECTED", message: "La solicitud no superó la validación de origen." });
    }
    if (!SAFE_METHODS.has(request.method)) {
      if (!origin || !this.allowedOrigins.has(origin) || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site")) {
        throw new ForbiddenException({ code: "WEB_CHAT_ORIGIN_REQUIRED", message: "La solicitud requiere un origen permitido." });
      }
      if (!JSON_CONTENT_TYPE.test(request.header("content-type")?.trim() ?? "")) {
        throw new UnsupportedMediaTypeException({ code: "WEB_CHAT_JSON_REQUIRED", message: "El chat acepta únicamente JSON estricto." });
      }
    }
    return true;
  }
}
