import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { SelfServiceModule } from "../../self-service/self-service.module";
import { BingoAdminRealtimeController } from "./bingo-admin-realtime.controller";
import { BingoAffiliateRealtimeController } from "./bingo-affiliate-realtime.controller";
import { BingoOutboxPublisherService } from "./bingo-outbox-publisher.service";
import { BingoPublicRealtimeController } from "./bingo-public-realtime.controller";
import { BingoRealtimeRepository } from "./bingo-realtime.repository";
import { BingoRealtimeStreamService } from "./bingo-realtime-stream.service";
import { BingoRedisFanoutService } from "./bingo-redis-fanout.service";

@Module({
  imports: [AuthModule, SelfServiceModule],
  controllers: [
    BingoPublicRealtimeController,
    BingoAffiliateRealtimeController,
    BingoAdminRealtimeController,
  ],
  providers: [
    BingoRealtimeRepository,
    BingoRedisFanoutService,
    BingoOutboxPublisherService,
    BingoRealtimeStreamService,
  ],
  exports: [BingoOutboxPublisherService, BingoRealtimeStreamService],
})
export class BingoRealtimeModule {}
