import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { validateEnv } from "./config/env.validation";
import { PrismaModule } from "./database/prisma.module";
import { RedisModule } from "./common/redis/redis.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Production reads real process env vars injected by Docker/systemd,
      // never a stray .env file sitting next to the code - see
      // infrastructure/.../docker-compose.production.yml (later story).
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
