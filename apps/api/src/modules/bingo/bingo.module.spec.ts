import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { validateEnv } from "../../config/env.validation";
import { PrismaModule } from "../../database/prisma.module";
import { RedisModule } from "../../common/redis/redis.module";
import { BingoModule } from "./bingo.module";

describe("BingoModule composition", () => {
  it("resolves every native surface while all feature flags remain disabled", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: validateEnv,
        }),
        PrismaModule,
        RedisModule,
        BingoModule,
      ],
    }).compile();

    expect(moduleRef.get(BingoModule)).toBeInstanceOf(BingoModule);
    await moduleRef.close();
  });
});
