import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { EnvConfig } from "./env.validation";

export const SWAGGER_PATH = "api/docs";

/**
 * Swagger is a live schema of every route the API exposes - useful in
 * development, but not something a production deployment should serve
 * publicly by default.
 */
export function shouldEnableSwagger(nodeEnv: EnvConfig["NODE_ENV"]): boolean {
  return nodeEnv !== "production";
}

/**
 * US-008 section 2: Swagger must accurately identify authenticated
 * routes. Auth here is an httpOnly cookie, not a Bearer token, so the
 * scheme registered is a cookie apiKey - every route without @Public()
 * requires it, and each such route/controller carries a matching
 * @ApiCookieAuth(accessTokenCookieName) decorator (see auth.controller.ts).
 */
export function setupSwagger(app: INestApplication, appName: string, accessTokenCookieName: string): void {
  const config = new DocumentBuilder()
    .setTitle(`${appName} API`)
    .setDescription("Documentación de la API de la plataforma digital ASODEF")
    .setVersion("1.0")
    .addCookieAuth(accessTokenCookieName, { type: "apiKey", in: "cookie", name: accessTokenCookieName })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document);
}
