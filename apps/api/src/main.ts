import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { AppLogger } from "./common/logging/app-logger.service";
import { redactString } from "./common/logging/redact";
import { configureApp } from "./bootstrap-app";
import { shouldEnableSwagger, setupSwagger } from "./config/swagger";
import type { EnvConfig } from "./config/env.validation";

async function bootstrap(): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  const logger = new AppLogger(isProduction);

  // abortOnError: false - without this, a bootstrap failure (e.g. invalid
  // env config) is handled by Nest's own internal teardown, which calls
  // process.exit(1) directly and logs via its own default console logger
  // *before* our AppLogger/redaction is even attached. Disabling it lets
  // the failure surface as a normal rejected promise, handled below by our
  // own redacted, controlled error path instead.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    abortOnError: false,
  });
  app.useLogger(logger);

  configureApp(app);
  app.enableShutdownHooks();

  const configService = app.get(ConfigService<EnvConfig, true>);
  const appName = configService.get("APP_NAME", { infer: true });
  const nodeEnv = configService.get("NODE_ENV", { infer: true });

  if (shouldEnableSwagger(nodeEnv)) {
    const accessTokenCookieName = configService.get("COOKIE_ACCESS_TOKEN_NAME", { infer: true });
    setupSwagger(app, appName, accessTokenCookieName);
  }

  const port = configService.get("API_PORT", { infer: true });
  await app.listen(port);
  logger.log(`${appName} API listening on port ${port} (${nodeEnv})`, "Bootstrap");
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start ASODEF API:\n${redactString(message)}`);
  process.exitCode = 1;
});
