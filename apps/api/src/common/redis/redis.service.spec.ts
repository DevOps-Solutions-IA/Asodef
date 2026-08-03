import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { RedisService } from "./redis.service";
import { validateEnv } from "../../config/env.validation";

describe("RedisService configuration (regression: must be able to reconnect)", () => {
  it("configures a retryStrategy that keeps trying to reconnect, not one that gives up permanently", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv })],
      providers: [RedisService],
    }).compile();

    const app = moduleRef.createNestApplication();
    // Don't call app.init() - we only need the client constructed, and we
    // don't want this unit test depending on Redis actually being reachable.
    const redisService = moduleRef.get(RedisService);
    const options = redisService.getClient().options;

    // A previous version set retryStrategy: () => null, which disables
    // ioredis's automatic reconnection entirely - once a connection drop
    // happened, the client never recovered even after Redis came back,
    // and every future health check/request stayed broken until the whole
    // process was restarted. Guard against that regression here.
    expect(options.retryStrategy).toBeDefined();
    const delayForFirstAttempt = options.retryStrategy?.(1);
    expect(delayForFirstAttempt).not.toBeNull();
    expect(typeof delayForFirstAttempt).toBe("number");

    await app.close();
  });
});
