import { ValidationPipe, VersioningType } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { requestIdMiddleware } from "./common/logging/request-id.middleware";
import { parseCorsOrigins } from "./config/cors";
import type { EnvConfig } from "./config/env.validation";

/**
 * Every cross-cutting app-level setting NestFactory.create() doesn't
 * already give us, applied identically whether the caller is main.ts's
 * real bootstrap() or a test building the same app for supertest against
 * the real /api/v1/... paths.
 */
export function configureApp(app: NestExpressApplication): void {
  const configService = app.get(ConfigService<EnvConfig, true>);

  const trustProxy = configService.get("TRUST_PROXY", { infer: true });
  app.set("trust proxy", trustProxy === "true" ? 1 : false);

  app.use(requestIdMiddleware);
  app.use(helmet());
  // Auth tokens live only in httpOnly cookies (never localStorage/
  // sessionStorage/URLs) - cookie-parser is what makes req.cookies exist.
  app.use(cookieParser());

  app.enableCors({
    origin: parseCorsOrigins(configService.get("CORS_ORIGIN", { infer: true })),
    credentials: true,
  });

  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
}
